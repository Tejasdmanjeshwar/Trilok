import { test, expect, type Page } from "@playwright/test";

const choosePose = (page:Page,id:string) => page.locator("#pose-select").selectOption(id);
const chooseView = (page:Page,id:string) => page.locator("#view-select").selectOption(id);
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
  await choosePose(page,"overhead");
  await expect(page.locator("#status")).toContainText("overhead");
  await page.locator("#viewport").screenshot({path:"test-results/c2/"+platform+"-overhead.png"});
  await page.locator('[data-debug="wireframe"]').check();
  await page.locator("#viewport").screenshot({path:"test-results/c2/"+platform+"-wireframe.png"});
  await page.locator('[data-debug="wireframe"]').uncheck();
  await page.locator('[data-debug="skeleton"]').uncheck();
  await choosePose(page,"shoulder");
  await expect(page.locator('[data-pose="shoulder"]')).toHaveAttribute("aria-pressed","true");
  await expect(page.locator("#status")).toContainText("shoulder");
  await page.locator("#viewport").screenshot({path:"test-results/c2/"+platform+"-shoulder.png"});
  await choosePose(page,"crouch");
  await expect(page.locator("#status")).toContainText("crouch");
  await page.locator("#viewport").screenshot({path:"test-results/c2/"+platform+"-crouch.png"});
  await chooseView(page,"hand-left");
  await page.locator("#viewport").screenshot({path:"test-results/c2/"+platform+"-neutral-hand-left.png"});
  await chooseView(page,"hand-right");
  await page.locator("#viewport").screenshot({path:"test-results/c2/"+platform+"-neutral-hand-right.png"});
  await choosePose(page,"fist");
  await expect(page.locator("#status")).toContainText("fist");
  await page.locator("#viewport").screenshot({path:"test-results/c2/"+platform+"-fist.png"});
  await chooseView(page,"hand-left");
  await page.locator("#viewport").screenshot({path:"test-results/c2/"+platform+"-fist-hand-left.png"});
  await chooseView(page,"hand-right");
  await page.locator("#viewport").screenshot({path:"test-results/c2/"+platform+"-fist-hand-right.png"});
  await choosePose(page,"index");
  await page.locator("#viewport").screenshot({path:"test-results/c2/"+platform+"-index-hand-right.png"});
  await chooseView(page,"hand-left");
  await page.locator("#viewport").screenshot({path:"test-results/c2/"+platform+"-index-hand-left.png"});
  await chooseView(page,"hand-right");
  await choosePose(page,"thumb");
  await page.locator("#viewport").screenshot({path:"test-results/c2/"+platform+"-thumb-hand-right.png"});
  await chooseView(page,"hand-left");
  await page.locator("#viewport").screenshot({path:"test-results/c2/"+platform+"-thumb-hand-left.png"});
  await chooseView(page,"front");
  await choosePose(page,"forearm");
  await page.locator("#viewport").screenshot({path:"test-results/c2/"+platform+"-forearm.png"});
  await choosePose(page,"sword");
  await chooseView(page,"side");
  await page.locator("#viewport").screenshot({path:"test-results/c2/"+platform+"-sword-side.png"});
  await chooseView(page,"rear");
  await choosePose(page,"overhead");
  await page.locator("#viewport").screenshot({path:"test-results/c2/"+platform+"-overhead-rear.png"});
  await chooseView(page,"front");
  await choosePose(page,"neutral");
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
  await choosePose(page,"neutral");
  await chooseView(page,"head-front");
  await page.locator("#viewport").screenshot({path:"test-results/c2/"+platform+"-jaw-neutral-front.png"});
  await chooseView(page,"head-side");
  await page.locator("#viewport").screenshot({path:"test-results/c2/"+platform+"-jaw-neutral-side.png"});
  await choosePose(page,"jaw");
  await expect(page.locator("#status")).toContainText("jaw");
  await page.locator("#viewport").screenshot({path:"test-results/c2/"+platform+"-jaw-open-side.png"});
  await chooseView(page,"head-front");
  await page.locator("#viewport").screenshot({path:"test-results/c2/"+platform+"-jaw-open-front.png"});
  expect(errors).toEqual([]);
});


