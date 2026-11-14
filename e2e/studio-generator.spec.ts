import {test,expect} from "@playwright/test";
import {mkdirSync} from "node:fs";

test("Generate creates a deterministic editable human with undo and redo",async({page})=>{
  test.setTimeout(240_000);
  const errors:string[]=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.goto("/studio/");
  await expect(page.locator("html")).toHaveAttribute("data-studio-ready","true",
    {timeout:90_000});
  await page.getByRole("button",{name:"Generate",exact:true}).click();
  await expect(page.getByRole("heading",{name:"Create a new character"})).toBeVisible();
  await page.locator("#studio-generator-style").selectOption("scout");
  await page.locator("#studio-generator-variation").fill(".75");
  await page.locator("#studio-generator-seed").fill("1729");
  await page.locator("#studio-generator-feature").selectOption("face:noseWidth");
  await page.locator("#studio-generator-add").click();
  await expect(page.getByRole("button",{name:"Unlock Nose Width",exact:false})).toBeVisible();
  await page.locator("#studio-generator-create").click();
  await expect(page.locator("#studio-generator-feedback")).toContainText(
    "Created a new variation",{timeout:150_000});
  await expect(page.locator("#studio-undo")).toBeEnabled();
  await page.locator("#studio-undo").click();
  await expect(page.locator("#studio-redo")).toBeEnabled();
  await page.locator("#studio-redo").click();
  await page.getByRole("button",{name:"Face",exact:true}).click();
  await page.locator("#studio-control-search").fill("nose");
  await expect(page.locator("#studio-control-count")).toBeVisible();
  await page.getByRole("button",{name:"Generate",exact:true}).click();
  await expect(page.locator("#studio-generator-seed")).toHaveValue("1729");
  await page.getByRole("button",{name:"View",exact:true}).click();
  await page.locator("#studio-focus-area").selectOption("face");
  await page.locator("#studio-focus").click();
  await page.locator('[data-view="side"]').click();
  await expect(page.locator("#studio-return-focus")).toBeEnabled();
  const text=await page.locator("body").innerText();
  expect(text).not.toMatch(/\bC[0-9](?:\.[0-9]+)?\b|laboratory|commit|phase|debug/i);
  expect(await page.locator("body").evaluate(el=>el.scrollWidth<=innerWidth+1)).toBe(true);
  mkdirSync("test-results/studio",{recursive:true});
  await page.screenshot({path:"test-results/studio/"+
    test.info().project.name+"-generator.png",fullPage:true});
  expect(errors).toEqual([]);
});

test("Generator exposes accessible locks, seed controls and choices on touch",async({page})=>{
  test.setTimeout(120_000);
  await page.goto("/studio/");
  await expect(page.locator("html")).toHaveAttribute("data-studio-ready","true",
    {timeout:90_000});
  await page.getByRole("button",{name:"Generate",exact:true}).click();
  await page.locator("#studio-generator-style").selectOption("guardian");
  for(const key of ["body","face","age","appearance"]){
    await page.locator("#studio-generator-lock-"+key).check();
    await expect(page.locator("#studio-generator-lock-"+key)).toBeChecked();
  }
  await page.locator("#studio-generator-feature").selectOption("shape:jawWidth");
  await page.locator("#studio-generator-add").click();
  await expect(page.locator("#studio-generator-locked-features button")).toHaveCount(1);
  await page.getByRole("button",{name:/Unlock Jaw Width/i}).click();
  await expect(page.locator("#studio-generator-locked-features button")).toHaveCount(0);
  await page.locator("#studio-generator-seed").fill("0");
  await page.locator("#studio-generator-create").click();
  await expect(page.locator("#studio-generator-feedback"))
    .toContainText("Enter a valid seed");
  await page.locator("#studio-generator-seed").fill("439");
  await expect(page.locator("#studio-generator-create")).toBeEnabled();
  expect(await page.locator("body").evaluate(el=>el.scrollWidth<=innerWidth+1))
    .toBe(true);
  mkdirSync("test-results/studio",{recursive:true});
  await page.screenshot({path:"test-results/studio/"+
    test.info().project.name+"-generator-locks.png",fullPage:true});
});
