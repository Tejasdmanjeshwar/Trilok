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
  // Signed directions are evaluated against the pinned imported CC0 skeleton.
  await expect(page.locator("html")).toHaveAttribute("data-c2-directions","passed");
  await expect(page.locator("html")).toHaveAttribute("data-c2-jaw-direction","passed");
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
  await page.locator('[data-view="hand-left"]').click();
  await page.locator("#viewport").screenshot({path:"test-results/c2/"+platform+"-neutral-hand-left.png"});
  await page.locator('[data-view="hand-right"]').click();
  await page.locator("#viewport").screenshot({path:"test-results/c2/"+platform+"-neutral-hand-right.png"});
  await page.locator('[data-pose="fist"]').click();
  await expect(page.locator("#status")).toContainText("fist");
  await page.locator("#viewport").screenshot({path:"test-results/c2/"+platform+"-fist.png"});
  await page.locator('[data-view="hand-left"]').click();
  await page.locator("#viewport").screenshot({path:"test-results/c2/"+platform+"-fist-hand-left.png"});
  await page.locator('[data-view="hand-right"]').click();
  await page.locator("#viewport").screenshot({path:"test-results/c2/"+platform+"-fist-hand-right.png"});
  await page.locator('[data-pose="index"]').click();
  await page.locator("#viewport").screenshot({path:"test-results/c2/"+platform+"-index-hand-right.png"});
  await page.locator('[data-view="hand-left"]').click();
  await page.locator("#viewport").screenshot({path:"test-results/c2/"+platform+"-index-hand-left.png"});
  await page.locator('[data-view="hand-right"]').click();
  await page.locator('[data-pose="thumb"]').click();
  await page.locator("#viewport").screenshot({path:"test-results/c2/"+platform+"-thumb-hand-right.png"});
  await page.locator('[data-view="hand-left"]').click();
  await page.locator("#viewport").screenshot({path:"test-results/c2/"+platform+"-thumb-hand-left.png"});
  await page.locator('[data-view="front"]').click();
  await page.locator('[data-pose="forearm"]').click();
  await page.locator("#viewport").screenshot({path:"test-results/c2/"+platform+"-forearm.png"});
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


test("Imported CC0 jaw opens downward and renders from front and side",async({page})=>{
  test.setTimeout(75_000);
  const errors:string[]=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.goto("/c2-lab.html");
  await expect(page.locator("html")).toHaveAttribute("data-c2-ready","true",{timeout:60_000});
  await expect(page.locator("html")).toHaveAttribute("data-c2-source","template");
  await expect(page.locator("html")).toHaveAttribute("data-c2-jaw-direction","passed");
  mkdirSync("test-results/c2",{recursive:true});
  const platform=test.info().project.name;
  await page.locator('[data-pose="neutral"]').click();
  await page.locator('[data-view="head-front"]').click();
  await page.locator("#viewport").screenshot({path:"test-results/c2/"+platform+"-jaw-neutral-front.png"});
  await page.locator('[data-view="head-side"]').click();
  await page.locator("#viewport").screenshot({path:"test-results/c2/"+platform+"-jaw-neutral-side.png"});
  await page.locator('[data-pose="jaw"]').click();
  await expect(page.locator("#status")).toContainText("jaw");
  await page.locator("#viewport").screenshot({path:"test-results/c2/"+platform+"-jaw-open-side.png"});
  await page.locator('[data-view="head-front"]').click();
  await page.locator("#viewport").screenshot({path:"test-results/c2/"+platform+"-jaw-open-front.png"});
  expect(errors).toEqual([]);
});


test("C2 Bone Inspector searches canonical joint IDs and maintains marker selection", async ({ page }) => {
  test.setTimeout(75_000);
  await page.goto("/c2-lab.html");
  await expect(page.locator("html")).toHaveAttribute("data-c2-source", "template", { timeout: 60_000 });
  await expect(page.getByRole("heading", { name: "Bone inspector" })).toBeVisible();
  const search = page.getByRole("searchbox", { name: "Search bone name or semantic ID" });
  const region = page.getByRole("combobox", { name: "Filter bones by region" });
  await region.selectOption("left-arm");
  await search.fill("wrist");
  const wrist = page.locator(".bone-list button:not([hidden])");
  await expect(wrist).toHaveCount(1);
  await wrist.click();
  await expect(wrist).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".bone-details")).toContainText("wrist_left");
  await expect(page.locator(".bone-details")).toContainText("humanoid[0]/arm[left,0]/wrist/joint");
  await expect(page.locator(".bone-details")).toContainText("Parent ID");
  await expect(page.locator(".bone-marker-label.selected")).toContainText("wrist_left");
  await page.locator('[data-pose="wrist"]').click();
  await expect(page.locator("#status")).toContainText("wrist");
  await page.getByLabel("Bone markers and labels").uncheck();
  await expect(page.locator(".bone-marker-label.selected")).toBeHidden();
  await page.getByLabel("Bone markers and labels").check();
  await expect(page.locator(".bone-marker-label.selected")).toBeVisible();
  await region.selectOption("spine");
  await search.fill("jaw");
  await expect(page.locator(".bone-list button:not([hidden])")).toHaveCount(1);
  await page.locator(".bone-list button:not([hidden])").click();
  await expect(page.locator(".bone-details")).toContainText("jaw");
  await region.selectOption("right-hand");
  await search.fill("index");
  await expect(page.locator(".bone-list button:not([hidden])").first()).toContainText("index");
});

