import {test,expect} from "@playwright/test";
import {mkdirSync} from "node:fs";

test("mirrored bow nock, partial draw, aim and release remain Studio-only",async({page})=>{
  test.setTimeout(360_000);
  const errors:string[]=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.goto("/studio/");
  await expect(page.locator("html")).toHaveAttribute("data-studio-ready","true",
    {timeout:90_000});
  await page.getByRole("button",{name:"Pose",exact:true}).click();
  const choice=page.locator("#studio-sword-hand");
  const state=page.locator("#studio-archery-state");
  const draw=page.locator("#studio-archery-draw");
  mkdirSync("test-results/studio",{recursive:true});
  for(const side of ["left","right"] as const){
    await choice.selectOption("bow-"+side);
    await expect(page.locator("#studio-archery-pose")).toBeVisible();
    for(const position of ["rest","nock","partial","aim","release"] as const){
      await state.selectOption(position);
      if(position==="partial")await draw.fill("65");
      await page.locator("#studio-reset").click();
      await page.waitForTimeout(650);
      await page.screenshot({path:"test-results/studio/"+test.info().project.name+
        "-bow-"+side+"-"+position+"-full.png",fullPage:true});
      if(position==="aim"){
        await page.locator("#studio-sword-focus").click();
        await page.waitForTimeout(650);
        await page.screenshot({path:"test-results/studio/"+test.info().project.name+
          "-bow-"+side+"-hand.png",fullPage:true});
      }
    }
  }
  await choice.selectOption("sword-shield-right");
  await expect(page.locator("#studio-archery-pose")).toBeHidden();
  await expect(page.locator("#studio-shield-pose")).toBeVisible();
  await choice.selectOption("none");
  expect(errors).toEqual([]);
});
