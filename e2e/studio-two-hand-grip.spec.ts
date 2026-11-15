import {test,expect} from "@playwright/test";
import {mkdirSync} from "node:fs";

test("two-hand sword and staff remain attached across hands, poses and source morphs",
  async({page})=>{
  test.setTimeout(360_000);
  const errors:string[]=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.goto("/studio/");
  await expect(page.locator("html")).toHaveAttribute("data-studio-ready","true",
    {timeout:90_000});
  await page.getByRole("button",{name:"Pose",exact:true}).click();
  const equipment=page.locator("#studio-sword-hand");
  mkdirSync("test-results/studio",{recursive:true});
  for(const choice of ["longsword-right","longsword-left",
    "staff-right","staff-left"] as const){
    await equipment.selectOption(choice);
    await expect(equipment).toHaveValue(choice);
    // The Studio status shows an actionable unreachable diagnostic rather
    // than pretending that an absent weapon represents two-hand contact.
    await expect(page.locator("#studio-edit-status")).toBeEmpty();
    for(const view of ["front","side","three-quarter"] as const){
      await page.getByRole("button",{name:"View",exact:true}).click();
      await page.locator("#studio-views [data-view='"+view+"']").click();
      await page.waitForTimeout(650);
      await expect(page.locator("#studio-edit-status")).toBeEmpty();
      await page.screenshot({path:"test-results/studio/"+
        test.info().project.name+"-"+choice+"-"+view+".png",fullPage:true});
    }
    await page.getByRole("button",{name:"Pose",exact:true}).click();
    await page.locator("#studio-sword-focus").click();
    await page.waitForTimeout(600);
    await page.screenshot({path:"test-results/studio/"+
      test.info().project.name+"-"+choice+"-closeup.png",fullPage:true});
  }
  await page.locator("#studio-pose-select").selectOption("shoulder-combined");
  await expect(page.locator("#studio-edit-status")).toBeEmpty();
  await page.screenshot({path:"test-results/studio/"+
    test.info().project.name+"-two-hand-pose.png",fullPage:true});
  for(const preset of ["short","tall","largeHands"] as const){
    await page.getByRole("button",{name:"Body",exact:true}).click();
    await page.locator("#studio-preset").selectOption(preset);
    await expect(page.locator("#studio-edit-status")).toBeEmpty({timeout:90_000});
    await page.getByRole("button",{name:"Pose",exact:true}).click();
    for(const choice of ["longsword-right","longsword-left",
      "staff-right","staff-left"] as const){
      await equipment.selectOption(choice);
      await expect(page.locator("#studio-edit-status")).toBeEmpty({timeout:90_000});
      await page.screenshot({path:"test-results/studio/"+
        test.info().project.name+"-"+preset+"-"+choice+".png",fullPage:true});
    }
  }
  await equipment.selectOption("right");
  await expect(page.locator("#studio-edit-status")).toBeEmpty();
  await equipment.selectOption("none");
  await expect(page.locator("#studio-sword-focus")).toBeDisabled();
  expect(errors).toEqual([]);
});