test("C2 Bone Inspector searches canonical joint IDs and maintains marker selection", async ({ page }) => {
  test.setTimeout(75_000);
  await page.goto("/c2-lab.html");
  await expect(page.locator("html")).toHaveAttribute("data-c2-source", "template", { timeout: 60_000 });
  await expect(page.getByRole("heading", { name: "Bone inspector" })).toBeVisible();
  await page.getByRole("button",{name:"Inspect bones"}).click();
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
  await choosePose(page,"wrist");
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
  await choosePose(page,"thumb-wrist");
  await expect(page.locator("#status")).toContainText("thumb-wrist");
  await chooseView(page,"thumb-web-left");
  await expect(page.locator("#view-select")).toHaveValue("thumb-web-left");
  await choosePose(page,"hand-stress");
  await expect(page.locator("#status")).toContainText("hand-stress");
  await expect(page.locator(".bone-details")).toContainText("wrist_left");
  await chooseView(page,"thumb-web-right");
  await expect(page.locator("#view-select")).toHaveValue("thumb-web-right");
  await choosePose(page,"neutral");
  await expect(page.locator("#status")).toContainText("neutral");
  expect(errors).toEqual([]);
});


test("C2.4 shoulder / axilla cameras and combined stress preserve imported inspector", async ({page}) => {
  test.setTimeout(75_000);
  await page.goto("/c2-lab.html");
  await expect(page.locator("html")).toHaveAttribute("data-c2-ready","true",{timeout:60_000});
  await expect(page.locator("#status")).toContainText("CC0");
  for (const pose of ["shoulder-forward","shoulder-combined","shoulder-torso"]) {
    await choosePose(page,"'+pose+'");
    await expect(page.locator('[data-pose="'+pose+'"]')).toHaveAttribute("aria-pressed","true");
    for (const view of ["shoulder-left","shoulder-right","axilla-left","axilla-right"]) {
      await chooseView(page,"'+view+'");
      await expect(page.locator("#view-select")).toHaveValue("'+view+'");
      await expect(page.locator("#viewport canvas")).toBeVisible();
    }
  }
  await choosePose(page,"neutral");
  await expect(page.locator(".bone-details")).toContainText("wrist_left");
});


test("C2.4 bilateral lower-body and elbow/neck stress diagnostics remain selectable",async({page})=>{
  test.setTimeout(75_000);
  await page.goto("/c2-lab.html");
  await expect(page.locator("html")).toHaveAttribute("data-c2-ready","true",{timeout:60_000});
  for (const pose of ["elbow-stress","hip-stress","knee-stress","ankle-stress","neck-jaw"]) {
    await choosePose(page,"'+pose+'");
    await expect(page.locator('[data-pose="'+pose+'"]')).toHaveAttribute("aria-pressed","true");
  }
  for (const region of ["elbow","hip","knee","ankle"])for(const side of ["left","right"]){
    const view=region+"-"+side;
    await chooseView(page,view);
    await expect(page.locator("#view-select")).toHaveValue(view);
    await expect(page.locator("#viewport canvas")).toBeVisible();
  }
  await choosePose(page,"neutral");
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
    await choosePose(page,"' + id + '");
    await expect(page.locator('[data-pose="' + id + '"]'))
      .toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#status")).toContainText(id);
    if (["shoulder-unilateral","deep-crouch","whole-asymmetric",
      "crouch-reach","whole-extreme"].includes(id)) {
      await chooseView(page,"front");
      await page.locator("#viewport").screenshot({
        path:"test-results/c2/" + platform + "-c25-" + id + "-front.png",
      });
      await chooseView(page,"rear");
      await page.locator("#viewport").screenshot({
        path:"test-results/c2/" + platform + "-c25-" + id + "-rear.png",
      });
    }
  }
  await choosePose(page,"jaw");
  await chooseView(page,"head-side");
  await page.locator("#viewport").screenshot({
    path:"test-results/c2/" + platform + "-c25-jaw-side.png",
  });
  await choosePose(page,"neutral");
  await expect(page.locator("#status")).toContainText("neutral");
  expect(errors).toEqual([]);
});

