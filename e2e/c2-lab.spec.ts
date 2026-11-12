import { test, expect } from "@playwright/test";

test("C2 isolated preview renders and changes poses without touching battle",async({page})=>{
  test.setTimeout(75_000);
  const errors:string[]=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.goto("/c2-lab.html");
  await expect(page.locator("h1")).toContainText("Experimental skinned character surface");
  await expect(page.locator("#status")).toContainText("C2 diagnostic ready",{timeout:60_000});
  await expect(page.locator("html")).toHaveAttribute("data-c2-ready","true");
  await expect(page.locator("#viewport canvas")).toBeVisible();
  await page.locator('[data-pose="shoulder"]').click();
  await expect(page.locator('[data-pose="shoulder"]')).toHaveAttribute("aria-pressed","true");
  await expect(page.locator("#status")).toContainText("shoulder");
  await page.locator('[data-pose="crouch"]').click();
  await expect(page.locator("#status")).toContainText("crouch");
  await page.locator('[data-pose="neutral"]').click();
  await expect(page.locator("#status")).toContainText("neutral");
  expect(errors).toEqual([]);
  await page.goto("/");
  await expect(page.locator("#loading")).toBeHidden({timeout:20_000});
  await expect(page.locator("#boss-phase-name")).toContainText("SENTINEL");
});
