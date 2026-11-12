import { mkdirSync } from "node:fs";
import { test, expect } from "@playwright/test";

test("C2 anatomical preview renders stable deformation poses on desktop and touch",async({page},testInfo)=>{
  const errors:string[]=[];
  page.on("pageerror",e=>errors.push(e.message));
  await page.goto("/c2-preview.html");
  await expect(page.locator("html")).toHaveAttribute("data-c2-ready","true",{timeout:30_000});
  await expect(page.locator("#c2-geometry")).toContainText("26756 triangles");
  await expect(page.locator("#c2-rig")).toContainText("influences");
  await expect(page.locator("#c2-status")).toContainText("validation passed");

  // Explicit on-disk golden-capture candidates: Playwright's default
  // attachment retention removes successful test output otherwise.
  mkdirSync("c2-captures",{recursive:true});
  const capture=async(name:string):Promise<void>=>{
    await page.locator("#c2-view canvas").screenshot({
      path:"c2-captures/"+testInfo.project.name+"-"+name+".png",
      animations:"disabled",
    });
  };
  await capture("neutral-front");

  for(const pose of ["t_pose","shoulder_raise","arms_overhead","elbow_flex",
    "forearm_twist","crouch","neck_look","asymmetry","neutral"]){
    await page.locator("#c2-pose").selectOption(pose);
    await expect(page.locator("#c2-stress")).toContainText(pose);
    await capture(pose+"-front");
  }
  await page.locator("#c2-skeleton").selectOption("rig");
  await page.locator("#c2-camera").selectOption("three_quarter");
  await capture("rig-three-quarter");
  await page.locator("#c2-skeleton").selectOption("wire");
  await capture("wire-three-quarter");
  expect(errors).toEqual([]);
});
