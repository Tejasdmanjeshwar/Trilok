import {test,expect,type Page} from "@playwright/test";
import {mkdirSync} from "node:fs";

/**
 * Manual-only C6.3 Step 2 WebGL check. The 24 previously owner-reviewed
 * Kevin clips are demand-loaded by normal Studio's Movement transitions;
 * no ZIP upload, gameplay root travel or normal solo-menu expansion.
 */
async function speed(page:Page,value:number):Promise<void>{
  await page.locator("#studio-movement-speed").evaluate((el,next)=>{
    const slider=el as HTMLInputElement;
    slider.value=String(next);
    slider.dispatchEvent(new Event("input",{bubbles:true}));
  },value);
}
test("C6.3 normal Studio demand-loads owner-approved Kevin 2D movement and turns",async({page},info)=>{
  test.setTimeout(360_000);
  const errors:string[]=[];
  page.on("pageerror",e=>errors.push(e.message));
  await page.setViewportSize({width:1100,height:780});
  await page.emulateMedia({reducedMotion:"reduce"});
  await page.goto("/studio/");
  await expect(page.locator("html")).toHaveAttribute("data-studio-ready","true",
    {timeout:180_000});
  await page.locator('[data-section="pose"]').click();
  await expect(page.locator('#studio-animation-select option[value="human-kevin-walk-backward"]'))
    .toHaveCount(0);
  await page.locator("#studio-animation-select").selectOption("locomotion-preview");
  await expect(page.locator("#studio-animation-play")).toBeEnabled({timeout:60_000});
  await expect(page.locator("#studio-movement-settings")).toBeVisible();
  const direction=page.locator("#studio-movement-direction");
  const allowed=[
    "forward","forward-left","forward-right","backward",
    "backward-left","backward-right","left","right",
    "turn-left","turn-right",
  ] as const;
  await expect(direction.locator("option")).toHaveCount(allowed.length);
  const prefix="test-results/studio-c6-3-locomotion/"+info.project.name;
  mkdirSync(prefix,{recursive:true});
  let count=0;
  for(const name of allowed){
    await direction.selectOption(name);
    if(name.startsWith("turn-")){
      await expect(page.locator("#studio-movement-speed")).toBeDisabled();
    }else{
      await expect(page.locator("#studio-movement-speed")).toBeEnabled();
      await speed(page,name.startsWith("backward")?.55:.83);
      await expect(page.locator("#studio-movement-speed")).toHaveValue(
        String(name.startsWith("backward")?.55:.83));
    }
    await page.locator("#studio-animation-play").click();
    await expect(page.locator("#studio-animation-play")).toHaveText("Pause");
    await page.waitForTimeout(650);
    await page.locator("#studio-animation-play").click();
    await expect(page.locator("#studio-animation-play")).toHaveText("Play");
    for(const view of ["front","side"] as const){
      await page.locator('[data-section="view"]').click();
      await page.locator('[data-view="'+view+'"]').click();
      await page.locator('[data-section="pose"]').click();
      await page.locator("#studio-viewport canvas").screenshot({
        path:prefix+"/"+name+"-"+view+".jpg",type:"jpeg",quality:70,
      });
      count++;
    }
    await expect(page.locator("#studio-error")).toBeHidden();
  }
  expect(count).toBe(20);
  // Reject an un-authored backward sprint, do not silently relabel it.
  await direction.selectOption("backward");
  await speed(page,.95);
  await expect(page.locator("#studio-movement-speed")).toHaveValue("0.65");
  await page.locator("#studio-animation-static").click();
  await expect(page.locator("#studio-animation-select")).toHaveValue("");
  await expect(page.locator("#studio-error")).toBeHidden();
  expect(errors).toEqual([]);
});
