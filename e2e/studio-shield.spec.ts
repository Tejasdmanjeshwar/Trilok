import {test,expect} from "@playwright/test";
import {mkdirSync} from "node:fs";

test("mirrored sword and shield render guard and parry with skinned close-ups",
  async({page})=>{
  test.setTimeout(360_000);
  const errors:string[]=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.goto("/studio/");
  await expect(page.locator("html")).toHaveAttribute("data-studio-ready","true",
    {timeout:90_000});
  await page.getByRole("button",{name:"Pose",exact:true}).click();
  const equipment=page.locator("#studio-sword-hand");
  const stance=page.locator("#studio-shield-stance");
  mkdirSync("test-results/studio",{recursive:true});
  for(const side of ["right","left"] as const){
    await equipment.selectOption("sword-shield-"+side);
    await expect(page.locator("#studio-shield-pose")).toBeVisible();
    await expect(page.locator("#studio-shield-focus")).toBeVisible();
    await expect(page.locator("#studio-edit-status")).toBeEmpty();
    for(const position of ["guard","attack-ready","parry"] as const){
      await stance.selectOption(position);
      await expect(page.locator("#studio-edit-status")).toBeEmpty();
      await page.locator("#studio-reset").click();
      await page.waitForTimeout(650);
      await page.screenshot({path:"test-results/studio/"+test.info().project.name+
        "-sword-shield-"+side+"-"+position+"-full.png",fullPage:true});
      await page.locator("#studio-shield-focus").click();
      await page.waitForTimeout(650);
      await page.screenshot({path:"test-results/studio/"+test.info().project.name+
        "-sword-shield-"+side+"-"+position+"-forearm.png",fullPage:true});
      await page.locator("#studio-reset").click();
    }
  }
  await equipment.selectOption("right");
  await expect(page.locator("#studio-shield-pose")).toBeHidden();
  await equipment.selectOption("none");
  await expect(page.locator("#studio-sword-focus")).toBeDisabled();
  expect(errors).toEqual([]);
});
