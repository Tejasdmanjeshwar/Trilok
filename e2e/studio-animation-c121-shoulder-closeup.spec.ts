import {test,expect} from "@playwright/test";
import {mkdirSync} from "node:fs";

/**
 * Issue #121: manual Chromium phase-acceptance evidence only.
 * All captures are WebGL canvas screenshots, not synthesized geometry.
 * Repeat at the SAME viewport, focus, selected pose and timestamps on main
 * and on the candidate to compare baseline and correction.
 * This test never runs on the cheap PR Verify workflow.
 */
test("C121 Kevin Run shoulder close-ups across the exact defect frame",async({page},testInfo)=>{
  test.setTimeout(240_000);
  const errors:string[]=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.setViewportSize({width:1100,height:780});
  await page.emulateMedia({reducedMotion:"reduce"});
  await page.goto("/studio/");
  await expect(page.locator("html")).toHaveAttribute("data-studio-ready","true",
    {timeout:90_000});
  await page.locator('[data-section="pose"]').click();
  await page.locator("#studio-animation-select").selectOption("human-kevin-run");
  await expect(page.locator("#studio-animation-play")).toBeEnabled();
  const output="test-results/studio-c121/"+testInfo.project.name;
  mkdirSync(output,{recursive:true});
  for(const side of ["left","right"] as const){
    await page.locator('[data-section="view"]').click();
    await page.locator("#studio-focus-area").selectOption(side+"-shoulder");
    await page.locator("#studio-focus").click();
    for(const view of ["front","three-quarter","side","rear"] as const){
      await page.locator('[data-view="'+view+'"]').click();
      await page.locator('[data-section="pose"]').click();
      for(const seconds of [0,.15,.30,.40,.45,.48,.50,.51,.52,.54,.57,.60]){
        await page.locator("#studio-animation-time").evaluate((element,value)=>{
          const slider=element as HTMLInputElement;
          slider.value=String(value);
          slider.dispatchEvent(new Event("input",{bubbles:true}));
        },seconds);
        const clock=Number((await page.locator("#studio-animation-clock")
          .textContent())?.split(" / ")[0]);
        expect(Math.abs(clock-seconds),"C121 exact frame "+seconds)
          .toBeLessThan(.015);
        await page.waitForTimeout(70);
        await page.locator("#studio-viewport canvas").screenshot({
          path:output+"/"+side+"-"+view+"-"+seconds.toFixed(2)+".png",
          animations:"disabled",
        });
      }
      await page.locator('[data-section="view"]').click();
    }
  }
  await expect(page.locator("#studio-error")).toBeHidden();
  expect(errors).toEqual([]);
});
