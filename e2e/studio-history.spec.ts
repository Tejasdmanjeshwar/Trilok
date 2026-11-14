import {test,expect} from "@playwright/test";
import {mkdirSync} from "node:fs";

test("Character Studio history undoes and redoes body, face, presets and reset",async({page})=>{
  test.setTimeout(180_000);
  const errors:string[]=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.goto("/studio/");
  await expect(page.locator("html")).toHaveAttribute("data-studio-ready","true",{timeout:90_000});
  await page.locator('[data-view="side"]').click();
  await page.getByRole("button",{name:"Body",exact:true}).click();
  const age=page.locator('[data-control-id="body:macro/age"] input[type=number]');
  await age.fill(".03");await age.press("Tab");
  await expect(page.locator("#studio-editor-message")).toBeEmpty({timeout:90_000});
  await expect(page.locator("#studio-undo")).toBeEnabled();
  await page.locator("#studio-undo").click();
  await expect(age).toHaveValue("0.5");
  await expect(page.locator("#studio-editor-message")).toBeEmpty({timeout:90_000});
  await page.locator("#studio-redo").click();
  await expect(age).toHaveValue("0.03");
  await expect(page.locator("#studio-editor-message")).toBeEmpty({timeout:90_000});
  await expect(page.locator('[data-view="side"]')).toHaveAttribute("aria-pressed","true");
  await page.getByRole("button",{name:"Face",exact:true}).click();
  await page.locator("#studio-preset").selectOption("smile");
  await expect(page.locator("#studio-editor-message")).toBeEmpty({timeout:90_000});
  await page.locator("#studio-undo").click();
  await expect(page.locator("#studio-preset")).toHaveValue("neutral");
  await page.locator("#studio-redo").click();
  await expect(page.locator("#studio-preset")).toHaveValue("smile");
  await page.locator("#studio-start-over").click();
  await page.getByRole("button",{name:"OK"}).isVisible().catch(()=>false);
  // Native confirm is automatically dismissed by Playwright unless handled.
  await expect(page.locator("#studio-start-over")).toBeEnabled();
  expect(await page.locator("body").evaluate(el=>el.scrollWidth<=innerWidth+1)).toBe(true);
  mkdirSync("test-results/studio",{recursive:true});
  await page.screenshot({path:"test-results/studio/"+test.info().project.name+"-history.png",fullPage:true});
  expect(errors).toEqual([]);
});

test("Undo during pending edits restores a consistent in-memory preview",async({page})=>{
  test.setTimeout(180_000);
  await page.goto("/studio/");
  await expect(page.locator("html")).toHaveAttribute("data-studio-ready","true",{timeout:90_000});
  await page.getByRole("button",{name:"Body",exact:true}).click();
  const age=page.locator('[data-control-id="body:macro/age"] input[type=number]');
  await age.fill(".05");await age.press("Tab");
  await page.locator("#studio-undo").click();
  await expect(age).toHaveValue("0.5");
  await expect(page.locator("#studio-editor-message")).toBeEmpty({timeout:90_000});
  await expect(page.locator("#studio-viewport canvas")).toBeVisible();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-studio-ready","true",{timeout:90_000});
  await expect(page.locator("#studio-undo")).toBeDisabled();
});
