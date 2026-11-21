import {test,expect,type Page} from "@playwright/test";
import {mkdirSync,writeFileSync} from "node:fs";

type Diagnostic={
  contact:{plantedFeet:number;sampledSoleFeet:number;maxAnchorSlipMeters:number;
    maxPenetrationMeters:number;unreachableFeet:number;pelvisOffsetMeters:number};
  profile:{samples:number;poseMeanMs:number;contactMeanMs:number;mixerMeanMs:number;
    poseMaxMs:number;contactMaxMs:number;mixerMaxMs:number};
};
/** Explicit manual rendered WebGL review only, not normal PR CI. */
async function measured(page:Page):Promise<Diagnostic>{
  const raw=await page.locator("#studio-viewport canvas").getAttribute("data-c63-ground-metrics");
  expect(raw,"C6.3 opt-in instrumentation").toBeTruthy();
  const diagnostics=JSON.parse(raw!) as Diagnostic;
  for(const value of [...Object.values(diagnostics.contact),...Object.values(diagnostics.profile)])
    expect(Number.isFinite(value)).toBe(true);
  expect(diagnostics.contact.sampledSoleFeet,
    "Both actual MakeHuman skinned feet must calibrate").toBe(2);
  expect(Math.abs(diagnostics.contact.pelvisOffsetMeters)).toBeLessThanOrEqual(.03501);
  expect(diagnostics.contact.plantedFeet).toBeGreaterThanOrEqual(0);
  expect(diagnostics.contact.plantedFeet).toBeLessThanOrEqual(2);
  return diagnostics;
}
async function setSpeed(page:Page,value:number):Promise<void>{
  await page.locator("#studio-movement-speed").evaluate((el,next)=>{
    (el as HTMLInputElement).value=String(next);
    el.dispatchEvent(new Event("input",{bubbles:true}));
  },value);
}
test("C6.3 real skinned sole, terrain baseline, pelvis and CPU measurements",async({page},info)=>{
  test.setTimeout(480_000);
  const errors:string[]=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.setViewportSize({width:1100,height:780});
  await page.goto("/studio/?c63-ground-metrics");
  await expect(page.locator("html")).toHaveAttribute("data-studio-ready","true",
    {timeout:180_000});
  await page.locator('[data-section="pose"]').click();
  await page.locator("#studio-animation-select").selectOption("locomotion-preview");
  await expect(page.locator("#studio-movement-settings")).toBeVisible();
  const root="test-results/studio-c6-3-ground/"+info.project.name;
  mkdirSync(root,{recursive:true});
  const measurements:Record<string,Diagnostic>={};
  for(const direction of ["forward","backward","left","right","forward-left"]){
    await page.locator("#studio-movement-direction").selectOption(direction);
    await setSpeed(page,direction==="backward"?.5:.85);
    await page.locator("#studio-animation-play").click();
    await page.waitForTimeout(850);
    measurements[direction]=await measured(page);
    await page.locator("#studio-animation-play").click();
    for(const view of ["front","side","rear","three-quarter"] as const){
      await page.locator('[data-section="view"]').click();
      await page.locator('[data-view="'+view+'"]').click();
      await page.locator('[data-section="pose"]').click();
      await page.locator("#studio-viewport canvas").screenshot({
        path:root+"/"+direction+"-"+view+".jpg",type:"jpeg",quality:75,
      });
    }
    await expect(page.locator("#studio-error")).toBeHidden();
  }
  for(const preset of ["short","tall","muscular"] as const){
    await page.locator('[data-section="body"]').click();
    await page.locator("#studio-preset").selectOption(preset);
    await expect(page.locator("#studio-editor-message")).toBeEmpty({timeout:150_000});
    await page.locator('[data-section="pose"]').click();
    await page.locator("#studio-movement-direction").selectOption("forward");
    await setSpeed(page,.6);
    await page.locator("#studio-animation-play").click();
    await page.waitForTimeout(700);
    measurements[preset]=await measured(page);
    await page.locator("#studio-animation-play").click();
    for(const view of ["front","side","rear","three-quarter"] as const){
      await page.locator('[data-section="view"]').click();
      await page.locator('[data-view="'+view+'"]').click();
      await page.locator('[data-section="pose"]').click();
      await page.locator("#studio-viewport canvas").screenshot({
        path:root+"/"+preset+"-"+view+".jpg",type:"jpeg",quality:75,
      });
    }
    await expect(page.locator("#studio-error")).toBeHidden();
  }
  writeFileSync(root+"/measurements.json",JSON.stringify(measurements,null,2));
  expect(errors).toEqual([]);
});
