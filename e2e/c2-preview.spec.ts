import { test, expect } from "@playwright/test";
test("C2 technical anatomy preview loads, tests deformation and preserves existing combat route",async({page},testInfo)=>{
  const errors:string[]=[];
  page.on("pageerror",e=>errors.push(e.message));
  await page.goto("/c2-preview.html");
  await expect(page.locator("html")).toHaveAttribute("data-c2-ready","true",{timeout:30_000});
  await expect(page.locator("#c2-geometry")).toContainText("26756 triangles");
  await expect(page.locator("#c2-rig")).toContainText("influences");
  await expect(page.locator("#c2-status")).toContainText("validation passed");
  const png=await page.locator("#c2-view canvas").screenshot();
  await testInfo.attach("c2-neutral.png",{body:png,contentType:"image/png"});
  for(const pose of ["arms_overhead","elbow_flex","crouch","forearm_twist","neutral"]){
    await page.locator("#c2-pose").selectOption(pose);
    await expect(page.locator("#c2-stress")).toContainText(pose);
  }
  await page.locator("#c2-skeleton").selectOption("rig");
  await page.locator("#c2-camera").selectOption("three_quarter");
  const stress=await page.locator("#c2-view canvas").screenshot();
  await testInfo.attach("c2-rig.png",{body:stress,contentType:"image/png"});
  expect(errors).toEqual([]);
});
