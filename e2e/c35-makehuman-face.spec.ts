import {test,expect} from "@playwright/test";
import {mkdirSync} from "node:fs";

test("C3.5 original MakeHuman facial targets render with camera-stable unilateral control and stress",async({page})=>{
  test.setTimeout(180_000);
  const failures:string[]=[];
  page.on("pageerror",e=>failures.push(e.message));
  await page.emulateMedia({reducedMotion:"reduce"});
  await page.goto("/c2-lab.html");
  await expect(page.locator("html")).toHaveAttribute("data-c2-source","template",{timeout:90_000});
  await expect(page.locator("html")).toHaveAttribute("data-c35-facial-ready","true",{timeout:90_000});
  const output=page.locator("#c35-facial-diagnostics");
  const preset=page.locator("#c35-facial-preset");
  const platform=test.info().project.name;
  mkdirSync("test-results/c35",{recursive:true});
  const capture=async(name:string,view:string,pose="neutral")=>{
    await page.locator("#view-select").selectOption(view);
    await page.locator("#pose-select").selectOption(pose);
    await page.locator("#viewport").screenshot({path:`test-results/c35/${platform}-${name}.png`});
  };
  await capture("neutral-front","head-front");
  await capture("neutral-three-quarter","head-three-quarter");
  // Inspect actual MakeHuman native-range modifiers independently of stress.
  const nativeNose=page.locator('[data-facial-control="native/nose/nose-flaring-decr-incr"]');
  await nativeNose.evaluate(node=>{
    const input=node as HTMLInputElement;input.value="1";
    input.dispatchEvent(new Event("input",{bubbles:true}));
  });
  await expect(nativeNose).toHaveValue("1");
  await capture("native-nose-max-front","head-front");
  await capture("native-nose-max-side","head-side");
  await page.locator("#c35-reset-facial").click();
  // Compare C1-only jaw motion against source-only mouth opening and the
  // coordinated composition. All three remain separate authoring controls.
  await capture("jaw-only","head-three-quarter","jaw");
  await capture("jaw-only-front","head-front","jaw");
  await page.locator("#pose-select").selectOption("neutral");
  const nativeMouth=page.locator('[data-facial-control="native/expression/mouth-open"]');
  await nativeMouth.evaluate(node=>{
    const input=node as HTMLInputElement;input.value="1";
    input.dispatchEvent(new Event("input",{bubbles:true}));
  });
  await capture("native-mouth-max-front","head-front");
  const sourceOpening=Number(await page.locator("html").getAttribute("data-c37-jaw-source-radians"));
  expect(sourceOpening).toBeGreaterThan(.1);
  await capture("native-mouth-max-jaw","head-three-quarter","jaw");
  const effectiveOpening=Number(await page.locator("html").getAttribute("data-c37-jaw-effective-radians"));
  expect(effectiveOpening).toBeGreaterThanOrEqual(0);
  expect(effectiveOpening).toBeLessThan(.4);
  expect(effectiveOpening+sourceOpening).toBeCloseTo(.4,5);
  await capture("native-mouth-max-jaw-front","head-front","jaw");
  await capture("native-mouth-max-jaw-side","head-side","jaw");
  await page.locator("#c35-reset-facial").click();
  await preset.selectOption("blink");
  await expect(page.locator('[data-facial-control="leftLid"]')).toHaveValue("1");
  await expect(output).toContainText("Source-affected vertices:");
  await capture("bilateral-lids-front","head-front");
  await capture("bilateral-lids-side","head-side");
  await preset.selectOption("asymmetric");
  await capture("unilateral-brows-lips","head-front");
  await preset.selectOption("surprised");
  await capture("eyes-mouth-three-quarter","head-three-quarter");
  await capture("mouth-jaw-side","head-side","jaw");
  await preset.selectOption("wide");
  await capture("nose-chin-ears-front","head-front");
  await preset.selectOption("stress");
  await capture("extreme-front","head-front");
  await capture("extreme-side","head-side");
  await capture("extreme-jaw","head-three-quarter","jaw");
  const diagnostics=await output.innerText();
  console.log("C3.5 empirical extreme diagnostics",platform,diagnostics);
  expect(diagnostics).not.toContain("facial source unavailable");
  expect(diagnostics).toContain("inverted:");
  await page.getByText("Geometry overlays",{exact:true}).click();
  await page.locator('[data-debug="wireframe"]').check();
  await capture("extreme-wireframe-front","head-front");
  await page.locator('[data-debug="wireframe"]').uncheck();
  await page.locator("#c35-reset-facial").click();
  await expect(preset).toHaveValue("neutral");
  await expect(page.locator('[data-facial-control="leftLid"]')).toHaveValue("0");
  await capture("reset-front","head-front");

  const view=page.locator("#viewport");
  const cameraBefore=await view.getAttribute("data-camera-state");
  await page.locator('[data-facial-control="leftLid"]').evaluate(node=>{
    const input=node as HTMLInputElement;
    input.value="1.25";
    input.dispatchEvent(new Event("input",{bubbles:true}));
  });
  await expect(page.locator('[data-facial-control="leftLid"]')).toHaveValue("1.25");
  expect(await view.getAttribute("data-camera-state")).toBe(cameraBefore);
  await page.locator("#head-preset").selectOption("broad");
  await expect(page.locator("html")).toHaveAttribute("data-c3-head-ready","true",{timeout:90_000});
  await expect(page.locator("html")).toHaveAttribute("data-c35-facial-ready","true",{timeout:90_000});
  await expect(page.locator('[data-facial-control="leftLid"]')).toHaveValue("1.25");
  await capture("c34-combined","head-three-quarter");
  expect(failures).toEqual([]);
  // 1.25 is outside MakeHuman's supported native range: preserve evidence
  // of stretching/inversions without mistakenly failing native fidelity.
  console.log("Unsupported MakeHuman extrapolation is visual evidence only:",diagnostics);
});