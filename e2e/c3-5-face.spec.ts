import {test,expect} from "@playwright/test";
import {mkdirSync} from "node:fs";

test("C3.5 integrated human face preserves regular source, poses, and multi-angle captures",async({page})=>{
  test.setTimeout(180_000);
  const errors:string[]=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.goto("/c2-lab.html");
  const root=page.locator("html");
  await expect(root).toHaveAttribute("data-c2-source","template",{timeout:60_000});
  await expect(root).toHaveAttribute("data-c35-face-ready","true",{timeout:60_000});
  await expect(root).toHaveAttribute("data-c2-jaw-direction","passed");
  await expect(page.locator("#c35-face-audit")).toContainText("26 semantic control regions");
  expect(Number(await root.getAttribute("data-c35-face-vertices"))).toBeGreaterThan(14517);
  await expect(page.locator("#c35-face-refinement")).toHaveCount(0);
  await expect(page.locator("#c35-face-apertures")).toHaveCount(0);
  const prefix="test-results/c35/"+test.info().project.name+"-";
  mkdirSync("test-results/c35",{recursive:true});
  await page.locator("#view-select").selectOption("head-front");
  const rect=await page.locator("#viewport canvas").boundingBox();
  if(!rect)throw new Error("Missing Chromium rendering canvas");
  const x=rect.x+rect.width*.5,y=rect.y+rect.height*.55;
  await page.mouse.move(x,y);
  await page.mouse.down();
  await page.mouse.move(x+rect.width*.17,y,{steps:12});
  await page.mouse.up();
  await page.locator("#viewport").screenshot({path:prefix+"head-three-quarter.png"});
  for(const view of ["head-front","head-side"]){
    await page.locator("#view-select").selectOption(view);
    await page.locator("#viewport").screenshot({path:prefix+view+"-neutral.png"});
  }
  await page.getByText("Geometry overlays",{exact:true}).click();
  await page.locator('[data-debug="wireframe"]').check();
  await page.locator("#view-select").selectOption("head-front");
  await page.locator("#viewport").screenshot({path:prefix+"front-wireframe.png"});
  await page.locator("#view-select").selectOption("head-side");
  await page.locator("#viewport").screenshot({path:prefix+"profile-wireframe.png"});
  await page.locator('[data-debug="wireframe"]').uncheck();
  await page.locator("#pose-select").selectOption("jaw");
  await expect(page.locator("#status")).toContainText("jaw");
  await page.locator("#viewport").screenshot({path:prefix+"jaw-open-profile.png"});
  await page.locator("#pose-select").selectOption("neutral");
  expect(errors).toEqual([]);
});

test("C3.5 regular facial controls expose exact high-amplitude failures and preserve camera",async({page})=>{
  test.setTimeout(180_000);
  const errors:string[]=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.goto("/c2-lab.html");
  const root=page.locator("html");
  await expect(root).toHaveAttribute("data-c35-face-ready","true",{timeout:60_000});
  await expect(root).toHaveAttribute("data-c35-inverted-triangles","0");
  await page.locator("#view-select").selectOption("head-front");
  const initialCamera=await page.locator("#viewport").getAttribute("data-camera-state");
  const mouth=page.locator("#c35-control-mouth");
  await expect(mouth).toHaveAttribute("max","300");
  await page.locator("#c35-expression-preset").selectOption("combined");
  await expect(root).not.toHaveAttribute("data-c35-inverted-triangles","unavailable");
  // The original source-space independent radial fields are not
  // anatomically safe at large amplitudes. Show, don't hide, those failures.
  await mouth.fill("300");
  await mouth.dispatchEvent("input");
  await expect(root).toHaveAttribute("data-c35-inverted-triangles",/^[1-9]\d*$/);
  await expect(page.locator("#c35-stress-audit")).toContainText("INVERTED triangles");
  expect(await page.locator("#viewport").getAttribute("data-camera-state"))
    .toBe(initialCamera);
  mkdirSync("test-results/c35",{recursive:true});
  const prefix="test-results/c35/"+test.info().project.name+"-extreme-";
  await page.locator("#viewport").screenshot({path:prefix+"front-failures.png"});
  await page.locator("#view-select").selectOption("head-side");
  await page.locator("#viewport").screenshot({path:prefix+"side-failures.png"});
  await page.locator("#c35-reset-facial").click();
  await expect(root).toHaveAttribute("data-c35-inverted-triangles","0");
  await expect(page.locator("#c35-control-mouth")).toHaveValue("0");
  await page.locator("#head-preset").selectOption("extreme");
  await expect(root).toHaveAttribute("data-c35-face-ready","true",{timeout:60_000});
  await expect(page.locator("#head-skullWidth")).toHaveValue("1.25");
  await expect(page.locator("#c35-face-audit")).toContainText("26 semantic control regions");
  await page.locator("#view-select").selectOption("head-front");
  await page.locator("#viewport").screenshot({path:prefix+"extreme-head.png"});
  expect(errors).toEqual([]);
});
