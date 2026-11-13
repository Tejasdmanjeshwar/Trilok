import {test,expect} from "@playwright/test";
import {mkdirSync} from "node:fs";

test("C3.5 opt-in facial refinement preserves head/jaw poses and renders multiple views",async({page})=>{
  test.setTimeout(180_000);
  const errors:string[]=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.goto("/c2-lab.html");
  const root=page.locator("html");
  await expect(root).toHaveAttribute("data-c2-source","template",{timeout:60_000});
  await expect(root).toHaveAttribute("data-c35-face-ready","false");
  await page.locator("#view-select").selectOption("head-front");
  const initialCamera=await page.locator("#viewport").getAttribute("data-camera-state");
  await page.locator("#c35-face-refinement").check();
  await expect(root).toHaveAttribute("data-c35-face-ready","true",{timeout:60_000});
  await expect(root).toHaveAttribute("data-c2-source","template");
  await expect(root).toHaveAttribute("data-c2-jaw-direction","passed");
  await expect(page.locator("#c35-face-audit")).toContainText("26 semantic control regions");
  const refinedVertices=Number(await root.getAttribute("data-c35-face-vertices"));
  expect(refinedVertices).toBeGreaterThan(14517);
  // Refinement must preserve user camera, rather than reframe on rebuild.
  expect(await page.locator("#viewport").getAttribute("data-camera-state")).toBe(initialCamera);
  const platform=test.info().project.name;
  mkdirSync("test-results/c35",{recursive:true});
  // Head-front is the baseline; orbit to a genuine three-quarter render.
  await page.locator("#view-select").selectOption("head-front");
  const rect=await page.locator("#viewport canvas").boundingBox();
  if(!rect)throw new Error("Missing Chromium facial rendering canvas");
  const x=rect.x+rect.width*.5,y=rect.y+rect.height*.55;
  await page.mouse.move(x,y);
  await page.mouse.down();
  await page.mouse.move(x+rect.width*.17,y,{steps:12});
  await page.mouse.up();
  await page.locator("#viewport").screenshot({
    path:"test-results/c35/"+platform+"-head-three-quarter.png",
  });
  for(const view of ["head-front","head-side"]){
    await page.locator("#view-select").selectOption(view);
    await expect(page.locator("#view-select")).toHaveValue(view);
    await page.locator("#viewport").screenshot({
      path:"test-results/c35/"+platform+"-"+view+"-neutral.png",
    });
  }
  await page.getByText("Geometry overlays",{exact:true}).click();
  await page.locator('[data-debug="wireframe"]').check();
  await page.locator("#view-select").selectOption("head-front");
  await page.locator("#viewport").screenshot({
    path:"test-results/c35/"+platform+"-front-wireframe.png",
  });
  await page.locator("#view-select").selectOption("head-side");
  await page.locator("#viewport").screenshot({
    path:"test-results/c35/"+platform+"-profile-wireframe.png",
  });
  await page.locator('[data-debug="wireframe"]').uncheck();
  await page.locator("#pose-select").selectOption("jaw");
  await expect(page.locator("#status")).toContainText("jaw");
  await page.locator("#viewport").screenshot({
    path:"test-results/c35/"+platform+"-jaw-open-profile.png",
  });
  await page.locator("#pose-select").selectOption("neutral");
  await page.locator("#c35-face-refinement").uncheck();
  await expect(root).toHaveAttribute("data-c35-face-ready","false",{timeout:60_000});
  await expect(root).toHaveAttribute("data-c2-source","template");
  expect(errors).toEqual([]);
});

test("C3.5 source-derived face never exposes rejected synthetic cavities",async({page})=>{
  await page.goto("/c2-lab.html");
  await expect(page.locator("html")).toHaveAttribute("data-c2-source","template",{timeout:60_000});
  await expect(page.locator("#c35-face-apertures")).toHaveCount(0);
  await page.locator("#c35-face-refinement").check();
  await expect(page.locator("html")).toHaveAttribute("data-c35-face-ready","true",{timeout:60_000});
  await expect(page.locator("html")).toHaveAttribute("data-c35-apertures-ready","false");
  await expect(page.locator("#c35-face-audit")).toContainText("No invented facial cavities");
  await page.locator("#view-select").selectOption("head-front");
  await page.locator("#viewport").screenshot({
    path:"test-results/c35/"+test.info().project.name+"-source-face-front.png",
  });
});
