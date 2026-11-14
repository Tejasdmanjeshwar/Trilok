import {test,expect} from "@playwright/test";
import {mkdirSync} from "node:fs";

test("Character Studio opens the shared human and supports camera, light and touch",async({page})=>{
  test.setTimeout(120_000);
  const errors:string[]=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.goto("/studio/");
  await expect(page).toHaveTitle("Character Studio · Trilok");
  await expect(page.getByRole("heading",{name:"Character Studio"})).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-studio-ready","true",{timeout:90_000});
  await expect(page.locator("#studio-viewport canvas")).toBeVisible();
  for(const id of ["front","side","rear","three-quarter"]){
    const button=page.locator('[data-view="'+id+'"]');
    await button.click();
    await expect(button).toHaveAttribute("aria-pressed","true");
  }
  for(const id of ["warm","dusk","daylight"]){
    const button=page.locator('[data-light="'+id+'"]');
    await button.click();
    await expect(button).toHaveAttribute("aria-pressed","true");
  }
  await page.getByRole("button",{name:"View",exact:true}).click();
  await expect(page.getByRole("heading",{name:"Find your angle"})).toBeVisible();
  await page.getByRole("button",{name:"Character",exact:true}).click();
  await expect(page.getByRole("heading",{name:"Meet your character"})).toBeVisible();
  await page.locator("#studio-reset").click();
  await expect(page.locator('[data-view="three-quarter"]')).toHaveAttribute("aria-pressed","true");
  const body=await page.locator("body").innerText();
  expect(body).not.toMatch(/\bC[0-9](?:\.[0-9]+)?\b|laboratory|commit|phase|debug/i);
  expect(await page.locator("body").evaluate(el=>el.scrollWidth<=innerWidth+1)).toBe(true);
  mkdirSync("test-results/studio",{recursive:true});
  await page.screenshot({path:"test-results/studio/"+test.info().project.name+"-foundation.png",fullPage:true});
  expect(errors).toEqual([]);
});
test("Studio and Lab remain independently navigable",async({page})=>{
  await page.goto("/");
  await expect(page.locator("#character-studio-link")).toHaveAttribute("href","/studio/");
  await page.goto("/studio/");
  await expect(page.locator("#studio-viewport")).toBeVisible();
  await expect(page.locator("#app")).toHaveCount(0);
  await page.goto("/c2-lab.html");
  await expect(page.locator("#viewport")).toBeVisible();
});
