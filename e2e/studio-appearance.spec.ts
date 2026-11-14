import {test,expect} from "@playwright/test";
import {mkdirSync} from "node:fs";

test("Appearance changes the real human material and remains undoable",async({page})=>{
  test.setTimeout(180_000);
  const errors:string[]=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.goto("/studio/");
  await expect(page.locator("html")).toHaveAttribute("data-studio-ready","true",{timeout:90_000});
  await page.getByRole("button",{name:"Appearance",exact:true}).click();
  await expect(page.getByRole("heading",{name:"Skin & surface"})).toBeVisible();
  await expect(page.locator("#studio-tone-options button")).toHaveCount(8);
  await expect(page.locator('[data-tone="neutral"]')).toHaveAttribute("aria-pressed","true");
  const initial=await page.locator("#studio-viewport canvas").screenshot();
  await page.locator('[data-tone="deep"]').click();
  await expect(page.locator('[data-tone="deep"]')).toHaveAttribute("aria-pressed","true");
  await expect(page.locator("#studio-editor-message")).toBeEmpty({timeout:90_000});
  const changed=await page.locator("#studio-viewport canvas").screenshot();
  expect(initial.equals(changed)).toBe(false);
  await page.locator('[data-finish="matte"]').click();
  await expect(page.locator('[data-finish="matte"]')).toHaveAttribute("aria-pressed","true");
  await expect(page.locator("#studio-roughness-value")).toHaveJSProperty("value","0.90");
  await page.locator("#studio-undo").click();
  await expect(page.locator('[data-finish="natural"]')).toHaveAttribute("aria-pressed","true");
  await page.locator("#studio-undo").click();
  await expect(page.locator('[data-tone="neutral"]')).toHaveAttribute("aria-pressed","true");
  await page.locator("#studio-redo").click();
  await expect(page.locator('[data-tone="deep"]')).toHaveAttribute("aria-pressed","true");
  await page.getByRole("button",{name:"Body",exact:true}).click();
  await page.locator("#studio-preset").selectOption("athletic");
  await expect(page.locator("#studio-editor-message")).toBeEmpty({timeout:90_000});
  await page.getByRole("button",{name:"Appearance",exact:true}).click();
  await expect(page.locator('[data-tone="deep"]')).toHaveAttribute("aria-pressed","true");
  await page.locator("#studio-appearance-reset").click();
  await expect(page.locator('[data-tone="neutral"]')).toHaveAttribute("aria-pressed","true");
  await expect(page.locator("#studio-editor-message")).toBeEmpty({timeout:90_000});
  expect(await page.locator("body").evaluate(el=>el.scrollWidth<=innerWidth+1)).toBe(true);
  mkdirSync("test-results/studio",{recursive:true});
  await page.screenshot({path:"test-results/studio/"+test.info().project.name+"-appearance.png",fullPage:true});
  expect(errors).toEqual([]);
});
test("Only ready assets are offered in the Studio editor",async({page})=>{
  await page.goto("/studio/");
  await expect(page.getByRole("button",{name:"Appearance",exact:true})).toBeVisible();
  for(const name of ["Hair","Clothing","Armor","Equipment"]){
    await expect(page.getByRole("button",{name,exact:true})).toHaveCount(0);
  }
  await expect(page.locator("#character-lab-link")).toHaveCount(0);
});
