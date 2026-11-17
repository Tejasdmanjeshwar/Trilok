/** Opt-in browser evidence: input-to-two-RAF is a MAIN-THREAD proxy, not
 * a presentation timestamp, GPU frame time, or hardware latency guarantee.
 * Screenshot pixels still require human inspection.
 */
import {test,expect} from "@playwright/test";
import {mkdirSync,writeFileSync} from "node:fs";

type Metrics={
  initialLoadMs:number|null;
  frames:{samples:number;medianMs:number|null;p95Ms:number|null};
  edits:{samples:number;medianMs:number|null;p95Ms:number|null};
  gpu:{geometries:number;textures:number}|null;
  suspended:boolean;
};
const readMetrics=async(page:import("@playwright/test").Page)=>
  page.evaluate(()=>new Promise<Metrics>(resolve=>{
    window.addEventListener("trilok:studio:metrics",
      e=>resolve((e as CustomEvent<Metrics>).detail),{once:true});
    window.dispatchEvent(new Event("trilok:studio:request-metrics"));
  }));
const summary=(samples:readonly number[])=>{
  const sorted=[...samples].sort((a,b)=>a-b);
  const percentile=(p:number)=>sorted[Math.ceil((sorted.length-1)*p)]??null;
  return {n:sorted.length,
    meanMs:sorted.reduce((total,value)=>total+value,0)/Math.max(1,sorted.length),
    medianMs:percentile(.5),p95Ms:percentile(.95),
    maxMs:sorted.at(-1)??null};
};

test("C5.5 integrated weapon transitions, source snapshots and input timing",async({page})=>{
  test.setTimeout(900_000);
  const errors:string[]=[];
  page.on("pageerror",e=>errors.push(e.message));
  await page.goto("/studio/");
  await expect(page.locator("html")).toHaveAttribute("data-studio-ready","true",
    {timeout:90_000});
  await page.getByRole("button",{name:"Pose",exact:true}).click();
  mkdirSync("test-results/c55",{recursive:true});
  const baseline=await readMetrics(page);
  const equipment=page.locator("#studio-sword-hand");
  const transitions:Array<{choice:string;elapsedMs:number;gpu:Metrics["gpu"];
    warning:string}>=[];
  for(const choice of ["right","left","longsword-right","longsword-left",
    "staff-right","staff-left","sword-shield-right","sword-shield-left",
    "bow-left","bow-right","none"] as const){
    const begin=Date.now();
    await equipment.selectOption(choice);
    await expect(equipment).toHaveValue(choice);
    const warning=await page.locator("#studio-edit-status").innerText();
    // Capture unreachable states verbatim rather than silently counting
    // an absent weapon as a successful grip.
    const gpu=(await readMetrics(page)).gpu;
    transitions.push({choice,elapsedMs:Date.now()-begin,gpu,warning});
    await page.screenshot({path:`test-results/c55/${test.info().project.name}-${choice}.png`,
      fullPage:true});
  }
  const sliderObservations:Array<{side:string;amount:number;elapsedMs:number;
    warning:string;gpu:Metrics["gpu"]}>=[];
  for(const side of ["left","right"] as const){
    await equipment.selectOption("bow-"+side);
    const state=page.locator("#studio-archery-state");
    for(const position of ["rest","nock","partial","aim","release"] as const){
      await state.selectOption(position);
      if(position!=="partial")continue;
      const draw=page.locator("#studio-archery-draw");
      for(const amount of [0,25,50,75,100,0,100]){
        const elapsedMs=await draw.evaluate(async(element,value)=>{
          const slider=element as HTMLInputElement;
          const begin=performance.now();
          slider.value=String(value);
          slider.dispatchEvent(new Event("input",{bubbles:true}));
          // Two animation callbacks approximate next rendering opportunity;
          // this does NOT prove the browser has painted or GPU has finished.
          await new Promise<void>(resolve=>requestAnimationFrame(()=>
            requestAnimationFrame(()=>resolve())));
          return performance.now()-begin;
        },amount);
        sliderObservations.push({side,amount,elapsedMs,
          warning:await page.locator("#studio-edit-status").innerText(),
          gpu:(await readMetrics(page)).gpu});
        if([0,25,50,75,100].includes(amount))
          await page.screenshot({
            path:`test-results/c55/${test.info().project.name}-bow-${side}-partial-${amount}.png`,
            fullPage:true});
      }
    }
    // Do not record a transitional full-body camera and call it a close-up.
    // Capture full aim with the actual drawing finger/string contact in view.
    await state.selectOption("aim");
    await page.locator("#studio-sword-focus").click();
    await page.waitForTimeout(700);
    await page.screenshot({
      path:`test-results/c55/${test.info().project.name}-bow-${side}-finger-close.png`,
      fullPage:true});
    await page.locator("#studio-reset").click();
  }
  await equipment.selectOption("none");
  const final=await readMetrics(page);
  // The first pass can initialize lazy GPU textures. A second pass measures
  // repeat-cycle stability instead of incorrectly labeling lazy allocation
  // as a leak or assuming .dispose() proves GPU cleanup.
  for(const choice of ["right","longsword-left","staff-right",
    "sword-shield-left","bow-right","none"] as const){
    await equipment.selectOption(choice);
  }
  const repeatedFinal=await readMetrics(page);
  const report={sha:await page.locator(".studio-build-revision").innerText(),
    project:test.info().project.name,measurement:"Synthetic slider input to second requestAnimationFrame; not browser paint or GPU time",
    baseline,final,repeatedFinal,transitions,slider:sliderObservations,
    sliderSummary:summary(sliderObservations.map(x=>x.elapsedMs)),
    errors};
  writeFileSync(`test-results/c55/${test.info().project.name}-measurements.json`,
    JSON.stringify(report,null,2)+"\n");
  expect(baseline.gpu).not.toBeNull();
  expect(final.gpu).not.toBeNull();
  expect(sliderObservations).toHaveLength(14);
  expect(sliderObservations.every(x=>Number.isFinite(x.elapsedMs))).toBe(true);
  expect(errors).toEqual([]);
});
