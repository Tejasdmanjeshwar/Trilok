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
  await expect(generator.locator("#studio-generator-seed")).toBeVisible();
  await generator.getByRole("button",{name:"Random character"}).click();
  const firstSeed=await generator.locator("#studio-generator-seed").inputValue();
  await expect(page.locator("#studio-generator-feedback"))
    .toContainText(`Character generated from seed ${firstSeed}.`,{timeout:60_000});
  await expect(page.locator("#studio-generator-current-seed"))
    .toContainText(firstSeed);
  await expect(page.locator("#studio-undo")).toBeEnabled();
  await page.locator("#studio-undo").click();
  await expect(page.locator("#studio-redo")).toBeEnabled();
  await page.locator("#studio-redo").click();
  await page.getByRole("button",{name:"Face",exact:true}).click();
  await page.locator("#studio-control-search").fill("nose");
  await expect(page.locator("#studio-control-count")).toBeVisible();
  await page.getByRole("button",{name:"Generate",exact:true}).click();
  await generator.getByRole("button",{name:"Random character"}).click();
  const secondSeed=await generator.locator("#studio-generator-seed").inputValue();
  await expect(page.locator("#studio-generator-feedback"))
    .toContainText(`Character generated from seed ${secondSeed}.`,{timeout:60_000});
  await expect(page.locator("#studio-generator-current-seed"))
    .toContainText(secondSeed);
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
  await expect(generator.locator("#studio-generator-seed")).toBeVisible();
  await expect(generator.getByRole("button")).toHaveCount(2);
  expect(await page.locator("body").evaluate(el=>el.scrollWidth<=innerWidth+1))
    .toBe(true);
  mkdirSync("test-results/studio",{recursive:true});
  await page.screenshot({path:"test-results/studio/"+
    test.info().project.name+"-random-simple.png",fullPage:true});
});

test("exact manual seed regenerates the same character and equips the reported sword",async({page})=>{
  test.setTimeout(300_000);
  const errors:string[]=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.goto("/studio/");
  await expect(page.locator("html")).toHaveAttribute("data-studio-ready","true",
    {timeout:90_000});
  await page.getByRole("button",{name:"Generate",exact:true}).click();
  const seed=page.locator("#studio-generator-seed");
  const generate=page.locator("#studio-generator-seed-create");
  await seed.fill("2694905601");
  await generate.click();
  await expect(page.locator("#studio-generator-feedback"))
    .toContainText("Character generated from seed 2694905601",{timeout:150_000});
  await expect(page.locator("#studio-generator-current-seed"))
    .toContainText("2694905601");
  await page.getByRole("button",{name:"Pose",exact:true}).click();
  await page.locator("#studio-pose-select").selectOption("neutral");
  await page.locator("#studio-sword-hand").selectOption("longsword-right");
  await expect(page.locator("#studio-edit-status")).toBeEmpty({timeout:60_000});
  await expect(page.locator("#studio-copy-grip-failure")).toBeHidden();
  mkdirSync("test-results/studio",{recursive:true});
  await page.locator("#studio-reset").click();
  await page.screenshot({path:"test-results/studio/"+
    test.info().project.name+"-seed-2694905601-sword-full.png",fullPage:true});
  await page.locator("#studio-sword-focus").click();
  await page.screenshot({path:"test-results/studio/"+
    test.info().project.name+"-seed-2694905601-sword-hand.png",fullPage:true});
  await page.getByRole("button",{name:"Generate",exact:true}).click();
  await seed.fill("0");
  await generate.click();
  await expect(seed).toHaveAttribute("aria-invalid","true");
  await expect(page.locator("#studio-generator-feedback"))
    .toContainText("Enter a whole-number seed");
  await expect(page.locator("#studio-generator-current-seed"))
    .toContainText("2694905601");
  await seed.fill("2694905601");
  await generate.click();
  await expect(page.locator("#studio-generator-feedback"))
    .toContainText("Character generated from seed 2694905601",{timeout:150_000});
  await page.getByRole("button",{name:"Pose",exact:true}).click();
  await expect(page.locator("#studio-edit-status")).toBeEmpty({timeout:60_000});
  expect(errors).toEqual([]);
});
