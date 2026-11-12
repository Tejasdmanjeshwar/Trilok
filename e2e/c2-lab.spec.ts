import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";

test("C2 isolated preview renders and changes poses without touching battle",async({page})=>{
  test.setTimeout(75_000);
  const errors:string[]=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.goto("/c2-lab.html");
  await expect(page.locator("h1")).toContainText("Experimental skinned character surface");
  await expect(page.locator("#status")).toContainText("C2 diagnostic ready",{timeout:60_000});
  await expect(page.locator("html")).toHaveAttribute("data-c2-ready","true");
  // The imported CC0 topology must render; silently falling back is a regression in CI.
  await expect(page.locator("html")).toHaveAttribute("data-c2-source","template");
  await expect(page.locator("#status")).toContainText("source vertices");
  await expect(page.locator("#status")).toContainText("CC0 rig");
  await expect(page.locator("#status")).toContainText("0 unweighted vertices");
  // Upstream body-group selection must exclude helper meshes and preserve a
  // closed manifold anatomical surface; previous all-groups import had 154 shells.
  await expect(page.locator("#status")).toContainText("1 topology components");
  await expect(page.locator("#status")).toContainText("0 boundary / 0 non-manifold edges");
  console.log("Verified imported anatomical surface:",await page.locator("#status").innerText());
  await expect(page.locator("#viewport canvas")).toBeVisible();
  mkdirSync("test-results/c2",{recursive:true});
  const platform=test.info().project.name;
  await page.locator("#viewport").screenshot({path:"test-results/c2/"+platform+"-neutral.png"});
  await page.locator('[data-debug="skeleton"]').check();
  await page.locator('[data-pose="overhead"]').click();
  await expect(page.locator("#status")).toContainText("overhead");
  await page.locator("#viewport").screenshot({path:"test-results/c2/"+platform+"-overhead.png"});
  await page.locator('[data-debug="wireframe"]').check();
  await page.locator("#viewport").screenshot({path:"test-results/c2/"+platform+"-wireframe.png"});
  await page.locator('[data-debug="wireframe"]').uncheck();
  await page.locator('[data-debug="skeleton"]').uncheck();
  await page.locator('[data-pose="shoulder"]').click();
  await expect(page.locator('[data-pose="shoulder"]')).toHaveAttribute("aria-pressed","true");
  await expect(page.locator("#status")).toContainText("shoulder");
  await page.locator("#viewport").screenshot({path:"test-results/c2/"+platform+"-shoulder.png"});
  await page.locator('[data-pose="crouch"]').click();
  await expect(page.locator("#status")).toContainText("crouch");
  await page.locator("#viewport").screenshot({path:"test-results/c2/"+platform+"-crouch.png"});
  await page.locator('[data-pose="fist"]').click();
  await expect(page.locator("#status")).toContainText("fist");
  await page.locator("#viewport").screenshot({path:"test-results/c2/"+platform+"-fist.png"});
  await page.locator('[data-pose="sword"]').click();
  await page.locator('[data-view="side"]').click();
  await page.locator("#viewport").screenshot({path:"test-results/c2/"+platform+"-sword-side.png"});
  await page.locator('[data-view="rear"]').click();
  await page.locator('[data-pose="overhead"]').click();
  await page.locator("#viewport").screenshot({path:"test-results/c2/"+platform+"-overhead-rear.png"});
  await page.locator('[data-view="front"]').click();
  await page.locator('[data-pose="neutral"]').click();
  await expect(page.locator("#status")).toContainText("neutral");
  expect(errors).toEqual([]);
  await page.goto("/");
  await expect(page.locator("#loading")).toBeHidden({timeout:20_000});
  await expect(page.locator("#boss-phase-name")).toContainText("SENTINEL");
});
