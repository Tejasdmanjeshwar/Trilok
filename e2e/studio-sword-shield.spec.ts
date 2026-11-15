import {test,expect} from "@playwright/test";
import {mkdirSync} from "node:fs";

test("mirrored sword and shield stances stay inspectable on desktop and mobile",
  async({page})=>{
  test.setTimeout(360_000);
  const errors:string[]=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.goto("/studio/");
  await expect(page.locator("html")).toHaveAttribute("data-studio-ready","true",
    {timeout:90_000});
  await page.getByRole("button",{name:"Pose",exact:true}).click();
  mkdirSync("test-results/studio",{recursive:true});
  for(const equipped of ["sword-shield-right","sword-shield-left"] as const){
    await page.locator("#studio-sword-hand").selectOption(equipped);
    await expect(page.locator("#studio-shield-stance")).toBeVisible();
    for(const stance of ["guard","attack","parry"] as const){
      await page.locator("#studio-shield-stance").selectOption(stance);
      await expect(page.locator("#studio-shield-stance")).toHaveValue(stance);
      await expect(page.locator("#studio-edit-status")).toBeEmpty();
      await page.screenshot({path:"test-results/studio/"+test.info().project.name+
        "-"+equipped+"-"+stance+"-full.png",fullPage:true});
    }
    await page.locator("#studio-sword-focus").click();
    await page.screenshot({path:"test-results/studio/"+test.info().project.name+
      "-"+equipped+"-hand-contact.png",fullPage:true});
    await page.locator("#studio-reset").click();
  }
  await page.locator("#studio-sword-hand").selectOption("none");
  await expect(page.locator("#studio-shield-stance")).toBeHidden();
  expect(errors).toEqual([]);
});
