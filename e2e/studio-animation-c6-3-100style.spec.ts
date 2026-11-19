import {expect,test,type Page} from "@playwright/test";
import {mkdirSync} from "node:fs";

const clips=[
  ["human-100style-neutral-idle",.55],
  ["human-100style-neutral-walk",.44],
  ["human-100style-neutral-run",.28],
] as const;
const views=["front","side","rear","three-quarter"] as const;
const evidence="test-results/studio-c6-3-100style";

async function poseAt(page:Page,id:string,time:number):Promise<void>{
  await page.locator("#studio-animation-select").selectOption(id);
  await expect(page.locator("#studio-animation-play")).toBeEnabled();
  await page.locator("#studio-animation-time").evaluate((node,value)=>{
    const input=node as HTMLInputElement;
    input.value=String(value);
    input.dispatchEvent(new Event("input",{bubbles:true}));
  },time);
  await expect(page.locator("#studio-animation-clock")).toContainText(time.toFixed(2));
  await page.evaluate(()=>new Promise<void>(done=>
    requestAnimationFrame(()=>requestAnimationFrame(()=>done()))));
}
async function snapshot(page:Page,id:string,view:string,body:string):Promise<Buffer>{
  mkdirSync(evidence,{recursive:true});
  return page.locator("#studio-viewport canvas").screenshot({
    path:evidence+"/"+test.info().project.name+"-"+id+"-"+body+"-"+view+".png",
  });
}
test("C6.3 100STYLE Neutral owner review: true skinned ID/FW/FR across viewpoints and body shapes",async({page})=>{
  test.setTimeout(360_000);
  const errors:string[]=[];
  page.on("pageerror",e=>errors.push(e.message));
  await page.emulateMedia({reducedMotion:"reduce"});
  await page.goto("/studio/?c63-100style-review");
  await expect(page.locator("html")).toHaveAttribute("data-studio-ready","true",{timeout:90_000});
  await expect(page.locator("#studio-viewport canvas")).toBeVisible();
  await page.locator('[data-section="pose"]').click();
  await expect(page.locator("#studio-animation-select option")).toHaveText([
    "Static pose","Idle","Walk","Jog","Sprint",
    "100STYLE Idle · review","100STYLE Walk · review","100STYLE Run · review",
  ]);
  // The skinned source render, not a skeletal stick diagram, is checked.
  for(const [clip,time] of clips){
    await poseAt(page,clip,0);
    const unposed=await snapshot(page,clip,"baseline","default");
    await poseAt(page,clip,time);
    const posed=await snapshot(page,clip,"posed","default");
    expect(posed.equals(unposed),clip+" must visibly move the actual MakeHuman skin").toBe(false);
    for(const view of views){
      await page.locator('[data-section="view"]').click();
      await page.locator('[data-view="'+view+'"]').click();
      await page.locator('[data-section="pose"]').click();
      await snapshot(page,clip,view,"default");
    }
  }
  // Rebuild each real MakeHuman morphology and keep the same review motions.
  for(const morphology of ["short","tall","muscular"]){
    await page.locator('[data-section="body"]').click();
    await page.locator("#studio-preset").selectOption(morphology);
    await expect(page.locator("#studio-editor-message")).toBeEmpty({timeout:90_000});
    await page.locator('[data-section="pose"]').click();
    for(const [clip,time] of clips){
      await poseAt(page,clip,time);
      await page.locator('[data-section="view"]').click();
      await page.locator('[data-view="front"]').click();
      await page.locator('[data-section="pose"]').click();
      await snapshot(page,clip,"front",morphology);
      await page.locator('[data-section="view"]').click();
      await page.locator('[data-view="side"]').click();
      await page.locator('[data-section="pose"]').click();
      await snapshot(page,clip,"side",morphology);
    }
  }
  await page.locator("#studio-animation-static").click();
  await expect(page.locator("#studio-animation-select")).toHaveValue("");
  await expect(page.locator("#studio-error")).toBeHidden();
  expect(errors).toEqual([]);
});
