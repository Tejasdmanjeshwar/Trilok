import {afterEach,describe,expect,it,vi} from "vitest";
import {fetchPinnedSourceBytes} from "../scripts/fetch-pinned-source.mjs";

const url="https://raw.githubusercontent.com/example/repo/pinned/data.target";
afterEach(()=>vi.unstubAllGlobals());

describe("Pinned MakeHuman source transport",()=>{
  it("retries an ECONNRESET and returns exactly the upstream bytes",async()=>{
    const original=Buffer.from([0,255,104,105,0,13,10]);
    const request=vi.fn().mockRejectedValueOnce(new Error("read ECONNRESET"))
      .mockResolvedValueOnce(new Response(original,{status:200}));
    vi.stubGlobal("fetch",request);
    expect(await fetchPinnedSourceBytes(url,{retryDelaysMs:[0]}))
      .toEqual(original);
    expect(request).toHaveBeenCalledTimes(2);
  });
  it("retries transient rate limits without using an alternate asset",async()=>{
    const request=vi.fn().mockResolvedValueOnce(new Response(null,{status:429}))
      .mockResolvedValueOnce(new Response("pinned",{status:200}));
    vi.stubGlobal("fetch",request);
    expect((await fetchPinnedSourceBytes(url,{retryDelaysMs:[0]})).toString())
      .toBe("pinned");
    expect(request).toHaveBeenCalledTimes(2);
  });
  it("fails immediately on permanent missing-source responses",async()=>{
    const request=vi.fn().mockResolvedValue(new Response(null,{status:404}));
    vi.stubGlobal("fetch",request);
    await expect(fetchPinnedSourceBytes(url,{retryDelaysMs:[0,0]}))
      .rejects.toThrow("non-retryable");
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("fails after a bounded number of network resets",async()=>{
    const request=vi.fn().mockRejectedValue(new Error("ECONNRESET"));
    vi.stubGlobal("fetch",request);
    await expect(fetchPinnedSourceBytes(url,{retryDelaysMs:[0,0]}))
      .rejects.toThrow("exhausted 3 attempts");
    expect(request).toHaveBeenCalledTimes(3);
  });
});
