import {test,expect} from "@playwright/test";
import {mkdirSync} from "node:fs";

test("reference sword equips, focuses and survives pose changes",async({page})=>{
  test.setTimeout(180_000);
  const errors:string[]=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.goto("/studio/");
  await expect(page.locator("html")).toHaveAttribute("data-studio-ready","true",
    {timeout:90_000});
  await page.getByRole("button",{name:"Pose",exact:true}).click();
  const sword=page.locator("#studio-sword-hand");
  await sword.selectOption("right");
  await expect(page.locator("#studio-sword-focus")).toBeEnabled();
  await page.locator("#studio-sword-focus").click();
  await expect(page.locator("#studio-return-focus")).toBeEnabled();
  await page.waitForTimeout(650);
  mkdirSync("test-results/studio",{recursive:true});
  await page.screenshot({path:"test-results/studio/"+test.info().project.name+
    "-sword-right-focus.png",fullPage:true});
  await page.locator("#studio-pose-select").selectOption("shoulder");
  await expect(sword).toHaveValue("right");
  await sword.selectOption("left");
  await page.locator("#studio-sword-focus").click();
  await page.waitForTimeout(650);
  await page.screenshot({path:"test-results/studio/"+test.info().project.name+
    "-sword-left-focus.png",fullPage:true});
  // Exercise the real Studio body regeneration lifecycle while equipped.
  await page.getByRole("button",{name:"Body",exact:true}).click();
  await page.locator("#studio-preset").selectOption("largeHands");
  await expect(page.locator("#studio-editor-message")).toBeEmpty({timeout:90_000});
  await page.getByRole("button",{name:"Pose",exact:true}).click();
  await expect(sword).toHaveValue("left");
  await page.locator("#studio-sword-focus").click();
  await page.waitForTimeout(650);
  await page.screenshot({path:"test-results/studio/"+test.info().project.name+
    "-sword-large-hands-focus.png",fullPage:true});
  await sword.selectOption("none");
  await expect(page.locator("#studio-sword-focus")).toBeDisabled();
  expect(errors).toEqual([]);
});
