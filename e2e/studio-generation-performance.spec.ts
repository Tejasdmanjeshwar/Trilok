import {test,expect} from "@playwright/test";
import {mkdirSync,writeFileSync} from "node:fs";

test("record real random-generation latency and resource timings for three seeds",async({page})=>{
  test.setTimeout(540_000);
  const navigationStarted=Date.now();
  await page.goto("/studio/");
  await expect(page.locator("html")).toHaveAttribute("data-studio-ready","true",
    {timeout:120_000});
  const startupMs=Date.now()-navigationStarted;
  await page.getByRole("button",{name:"Generate",exact:true}).click();
  const captures:unknown[]=[];
  for(const seed of [2694905601,1729,42]){
    const input=page.locator("#studio-generator-seed");
    await input.fill(String(seed));
    const started=Date.now();
    await page.locator("#studio-generator-seed-create").click();
    await expect(page.locator("#studio-generator-feedback"))
      .toContainText("Character generated from seed "+seed,{timeout:180_000});
    // Wait for at least one composited canvas submission after model swap.
    await page.evaluate(()=>new Promise<void>(resolve=>
      requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
    const elapsedMs=Date.now()-started;
    const diagnostics=await page.evaluate(()=>new Promise<unknown>(resolve=>{
      window.addEventListener("trilok:studio:metrics",
        (event)=>resolve((event as CustomEvent).detail),{once:true});
      window.dispatchEvent(new Event("trilok:studio:request-metrics"));
    }));
    captures.push({seed,elapsedMs,diagnostics});
  }
  const resources=await page.evaluate(()=>performance.getEntriesByType("resource")
    .filter(e=>e.name.includes("/anatomy/"))
    .map(e=>({name:new URL(e.name).pathname,durationMs:e.duration,
      transferSize:(e as PerformanceResourceTiming).transferSize,
      decodedBodySize:(e as PerformanceResourceTiming).decodedBodySize})));
  mkdirSync("test-results/studio",{recursive:true});
  writeFileSync("test-results/studio/random-generation-performance-"+test.info().project.name+".json",
    JSON.stringify({startupMs,captures,resources,project:test.info().project.name},null,2));
  expect(captures).toHaveLength(3);
  for(const item of captures as Array<{elapsedMs:number;diagnostics:{
    generations:readonly unknown[]}}>) {
    expect(item.elapsedMs).toBeGreaterThan(0);
    expect(item.diagnostics.generations.length).toBeGreaterThan(0);
  }
});
