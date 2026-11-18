import {test,expect} from "@playwright/test";
import {mkdirSync} from "node:fs";

test("Studio focus, orthographic, pose and inspection preserve customization",async({page})=>{
  test.setTimeout(180_000);
  const errors:string[]=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.goto("/studio/");
  await expect(page.locator("html")).toHaveAttribute("data-studio-ready","true",{timeout:90_000});
  await page.getByRole("button",{name:"View",exact:true}).click();
  const region=page.locator("#studio-focus-area");
  await region.selectOption("face");
  await page.locator("#studio-focus").click();
  await expect(page.locator("#studio-return-focus")).toBeEnabled();
  // Orientation presets must retain an explicitly selected face, even when
  // changing angle before the smooth Focus transition finishes.
  for(const view of ["side","rear","front","three-quarter"]){
    await page.locator('[data-view="'+view+'"]').click();
    await expect(page.locator("#studio-return-focus")).toBeEnabled();
    await expect(region).toHaveValue("face");
  }
  await page.locator("#studio-return-focus").click();
  await expect(page.locator("#studio-return-focus")).toBeDisabled();
  await page.locator("#studio-orthographic").check();
  await page.locator('[data-view="front"]').click();
  await page.locator('[data-view="side"]').click();
  await page.locator('[data-view="rear"]').click();
  await page.locator('[data-view="three-quarter"]').click();
  await page.getByRole("button",{name:"Pose",exact:true}).click();
  await page.locator("#studio-pose-select").selectOption("shoulder");
  await expect(page.locator("#studio-scene-label")).toContainText("Shoulder lift");
  await page.locator("#studio-pose-select").selectOption("knee-stress");
  await page.locator("#studio-pose-select").selectOption("fist");
  await page.locator("#studio-pose-select").selectOption("jaw");
  await page.locator("#studio-expression-select").selectOption("smile");
  await expect(page.locator("#studio-expression-select")).toHaveValue("smile");
  await page.locator("#studio-expression-select").selectOption("neutral");
  await page.getByRole("button",{name:"Inspect",exact:true}).click();
  await page.locator("#studio-inspect-skeleton").check();
  await page.locator("#studio-inspect-wireframe").check();
  await page.locator("#studio-inspect-joints").check();
  await page.locator("#studio-inspect-wireframe").uncheck();
  await page.locator("#studio-inspect-skeleton").uncheck();
  await page.locator("#studio-inspect-joints").uncheck();
  await page.getByRole("button",{name:"Body",exact:true}).click();
  await page.locator("#studio-preset").selectOption("athletic");
  await expect(page.locator("#studio-editor-message")).toBeEmpty({timeout:90_000});
  await page.getByRole("button",{name:"View",exact:true}).click();
  await expect(page.locator("#studio-orthographic")).toBeChecked();
  await page.locator("#studio-reset").click();
  const body=await page.locator("body").innerText();
  expect(body).not.toMatch(/\bC[0-9](?:\.[0-9]+)?\b|laboratory|commit|phase|debug/i);
  expect(await page.locator("body").evaluate(el=>el.scrollWidth<=innerWidth+1)).toBe(true);
  mkdirSync("test-results/studio",{recursive:true});
  await page.screenshot({path:"test-results/studio/"+test.info().project.name+"-inspection.png",fullPage:true});
  expect(errors).toEqual([]);
});

test("Double-tapping the rendered character focuses the hit anatomy and allows angle changes",async({page})=>{
  // Collect stage-by-stage gesture/raycast diagnostics only for this test.
  // On failure the attachment differentiates timing, skin misses and UI failures.
  await page.addInitScript(()=>{
    const stages:unknown[]=[];
    (window as Window & {__studioFocusStages?:unknown[]}).__studioFocusStages=stages;
    window.addEventListener("trilok:studio:surface-focus-diagnostic",event=>{
      stages.push((event as CustomEvent).detail);
    });
  });
  test.setTimeout(150_000);
  await page.goto("/studio/?studio-focus-diagnostics=1");
  await expect(page.locator("html")).toHaveAttribute("data-studio-ready","true",{timeout:90_000});
  const canvas=page.locator("#studio-viewport canvas");
  await expect(canvas).toBeVisible();
  // Studio-ready means the source human is loaded; also let its first
  // browser frame paint before checking the real skinned-surface hit.
  await page.evaluate(()=>new Promise<void>(resolve=>
    requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
  const rect=await canvas.boundingBox();
  expect(rect).not.toBeNull();
  const x=rect!.x+rect!.width/2,y=rect!.y+rect!.height/2;
  if(test.info().project.name.startsWith("touch")){
    await page.touchscreen.tap(x,y);
    await page.touchscreen.tap(x,y);
  }else{
    // dblclick sends two complete pointer sequences, as does a physical double tap.
    await page.mouse.dblclick(x,y,{delay:70});
  }
  try{
    await expect(page.locator("#studio-return-focus")).toBeEnabled({timeout:10_000});
  }catch(error){
    const stages=await page.evaluate(()=>(
      window as Window & {__studioFocusStages?:unknown[]}).__studioFocusStages??[]);
    await test.info().attach("surface-focus-stages",{
      body:Buffer.from(JSON.stringify(stages,null,2)),contentType:"application/json",
    });
    throw error;
  }
  const chosen=await page.locator("#studio-focus-area").inputValue();
  expect(chosen).not.toBe("");
  await page.getByRole("button",{name:"View",exact:true}).click();
  for(const view of ["front","side","rear"]){
    await page.locator('[data-view="'+view+'"]').click();
    await expect(page.locator("#studio-return-focus")).toBeEnabled();
    await expect(page.locator("#studio-focus-area")).toHaveValue(chosen);
  }
  await page.locator("#studio-return-focus").click();
  await expect(page.locator("#studio-return-focus")).toBeDisabled();
  await page.locator("#studio-reset").click();
});
