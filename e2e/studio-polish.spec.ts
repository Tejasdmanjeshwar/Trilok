import {test,expect} from "@playwright/test";
import {mkdirSync} from "node:fs";

test("Studio keyboard editing, filters and camera work without unexpected resets",async({page})=>{
  test.setTimeout(180_000);
  const errors:string[]=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.goto("/studio/");
  await expect(page.locator("html")).toHaveAttribute("data-studio-ready","true",{timeout:90_000});
  const canvas=page.locator("#studio-viewport canvas");
  await expect(canvas).toHaveAttribute("tabindex","0");
  await canvas.focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("+");
  await page.getByRole("button",{name:"Face",exact:true}).click();
  await page.locator("#studio-control-search").fill("ear");
  await page.getByRole("button",{name:"Body",exact:true}).click();
  await page.getByRole("button",{name:"Face",exact:true}).click();
  await expect(page.locator("#studio-control-search")).toHaveValue("ear");
  await expect(page.locator("#studio-control-count")).toBeVisible();
  await page.locator("#studio-control-search").fill("");
  await page.getByRole("button",{name:"View",exact:true}).click();
  await page.locator("#studio-focus-area").selectOption("face");
  await page.locator("#studio-focus").click();
  await page.locator('[data-view="rear"]').click();
  await expect(page.locator("#studio-return-focus")).toBeEnabled();
  const metrics=await page.evaluate(()=>new Promise<unknown>(resolve=>{
    window.addEventListener("trilok:studio:metrics",
      e=>resolve((e as CustomEvent).detail),{once:true});
    window.dispatchEvent(new Event("trilok:studio:request-metrics"));
  }));
  const evidence=metrics as {initialLoadMs:number|null;frames:{samples:number};
    gpu:{geometries:number;textures:number}|null;edits:{samples:number}};
  expect(evidence.initialLoadMs).not.toBeNull();
  expect(evidence.initialLoadMs).toBeGreaterThanOrEqual(0);
  expect(evidence.frames.samples).toBeGreaterThan(0);
  expect(evidence.gpu).not.toBeNull();
  expect(evidence.gpu!.geometries).toBeGreaterThan(0);
  expect(await page.locator("body").evaluate(el=>el.scrollWidth<=innerWidth+1)).toBe(true);
  mkdirSync("test-results/studio",{recursive:true});
  await page.screenshot({path:"test-results/studio/"+test.info().project.name+"-polish.png",fullPage:true});
  expect(errors).toEqual([]);
});
