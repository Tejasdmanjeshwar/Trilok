import { test, expect, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";

const clips=[
  ["human-idle-calibrated",2.5],
  ["human-walk-calibrated",1.3333333730697632],
  ["human-run-calibrated",.9333333373069763],
  ["human-sprint-calibrated",.6666666865348816],
] as const;
async function seek(page:Page,time:number):Promise<void>{
  await page.locator("#studio-animation-time").evaluate((element,value)=>{
    const input=element as HTMLInputElement;
    input.value=String(value);
    input.dispatchEvent(new Event("input",{bubbles:true}));
  },time);
}
async function capture(page:Page,name:string):Promise<Buffer>{
  mkdirSync("test-results/c62-calibrated",{recursive:true});
  return page.locator("#studio-viewport canvas").screenshot({
    path:"test-results/c62-calibrated/"+test.info().project.name+"-"+name+".png",
  });
}
test("calibrated source-backed alternatives render real skin at several views and cycle phases",async({page})=>{
  test.setTimeout(300_000);
  const errors:string[]=[];
  page.on("pageerror",e=>errors.push(e.message));
  await page.emulateMedia({reducedMotion:"reduce"});
  await page.goto("/studio/");
  await expect(page.locator("html")).toHaveAttribute("data-studio-ready","true",{timeout:90_000});
  await page.locator('[data-section="pose"]').click();
  for(const [id,duration] of clips){
    await page.locator("#studio-animation-select").selectOption(id);
    await expect(page.locator("#studio-animation-select")).toHaveValue(id);
    const first=await capture(page,id+"-neutral");
    await seek(page,duration*.25);
    const moved=await capture(page,id+"-quarter");
    expect(first.equals(moved),id+" failed to visibly deform skin").toBe(false);
    for(const [name,t] of [["mid",.5],["late",.75],["seam",.999]] as const){
      await seek(page,duration*t);
      await capture(page,id+"-"+name);
    }
    for(const angle of ["front","side","rear","three-quarter"]){
      await page.locator('[data-section="view"]').click();
      await page.locator('[data-view="'+angle+'"]').click();
      await page.locator('[data-section="pose"]').click();
      await seek(page,duration*.5);
      await capture(page,id+"-"+angle);
    }
  }
  await page.locator("#studio-animation-static").click();
  await expect(page.locator("#studio-animation-select")).toHaveValue("");
  await page.locator("#studio-sword-hand").selectOption("right");
  await expect(page.locator("#studio-error")).toBeHidden();
  expect(errors).toEqual([]);
});
test("calibrated walk on muscular, short, and tall MakeHuman morphologies",async({page})=>{
  test.setTimeout(300_000);
  await page.goto("/studio/");
  await expect(page.locator("html")).toHaveAttribute("data-studio-ready","true",{timeout:90_000});
  for(const preset of ["muscular","short","tall"]){
    await page.locator('[data-section="body"]').click();
    await page.locator("#studio-preset").selectOption(preset);
    await expect(page.locator("#studio-editor-message")).toBeEmpty({timeout:90_000});
    await page.locator('[data-section="pose"]').click();
    await page.locator("#studio-animation-select").selectOption("human-walk-calibrated");
    await seek(page,.4);
    await capture(page,preset+"-walk");
    await page.locator("#studio-animation-static").click();
    await expect(page.locator("#studio-error")).toBeHidden();
  }
});
