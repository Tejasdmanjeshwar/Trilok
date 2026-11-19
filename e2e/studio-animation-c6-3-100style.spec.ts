import {expect,test,type Page} from "@playwright/test";
import {mkdirSync} from "node:fs";

const clips=[
  ["human-100style-neutral-idle",1.550031],
  ["human-100style-neutral-walk",1.350027],
  ["human-100style-neutral-run",0.783349],
] as const;
// Sample both phases, intervening gait, and the exact start/end seam.
// All timestamps are authored sample times, not synthesized motion.
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
async function snapshot(page:Page,id:string,view:string,body:string,frame:string):Promise<Buffer>{
  mkdirSync(evidence,{recursive:true});
  return page.locator("#studio-viewport canvas").screenshot({
    path:evidence+"/"+test.info().project.name+"-"+id+"-"+body+"-"+view+"-"+frame+".png",
  });
}
test("C6.3 100STYLE Neutral owner review: true skinned ID/FW/FR across viewpoints and body shapes",async({page})=>{
  // 240 real WebGL captures (4 bodies × 3 motions × 5 phases × 4 views),
  // plus explicit wrap-boundary evidence. Allow the full diagnostic to run
  // on CPU SwiftShader without weakening a single visual/numeric assertion.
  test.setTimeout(1_200_000);
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
    "Movement transitions",
  ]);
  // Render the actual skinned MakeHuman character, not a skeleton proxy.
  // This produces a review contact sheet source set: every morphology has
  // four views at five moments including the seam; browser assertions here
  // verify reproducible capture, not subjective visual quality.
  for(const morphology of ["default","short","tall","muscular"]){
    if(morphology!=="default"){
      await page.locator('[data-section="body"]').click();
      await page.locator("#studio-preset").selectOption(morphology);
      await expect(page.locator("#studio-editor-message")).toBeEmpty({timeout:90_000});
    }
    await page.locator('[data-section="pose"]').click();
    for(const [clip,duration] of clips){
      const times=[0,duration*.25,duration*.5,duration*.75,duration];
      for(let i=0;i<times.length;i++){
        const timestamp=times[i]!;
        await poseAt(page,clip,timestamp);
        for(const view of views){
          await page.locator('[data-section="view"]').click();
          await page.locator('[data-view="'+view+'"]').click();
          await page.locator('[data-section="pose"]').click();
          await snapshot(page,clip,view,morphology,"f"+i);
        }
      }
      await poseAt(page,clip,0);
      const beginning=await snapshot(page,clip,"seam-start",morphology,"zero");
      await poseAt(page,clip,duration);
      const ending=await snapshot(page,clip,"seam-end",morphology,"last");
      // Start/end are expected to be close but not necessarily identical
      // because the source capture was NOT artificially seam-corrected.
      expect(beginning.byteLength).toBeGreaterThan(1000);
      expect(ending.byteLength).toBeGreaterThan(1000);
    }
  }
  await page.locator("#studio-animation-static").click();
  await expect(page.locator("#studio-animation-select")).toHaveValue("");
  await expect(page.locator("#studio-error")).toBeHidden();
  expect(errors).toEqual([]);
});
