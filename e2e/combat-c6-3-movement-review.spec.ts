import {test,expect} from "@playwright/test";
import {mkdirSync} from "node:fs";

/** One-shot C6.3 Gameplay Lab WebGL regression on real gameplay movement. */
test("C6.3 combat approach shows moving actor without changing attack legality",async({page},info)=>{
  test.setTimeout(120_000);
  const errors:string[]=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.goto("/?c63-gameplay-metrics");
  await expect(page.locator("#loading")).toBeHidden({timeout:20_000});
  await expect(page.locator("#end-turn")).toBeEnabled();
  const root="test-results/c63-gameplay/"+info.project.name;
  mkdirSync(root,{recursive:true});
  const canvas=page.locator("#viewport canvas");
  const start=await canvas.screenshot({path:root+"/before.png"});
  // The default bow only opens the aiming UI. Equip melee so the actual
  // authorized approach/retreat choreography translates the actor.
  await page.keyboard.press("Digit2");
  await expect(page.locator("#weapon-deck .is-equipped")).toContainText("Sword");
  await page.locator("#attack").click();
  await expect.poll(async()=>{
    const raw=await canvas.getAttribute("data-c63-gameplay");
    return raw?(JSON.parse(raw) as {hero:string}).hero:"";
  },{timeout:45_000,message:"Kevin source-backed canonical mixer must load"}).toBe("kevin");
  await page.waitForTimeout(240);
  const moving=await canvas.screenshot({path:root+"/approach.png"});
  await page.waitForTimeout(360);
  const after=await canvas.screenshot({path:root+"/after.png"});
  expect(start.equals(moving)).toBe(false);
  expect(moving.equals(after)).toBe(false);
  await expect(page.locator("#runtime-fault")).toBeHidden();
  expect(errors).toEqual([]);
});
