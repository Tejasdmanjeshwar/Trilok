import {test,expect,type Page} from "@playwright/test";
import {mkdirSync} from "node:fs";

async function openStudio(page:Page):Promise<void>{
  await page.emulateMedia({reducedMotion:"reduce"});
  await page.goto("/studio/");
  await expect(page.locator("html")).toHaveAttribute("data-studio-ready","true",{timeout:90_000});
  await expect(page.locator("#studio-viewport canvas")).toBeVisible();
  await page.locator('[data-section="pose"]').click();
}
async function seek(page:Page,seconds:number):Promise<void>{
  await page.locator("#studio-animation-time").evaluate((element,value)=>{
    const range=element as HTMLInputElement;
    range.value=String(value);
    range.dispatchEvent(new Event("input",{bubbles:true}));
  },seconds);
}
async function frame(page:Page,name:string):Promise<Buffer>{
  await page.waitForTimeout(130);
  mkdirSync("test-results/studio-c6-2",{recursive:true});
  return page.locator("#studio-viewport canvas").screenshot({
    path:"test-results/studio-c6-2/"+test.info().project.name+"-"+name+".png",
  });
}
test("C6.2 clips visibly deform the existing skinned Studio human and restore C5",async({page})=>{
  test.setTimeout(240_000);
  const errors:string[]=[];
  page.on("pageerror",e=>errors.push(e.message));
  await openStudio(page);
  for(const [id,time] of [["relaxed-idle",.75],["controlled-step",.75],["ready-gesture",1.2]] as const){
    await page.locator("#studio-animation-select").selectOption(id);
    await expect(page.locator("#studio-animation-play")).toBeEnabled();
    const neutral=await frame(page,id+"-neutral");
    await seek(page,time);
    await expect(page.locator("#studio-animation-clock")).toContainText(time.toFixed(2));
    const posed=await frame(page,id+"-posed");
    expect(neutral.equals(posed),id+" should visibly move the source skin").toBe(false);
    for(const angle of ["front","side","rear","three-quarter"]){
      await page.locator('[data-section="view"]').click();
      await page.locator('[data-view="'+angle+'"]').click();
      await page.locator('[data-section="pose"]').click();
      await frame(page,id+"-"+angle);
    }
    await page.locator("#studio-animation-play").click();
    await expect(page.locator("#studio-animation-play")).toHaveText("Pause");
    await page.locator("#studio-animation-play").click();
    await expect(page.locator("#studio-animation-play")).toHaveText("Play");
    await page.locator("#studio-animation-back").click();
    await page.locator("#studio-animation-next").click();
    await page.locator("#studio-animation-speed").selectOption("1.5");
    await page.locator("#studio-animation-loop").uncheck();
    await page.locator("#studio-animation-loop").check();
    await page.locator("#studio-animation-reset").click();
    await expect(page.locator("#studio-animation-clock")).toContainText("0.00 /");
  }
  await page.locator("#studio-animation-static").click();
  await expect(page.locator("#studio-animation-select")).toHaveValue("");
  await page.locator("#studio-pose-select").selectOption("shoulder");
  await page.locator("#studio-sword-hand").selectOption("right");
  await frame(page,"restored-one-hand-sword");
  await expect(page.locator("#studio-error")).toBeHidden();
  expect(errors).toEqual([]);
});
test("C6.2 source playback survives a regenerated human",async({page})=>{
  test.setTimeout(240_000);
  await openStudio(page);
  await page.locator("#studio-animation-select").selectOption("controlled-step");
  await seek(page,.5);
  await page.locator('[data-section="body"]').click();
  await page.locator("#studio-preset").selectOption("muscular");
  await expect(page.locator("#studio-editor-message")).toBeEmpty({timeout:90_000});
  await page.locator('[data-section="pose"]').click();
  await expect(page.locator("#studio-animation-select")).toHaveValue("controlled-step");
  await seek(page,1.25);
  await frame(page,"muscular-step");
  await page.locator("#studio-animation-static").click();
  await expect(page.locator("#studio-error")).toBeHidden();
});
