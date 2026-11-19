import {afterEach,describe,expect,it} from "vitest";
import {chmodSync,mkdtempSync,mkdirSync,readFileSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,resolve} from "node:path";
import {spawnSync} from "node:child_process";

const deployScript=resolve("scripts/deploy-netlify-static.sh");
const dirs:string[]=[];
function runDeployment(options:{failure?:boolean,missingToken?:boolean}={}){
  const dir=mkdtempSync(join(tmpdir(),"trilok-isolated-netlify-"));dirs.push(dir);
  const files=join(dir,"static");
  const bin=join(dir,"fake-bin");
  mkdirSync(files);mkdirSync(bin);
  writeFileSync(join(files,"release-manifest.json"),"{}");
  const stub=join(bin,"npx");
  writeFileSync(stub,`#!/usr/bin/env bash
if [[ "$*" == *"--version"* ]]; then
  echo "netlify-cli/27.10.1"
  exit 0
fi
printf '%s\\n' "$PWD" > "$TEST_CWD"
printf '%s\\n' "$@" > "$TEST_ARGS"
if [[ "\${TEST_FAIL:-}" == "1" ]]; then exit 7; fi
echo '{"deploy_url":"https://draft--example.netlify.app"}'
`);
  chmodSync(stub,0o755);
  const argsPath=join(dir,"args");
  const cwdPath=join(dir,"cwd");
  const resultPath=join(dir,"netlify.json");
  const env={
    ...process.env,
    PATH:bin+":"+process.env.PATH,
    RUNNER_TEMP:dir,
    NETLIFY_SITE_ID:"test-site-id",
    NETLIFY_AUTH_TOKEN:options.missingToken?"":"test-secret-token",
    TEST_ARGS:argsPath,
    TEST_CWD:cwdPath,
    TEST_FAIL:options.failure?"1":"0",
  };
  const result=spawnSync("bash",[deployScript,files,resultPath],{
    env,encoding:"utf8",timeout:15000,
  });
  return {
    result,
    args:result.status===0||options.failure?readFileSync(argsPath,"utf8").split("\n").filter(Boolean):[],
    cwd:result.status===0||options.failure?readFileSync(cwdPath,"utf8").trim():"",
    dir,files,
    json:result.status===0?readFileSync(resultPath,"utf8"):"",
  };
}
afterEach(()=>{for(const d of dirs.splice(0))rmSync(d,{recursive:true,force:true});});
describe("isolated bounded Netlify preview uploader",()=>{
  it("runs in a clean temp directory with verified absolute artifact and draft-only flags",()=>{
    const {result,args,cwd,files,dir,json}=runDeployment();
    expect(result.status).toBe(0);
    expect(cwd.startsWith(dir)).toBe(true);
    expect(cwd).not.toBe(process.cwd());
    expect(args).toContain("deploy");
    expect(args).toContain("--no-build");
    expect(args).toContain("--dir");
    expect(args).toContain(files);
    expect(args).toContain("--site");
    expect(args).toContain("test-site-id");
    expect(args).toContain("--timeout");
    expect(args).toContain("180");
    expect(args).toContain("--json");
    expect(args).not.toContain("--prod");
    expect(args).not.toContain("--filter");
    expect(json).toContain("draft--example.netlify.app");
    expect(result.stdout).toContain("Starting isolated Netlify draft upload");
  });
  it("propagates upload failures without claiming deployment success",()=>{
    const {result}=runDeployment({failure:true});
    expect(result.status).toBe(7);
    expect(result.stderr).toContain("draft upload failed");
    expect(result.stdout).not.toContain("checking URL and live build identity next");
  });
  it("rejects missing Netlify credentials before invoking CLI",()=>{
    const {result}=runDeployment({missingToken:true});
    expect(result.status).toBe(2);
    expect(result.stderr).toContain("Netlify preview environment");
  });
  it("keeps explicit CLI and outer hard timeouts",()=>{
    const script=readFileSync(deployScript,"utf8");
    expect(script).toContain("timeout --signal=TERM --kill-after=10s 120s");
    expect(script).toContain("timeout --signal=TERM --kill-after=10s 300s");
    expect(script).toContain("npx --yes netlify-cli@27.10.1 deploy");
    expect(script).toContain("--timeout 180 --json");
    expect(script).not.toContain("--prod");
    expect(script).not.toContain("--build");
  });
});