test("C2.4 thumb web stress controls retain imported skin and live inspector", async ({page}) => {
  test.setTimeout(75_000);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/c2-lab.html");
  await expect(page.locator("html")).toHaveAttribute("data-c2-source","template",
    {timeout:60_000});
  await page.locator('[data-pose="thumb-wrist"]').click();
  await expect(page.locator("#status")).toContainText("thumb-wrist");
  await page.locator('[data-view="thumb-web-left"]').click();
  await expect(page.locator('[data-view="thumb-web-left"]'))
    .toHaveAttribute("aria-pressed","true");
  await page.locator('[data-pose="hand-stress"]').click();
  await expect(page.locator("#status")).toContainText("hand-stress");
  await expect(page.locator(".bone-details")).toContainText("wrist_left");
  await page.locator('[data-view="thumb-web-right"]').click();
  await expect(page.locator('[data-view="thumb-web-right"]'))
    .toHaveAttribute("aria-pressed","true");
  await page.locator('[data-pose="neutral"]').click();
  await expect(page.locator("#status")).toContainText("neutral");
  expect(errors).toEqual([]);
});


test("C2.4 shoulder / axilla cameras and combined stress preserve imported inspector", async ({page}) => {
  test.setTimeout(75_000);
  await page.goto("/c2-lab.html");
  await expect(page.locator("html")).toHaveAttribute("data-c2-ready","true",{timeout:60_000});
  await expect(page.locator("#status")).toContainText("CC0");
  for (const pose of ["shoulder-forward","shoulder-combined","shoulder-torso"]) {
    await page.locator('[data-pose="'+pose+'"]').click();
    await expect(page.locator('[data-pose="'+pose+'"]')).toHaveAttribute("aria-pressed","true");
    for (const view of ["shoulder-left","shoulder-right","axilla-left","axilla-right"]) {
      await page.locator('[data-view="'+view+'"]').click();
      await expect(page.locator('[data-view="'+view+'"]')).toHaveAttribute("aria-pressed","true");
      await expect(page.locator("#viewport canvas")).toBeVisible();
    }
  }
  await page.locator('[data-pose="neutral"]').click();
  await expect(page.locator(".bone-details")).toContainText("wrist_left");
});


test("C2.4 bilateral lower-body and elbow/neck stress diagnostics remain selectable",async({page})=>{
  test.setTimeout(75_000);
  await page.goto("/c2-lab.html");
  await expect(page.locator("html")).toHaveAttribute("data-c2-ready","true",{timeout:60_000});
  for (const pose of ["elbow-stress","hip-stress","knee-stress","ankle-stress","neck-jaw"]) {
    await page.locator('[data-pose="'+pose+'"]').click();
    await expect(page.locator('[data-pose="'+pose+'"]')).toHaveAttribute("aria-pressed","true");
  }
  for (const region of ["elbow","hip","knee","ankle"])for(const side of ["left","right"]){
    const view=page.locator('[data-view="'+region+'-'+side+'"]');
    await view.click();
    await expect(view).toHaveAttribute("aria-pressed","true");
    await expect(page.locator("#viewport canvas")).toBeVisible();
  }
  await page.locator('[data-pose="neutral"]').click();
  await expect(page.locator(".bone-details")).toContainText("wrist_left");
});

test("C2.5 versioned pose matrix expands desktop/touch lab diagnostics", async ({page}) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/c2-lab.html");
  await expect(page.locator("html")).toHaveAttribute("data-c2-source", "template",
    {timeout: 60_000});
  const poses = ["shoulder-unilateral", "forearm-supination", "wrist-deviation",
    "hip-rotation", "deep-crouch", "toe-curl", "head-turn",
    "whole-asymmetric", "crouch-reach", "whole-extreme"];
  const platform = test.info().project.name;
  mkdirSync("test-results/c2",{recursive:true});
  for (const id of poses) {
    await page.locator('[data-pose="' + id + '"]').click();
    await expect(page.locator('[data-pose="' + id + '"]'))
      .toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#status")).toContainText(id);
    if (["shoulder-unilateral","deep-crouch","whole-asymmetric",
      "crouch-reach","whole-extreme"].includes(id)) {
      await page.locator('[data-view="front"]').click();
      await page.locator("#viewport").screenshot({
        path:"test-results/c2/" + platform + "-c25-" + id + "-front.png",
      });
      await page.locator('[data-view="rear"]').click();
      await page.locator("#viewport").screenshot({
        path:"test-results/c2/" + platform + "-c25-" + id + "-rear.png",
      });
    }
  }
  await page.locator('[data-pose="jaw"]').click();
  await page.locator('[data-view="head-side"]').click();
  await page.locator("#viewport").screenshot({
    path:"test-results/c2/" + platform + "-c25-jaw-side.png",
  });
  await page.locator('[data-pose="neutral"]').click();
  await expect(page.locator("#status")).toContainText("neutral");
  expect(errors).toEqual([]);
});
