import {test,expect} from "@playwright/test";
import {mkdirSync} from "node:fs";

test("C3.6 pinned original MakeHuman body morphology and camera preservation",async({page})=>{
  test.setTimeout(240_000);
  const errors:string[]=[];
  page.on("pageerror",e=>errors.push(e.message));
  await page.emulateMedia({reducedMotion:"reduce"});
  await page.goto("/c2-lab.html");
  await expect(page.locator("html")).toHaveAttribute("data-c2-source","template",{timeout:90_000});
  const preset=page.locator("#c36-body-preset");
  const diag=page.locator("#c36-body-diagnostics");
  const viewport=page.locator("#viewport");
  const platform=test.info().project.name;
  mkdirSync("test-results/c36",{recursive:true});
  const capture=async(id:string,view:string)=>{
    await page.locator("#view-select").selectOption(view);
    await viewport.screenshot({path:`test-results/c36/${platform}-${id}.png`});
  };
  await capture("neutral-front","front");
  await preset.selectOption("wideShoulders");
  await expect(diag).toContainText("Source-affected vertices:",{timeout:180_000});
  await expect(page.locator("html")).toHaveAttribute("data-c36-body-ready","true");
  await capture("native-wide-torso","front");
  await preset.selectOption("largeHands");
  await expect(diag).toContainText("Source-affected vertices:",{timeout:180_000});
  await capture("native-large-hands","hand-left");
  await preset.selectOption("muscular");
  await expect(diag).toContainText("native-range preview",{timeout:180_000});
  await capture("muscle-weight","front");
  const previous=await viewport.getAttribute("data-camera-state");
  await page.locator('[data-body-control="native/torso/torso-scale-horiz-decr-incr"]')
    .evaluate(node=>{
      const input=node as HTMLInputElement;
      input.value="1";input.dispatchEvent(new Event("change",{bubbles:true}));
    });
  await expect(diag).toContainText("Source-affected vertices:",{timeout:180_000});
  expect(await viewport.getAttribute("data-camera-state")).toBe(previous);
  await preset.selectOption("stress");
  await expect(diag).toContainText("unsupported stress",{timeout:180_000});
  await capture("extreme-side","side");
  await capture("extreme-wireframe","front");
  await page.locator("#c36-reset-body").click();
  await expect(preset).toHaveValue("neutral");
  await capture("reset-front","front");
  await page.locator("#c35-facial-preset").selectOption("blink");
  await expect(page.locator("html")).toHaveAttribute("data-c35-facial-ready","true");
  await expect(page.locator("#c35-facial-diagnostics")).toContainText("Source-affected vertices:");
  expect(errors).toEqual([]);
});
