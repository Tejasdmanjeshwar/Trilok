import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parsePreviewUrl, verifyPreview } from "../scripts/verify-netlify-preview.mjs";

const dirs: string[] = [];
const deployId="6afeb72fb1959846d9b19079";
const origin="https://"+deployId+"--zingy-buttercream-19a04c.netlify.app";
const siteId="test-netlify-site";
const sha="a".repeat(40);
function fixture(){
  const base=mkdtempSync(join(tmpdir(),"trilok-netlify-private-test-"));
  dirs.push(base);
  mkdirSync(join(base,"studio"));
  writeFileSync(join(base,"build-info.json"),JSON.stringify({commitSha:sha}));
  writeFileSync(join(base,"index.html"),"<html><body>Game</body></html>");
  writeFileSync(join(base,"studio","index.html"),"<html><body>Studio</body></html>");
  writeFileSync(join(base,"release-manifest.json"),"{}");
  return base;
}
function mockFetch(statuses: number[], overrides:Record<string,unknown>={}){
  const calls:{url:string; options:RequestInit}[]=[];
  const fetcher=async (url: string|URL|Request,options: RequestInit={})=>{
    const uri=String(url);
    calls.push({url:uri,options});
    if(uri.startsWith("https://api.netlify.com/")){
      return new Response(JSON.stringify({
        id:deployId,site_id:siteId,state:"ready",deploy_url:origin,...overrides
      }),{status:200,headers:{"content-type":"application/json"}});
    }
    const n=calls.filter(c=>!c.url.startsWith("https://api.netlify.com/")).length-1;
    const status=statuses[n]??500;
    const body=status===200?(n===0?JSON.stringify({commitSha:sha}):"<html>OK</html>"):"protected";
    return new Response(body,{status});
  };
  return {fetcher:fetcher as typeof fetch,calls};
}
const inputs=(dir:string,request:typeof fetch)=>({
  previewUrl:origin,siteId,token:"redacted-test-token",expectedSha:sha,
  staticDir:dir,request
});
afterEach(()=>{for(const dir of dirs.splice(0))rmSync(dir,{recursive:true,force:true});});

describe("private Netlify draft verification",()=>{
  it("requires a unique draft domain without paths or credentials",()=>{
    expect(parsePreviewUrl(origin).deployId).toBe(deployId);
    expect(()=>parsePreviewUrl("https://zingy-buttercream-19a04c.netlify.app")).toThrow();
    expect(()=>parsePreviewUrl(origin+"/studio/")).toThrow();
    expect(()=>parsePreviewUrl("http://"+deployId+"--example.netlify.app")).toThrow();
  });
  it("accepts a ready private exact-site draft only via the management API, never sends token to CDN",async()=>{
    const dir=fixture(),{fetcher,calls}=mockFetch([401,401,401]);
    const result=await verifyPreview(inputs(dir,fetcher));
    expect(result.status).toBe("private-api-ready");
    expect(calls).toHaveLength(4);
    expect(calls[0]?.url).toBe("https://api.netlify.com/api/v1/deploys/"+deployId);
    expect((calls[0]?.options.headers as Record<string,string>).Authorization)
      .toBe("Bearer redacted-test-token");
    for(const call of calls.slice(1)){
      expect(JSON.stringify(call.options)).not.toContain("redacted-test-token");
    }
  });
  it("fully verifies public SHA and both HTML entries",async()=>{
    const dir=fixture(),{fetcher}=mockFetch([200,200,200]);
    expect((await verifyPreview(inputs(dir,fetcher))).status).toBe("public-content-verified");
  });
  it("refuses wrong Netlify site or not-ready deployment",async()=>{
    const dir=fixture();
    await expect(verifyPreview(inputs(dir,mockFetch([401,401,401],{site_id:"other"}).fetcher))).rejects.toThrow("exact ready draft");
    await expect(verifyPreview(inputs(dir,mockFetch([401,401,401],{state:"building"}).fetcher))).rejects.toThrow("exact ready draft");
  });
  it("refuses unexpected CDN status combinations and a wrong local SHA",async()=>{
    const dir=fixture();
    await expect(verifyPreview(inputs(dir,mockFetch([200,401,401]).fetcher))).rejects.toThrow("unexpected/mixed");
    await expect(verifyPreview({...inputs(dir,mockFetch([401,401,401]).fetcher),expectedSha:"b".repeat(40)})).rejects.toThrow("Local immutable");
  });
});
