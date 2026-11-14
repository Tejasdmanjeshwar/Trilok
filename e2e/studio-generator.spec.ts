import {test,expect} from "@playwright/test";
import {mkdirSync} from "node:fs";

test("One-click Random character produces editable results with Undo and Redo",async({page})=>{
  test.setTimeout(240_000);
  const errors:string[]=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.goto("/studio/");
  await expect(page.locator("html")).toHaveAttribute("data-studio-ready","true",
    {timeout:90_000});
  await page.getByRole("button",{name:"Generate",exact:true}).click();
  const generator=page.locator("#studio-generator-panel");
  await expect(generator.getByRole("button",{name:"Random character"})).toBeVisible();
  await expect(generator.locator("select,input")).toHaveCount(0);
  await generator.getByRole("button",{name:"Random character"}).click();
  await expect(page.locator("#studio-generator-feedback"))
    .toContainText("New character created",{timeout:150_000});
  await expect(page.locator("#studio-undo")).toBeEnabled();
  await page.locator("#studio-undo").click();
  await expect(page.locator("#studio-redo")).toBeEnabled();
  await page.locator("#studio-redo").click();
  await page.getByRole("button",{name:"Face",exact:true}).click();
  await page.locator("#studio-control-search").fill("nose");
  await expect(page.locator("#studio-control-count")).toBeVisible();
  await page.getByRole("button",{name:"Generate",exact:true}).click();
  await generator.getByRole("button",{name:"Random character"}).click();
  await expect(page.locator("#studio-generator-feedback"))
    .toContainText("New character created",{timeout:150_000});
  await page.getByRole("button",{name:"View",exact:true}).click();
  await page.locator("#studio-focus-area").selectOption("face");
  await page.locator("#studio-focus").click();
  await page.locator('[data-view="side"]').click();
  await expect(page.locator("#studio-return-focus")).toBeEnabled();
  const text=await page.locator("body").innerText();
  expect(text).not.toMatch(/\bC[0-9](?:\.[0-9]+)?\b|laboratory|commit|phase|debug/i);
  expect(await page.locator("body").evaluate(el=>el.scrollWidth<=innerWidth+1))
    .toBe(true);
  mkdirSync("test-results/studio",{recursive:true});
  await page.screenshot({path:"test-results/studio/"+
    test.info().project.name+"-random-character.png",fullPage:true});
  expect(errors).toEqual([]);
});

test("Random character keeps the Generate panel simple on touch",async({page})=>{
  test.setTimeout(120_000);
  await page.goto("/studio/");
  await expect(page.locator("html")).toHaveAttribute("data-studio-ready","true",
    {timeout:90_000});
  await page.getByRole("button",{name:"Generate",exact:true}).click();
  const generator=page.locator("#studio-generator-panel");
  await expect(generator.getByRole("button",{name:"Random character"})).toBeVisible();
  await expect(generator.locator("input,select")).toHaveCount(0);
  await expect(generator.getByRole("button")).toHaveCount(1);
  expect(await page.locator("body").evaluate(el=>el.scrollWidth<=innerWidth+1))
    .toBe(true);
  mkdirSync("test-results/studio",{recursive:true});
  await page.screenshot({path:"test-results/studio/"+
    test.info().project.name+"-random-simple.png",fullPage:true});
});
