import {test,expect} from "@playwright/test";
import {mkdirSync} from "node:fs";
import catalog from "../assets/animations/sources/kevin-basic-motions-v1.json";

/** Explicit owner /studio/?c63-kevin-review only; not a PR-triggered suite.
 * Captures original-source-backed clips on the actual shared MakeHuman skin. */
test("C6.3 Kevin 24 directional source clips render and seek on real WebGL",async({page},info)=>{
  test.setTimeout(600_000);
  const errors:string[]=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.setViewportSize({width:1100,height:780});
  await page.emulateMedia({reducedMotion:"reduce"});
  await page.goto("/studio/?c63-kevin-review");
  await expect(page.locator("html")).toHaveAttribute("data-studio-ready","true",
    {timeout:180_000});
  await page.locator('[data-section="pose"]').click();
  const prefix="test-results/studio-c6-3-directional/"+info.project.name;
  mkdirSync(prefix,{recursive:true});
  for(const {id,family} of catalog.c63ReviewClips){
    const option=page.locator('#studio-animation-select option[value="'+id+'"]');
    await expect(option).toHaveCount(1);
    await page.locator("#studio-animation-select").selectOption(id);
    await expect(page.locator("#studio-animation-play")).toBeEnabled();
    const duration=Number((await page.locator("#studio-animation-time")
      .getAttribute("max"))??"0");
    expect(duration,id+" duration").toBeGreaterThan(0);
    const rendered:Buffer[]=[];
    for(const view of ["front","side"] as const){
      await page.locator('[data-section="view"]').click();
      await page.locator('[data-view="'+view+'"]').click();
      await page.locator('[data-section="pose"]').click();
      for(const fraction of [.25,.75]){
        await page.locator("#studio-animation-time").evaluate((input,time)=>{
          const element=input as HTMLInputElement;
          element.value=String(time);
          element.dispatchEvent(new Event("input",{bubbles:true}));
        },duration*fraction);
        await page.waitForTimeout(75);
        rendered.push(await page.locator("#studio-viewport canvas").screenshot({
          path:prefix+"/"+id+"-"+view+"-"+fraction+".jpg",type:"jpeg",quality:68,
        }));
      }
    }
    expect(rendered[0]!.equals(rendered[1]!),id+" "+family+" should move").toBe(false);
    await expect(page.locator("#studio-error")).toBeHidden();
  }
  expect(errors).toEqual([]);
});

test("C6.3 directional review clips do not appear in ordinary Studio",async({page})=>{
  await page.goto("/studio/");
  await expect(page.locator("html")).toHaveAttribute("data-studio-ready","true",
    {timeout:180_000});
  for(const entry of catalog.c63ReviewClips)
    await expect(page.locator('#studio-animation-select option[value="'+entry.id+'"]'))
      .toHaveCount(0);
});
