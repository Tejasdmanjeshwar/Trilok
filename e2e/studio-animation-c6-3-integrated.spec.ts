import {test,expect} from "@playwright/test";

/** C6.3: Player Studio never requests the development-time Kevin archive. */
test("C6.3 keeps UAL1 functional without a player ZIP import route",async({page})=>{
  test.setTimeout(180_000);
  await page.emulateMedia({reducedMotion:"reduce"});
  await page.goto("/studio/");
  await expect(page.locator("html")).toHaveAttribute("data-studio-ready","true",
    {timeout:90_000});
  await page.locator('[data-section="pose"]').click();
  await expect(page.locator("#studio-kevin-local")).toHaveCount(0);
  await expect(page.locator("#studio-kevin-file")).toHaveCount(0);
  await expect(page.locator('input[type="file"]')).toHaveCount(0);
  for(const id of ["human-idle","human-walk","human-jog","human-sprint"])
    await expect(page.locator('#studio-animation-select option[value="'+id+'"]')).toHaveCount(1);
  await page.locator("#studio-animation-select").selectOption("human-walk");
  await expect(page.locator("#studio-animation-play")).toBeEnabled();
  await expect(page.locator("#studio-error")).toBeHidden();
});


/** Browser-real skin and camera captures for owner approval, never generated curves. */
test("C6.3 Kevin Idle Walk Run render across their cycles, front and side",async({page})=>{
  test.setTimeout(240_000);
  const errors:string[]=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.setViewportSize({width:1100,height:780});
  await page.emulateMedia({reducedMotion:"reduce"});
  await page.goto("/studio/");
  await expect(page.locator("html")).toHaveAttribute("data-studio-ready","true",
    {timeout:90_000});
  await page.locator('[data-section="pose"]').click();
  for(const [id,duration] of [
    ["human-kevin-idle",2.7],["human-kevin-walk",.8],["human-kevin-run",.6],
  ] as const){
    await expect(page.locator('#studio-animation-select option[value="'+id+'"]')).toHaveCount(1);
    await page.locator("#studio-animation-select").selectOption(id);
    await expect(page.locator("#studio-animation-play")).toBeEnabled();
    const frames:Buffer[]=[];
    for(const view of ["front","side"] as const){
      await page.locator('[data-section="view"]').click();
      await page.locator('[data-view="'+view+'"]').click();
      await page.locator('[data-section="pose"]').click();
      for(const fraction of [0,.25,.5,.75] as const){
        const time=duration*fraction;
        await page.locator("#studio-animation-time").evaluate((element,value)=>{
          const range=element as HTMLInputElement;
          range.value=String(value);
          range.dispatchEvent(new Event("input",{bubbles:true}));
        },time);
        // Timeline displays two decimal places and the browser's range input
        // rounds to a 0.001-second step; tolerate display quantization only.
        const displayed=Number((await page.locator("#studio-animation-clock")
          .textContent())?.split(" / ")[0]);
        expect(Math.abs(displayed-time),id+" timeline quantization")
          .toBeLessThan(.015);
        await page.waitForTimeout(120);
        const path="test-results/studio-c6-3/"+id+"-"+view+"-"+fraction+".jpg";
        const {mkdirSync}=await import("node:fs");
        mkdirSync("test-results/studio-c6-3",{recursive:true});
        frames.push(await page.locator("#studio-viewport canvas").screenshot({
          path,type:"jpeg",quality:65,
        }));
      }
    }
    expect(frames[0].equals(frames[1]),id+" must render changing motion").toBe(false);
    expect(frames[4].equals(frames[5]),id+" side view must change").toBe(false);
    await expect(page.locator("#studio-error")).toBeHidden();
  }
  expect(errors).toEqual([]);
});

/** Regenerated short/tall/muscular MakeHuman bodies retain the same authored
 * Kevin curves and skinned playback. Each frame is a real WebGL screenshot. */
test("C6.3 Kevin clips survive body regeneration across supported morphologies",async({page})=>{
  test.setTimeout(300_000);
  const errors:string[]=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.setViewportSize({width:1100,height:780});
  await page.emulateMedia({reducedMotion:"reduce"});
  await page.goto("/studio/");
  await expect(page.locator("html")).toHaveAttribute("data-studio-ready","true",
    {timeout:90_000});
  const {mkdirSync}=await import("node:fs");
  mkdirSync("test-results/studio-c6-3", {recursive:true});
  for(const preset of ["short","tall","muscular"] as const){
    await page.locator('[data-section="body"]').click();
    await page.locator("#studio-preset").selectOption(preset);
    await expect(page.locator("#studio-editor-message")).toBeEmpty({timeout:90_000});
    await page.locator('[data-section="pose"]').click();
    for(const [id,duration] of [
      ["human-kevin-idle",2.7],["human-kevin-walk",.8],["human-kevin-run",.6],
    ] as const){
      await page.locator("#studio-animation-select").selectOption(id);
      await expect(page.locator("#studio-animation-play")).toBeEnabled();
      for(const fraction of [.25,.75] as const){
        await page.locator("#studio-animation-time").evaluate((element,value)=>{
          const range=element as HTMLInputElement;
          range.value=String(value);
          range.dispatchEvent(new Event("input",{bubbles:true}));
        },duration*fraction);
        await page.waitForTimeout(120);
        await page.locator("#studio-viewport canvas").screenshot({
          path:"test-results/studio-c6-3/"+preset+"-"+id+"-"+fraction+".jpg",
          type:"jpeg",quality:65,
        });
      }
      await expect(page.locator("#studio-error")).toBeHidden();
    }
    await page.locator("#studio-animation-static").click();
  }
  expect(errors).toEqual([]);
});