test("C2.5 empirical import timings and repeated owned-surface lifecycle",async({page})=>{
  test.setTimeout(180_000);
  const errors:string[]=[];
  page.on("pageerror",e=>errors.push(e.message));
  await page.goto("/c2-lab.html");
  await expect(page.locator("html")).toHaveAttribute("data-c2-source","template",{timeout:60_000});
  const results:string[]=[];
  mkdirSync("test-results/c2",{recursive:true});
  for(let cycle=0;cycle<3;cycle++){
    await expect(page.locator("#c25-metrics")).toContainText("total-instantiation");
    const metrics=await page.locator("#c25-metrics").innerText();
    for(const stage of ["obj-fetch","obj-parse","rig-json","weight-json",
      "fk-calibration","shoulder-motion-sampling","skin-influence-fitting",
      "total-instantiation","last FK pose","CPU skin sample"])
      expect(metrics,"Missing empirical timing: "+stage).toContain(stage);
    results.push(metrics);
    // Exercise the existing surface and inspector ownership teardown path
    // after actual pinned CC0 rendering, not just fake surface replacement.
    await page.locator("#source-select").selectOption("implicit");
    await expect(page.locator("html")).toHaveAttribute("data-c2-source","implicit",
      {timeout:60_000});
    await expect(page.locator("#bone-inspector-panel .bone-list")).toHaveCount(1);
    await page.locator("#source-select").selectOption("template");
    await expect(page.locator("html")).toHaveAttribute("data-c2-source","template",
      {timeout:60_000});
    await expect(page.locator("#bone-inspector-panel .bone-list")).toHaveCount(1);
    await expect(page.locator("html")).toHaveAttribute("data-c2-directions","passed");
    await expect(page.locator("html")).toHaveAttribute("data-c2-jaw-direction","passed");
  }
  console.log("C2.5 environment",test.info().project.name,
    "import and pose empirical samples",JSON.stringify(results));
  await page.locator("#c25-performance").evaluate((element:HTMLDetailsElement)=>{
    element.open=true;
  });
  await page.locator("#c25-performance").screenshot({
    path:"test-results/c2/"+test.info().project.name+"-c25-performance.png",
  });
  expect(errors).toEqual([]);
});

test("Character Lab viewer-first pose picker stays compact, searchable and keyboard accessible",async({page})=>{
  test.setTimeout(90_000);
  await page.goto("/c2-lab.html");
  await expect(page.locator("html")).toHaveAttribute("data-c2-source","template",{timeout:60_000});
  const viewport=page.locator("#viewport");
  const pose=page.getByRole("combobox",{name:"Select anatomical pose"});
  await expect(viewport).toBeVisible();
  await expect(pose).toHaveValue("neutral");
  const viewportTop=await viewport.evaluate(node=>node.getBoundingClientRect().top);
  expect(viewportTop).toBeLessThan(490);
  await page.getByRole("button",{name:"Browse poses"}).click();
  await expect(page.getByRole("dialog",{name:"Anatomical pose library"})).toBeVisible();
  await expect(page.locator("#pose-result-count")).toContainText("54 of 54");
  await page.getByRole("searchbox",{name:"Search poses"}).fill("thumb");
  await expect(page.locator("#pose-result-count")).not.toContainText("54 of 54");
  await page.locator('#pose-results [data-pose="thumb"]').click();
  await expect(pose).toHaveValue("thumb");
  await expect(page.locator("#status")).toContainText("thumb");
  await expect(page.locator("#pose-browser")).toBeHidden();
  await expect(viewport).toBeVisible();
  await page.getByRole("button",{name:"Browse poses"}).click();
  await page.keyboard.press("Escape");
  await expect(page.locator("#pose-browser")).toBeHidden();
  await page.getByRole("button",{name:"Reset"}).click();
  await expect(pose).toHaveValue("neutral");
  await page.getByRole("button",{name:"Crouch",exact:true}).click();
  await expect(pose).toHaveValue("crouch");
  const platform=test.info().project.name;
  mkdirSync("test-results/c2",{recursive:true});
  await page.screenshot({path:"test-results/c2/"+platform+"-viewer-first-layout.png",fullPage:false});
});

test("Character Lab viewport and diagnostic controls work at narrow touch width",async({page})=>{
  test.setTimeout(90_000);
  await page.goto("/c2-lab.html");
  await expect(page.locator("html")).toHaveAttribute("data-c2-source","template",{timeout:60_000});
  await page.locator("#view-select").selectOption("hand-left");
  await page.locator("#pose-select").selectOption("fist");
  await expect(page.locator("#viewport canvas")).toBeVisible();
  await expect(page.locator("#active-pose-label")).toContainText("fist", {ignoreCase:true});
  await page.getByRole("button",{name:"Inspect bones"}).click();
  await expect(page.getByRole("searchbox",{name:"Search bone name or semantic ID"})).toBeVisible();
  await page.getByRole("button",{name:"Hide inspector"}).click();
  await expect(page.getByRole("searchbox",{name:"Search bone name or semantic ID"})).toBeHidden();
  await page.getByRole("button",{name:"Browse poses"}).click();
  await expect(page.getByRole("dialog",{name:"Anatomical pose library"})).toBeVisible();
  await page.getByRole("combobox",{name:"Filter anatomical pose region"}).selectOption("hands");
  await expect(page.locator("#pose-result-count")).toContainText("poses");
  await page.getByRole("button",{name:"Close pose library"}).click();
  await expect(page.locator("#viewport")).toBeVisible();
});
