import {test,expect} from "@playwright/test";

/** Asset-free privacy/selection gate. Real licensed FBX never enters CI. */
test("C6.3 Kevin local review is opt-in and preserves approved UAL1 controls",async({page})=>{
  test.setTimeout(180_000);
  await page.emulateMedia({reducedMotion:"reduce"});
  await page.goto("/studio/");
  await expect(page.locator("html")).toHaveAttribute("data-studio-ready","true",{timeout:90_000});
  await page.locator('[data-section="pose"]').click();
  await expect(page.locator("#studio-kevin-local")).toBeHidden();
  await expect(page.locator("#studio-animation-select option")).toHaveText([
    "Static pose","Idle","Walk","Jog","Sprint",
  ]);
  await page.goto("/studio/?c63-kevin-local-review");
  await expect(page.locator("html")).toHaveAttribute("data-studio-ready","true",{timeout:90_000});
  await page.locator('[data-section="pose"]').click();
  await expect(page.locator("#studio-kevin-local")).toBeVisible();
  await expect(page.locator("#studio-kevin-file")).toHaveAttribute("type","file");
  await expect(page.locator("#studio-kevin-notice")).toContainText("never uploaded");
  await expect(page.locator("#studio-animation-select option")).toHaveText([
    "Static pose","Idle","Walk","Jog","Sprint",
  ]);
});
test("C6.3 rejects impostor local archives without replacing approved clips",async({page})=>{
  test.setTimeout(180_000);
  const pageErrors:string[]=[];
  page.on("pageerror",error=>pageErrors.push(error.message));
  await page.goto("/studio/?c63-kevin-local-review");
  await expect(page.locator("html")).toHaveAttribute("data-studio-ready","true",{timeout:90_000});
  await page.locator('[data-section="pose"]').click();
  await page.locator("#studio-kevin-file").setInputFiles({
    name:"Human Basic Motions FREE.zip",
    mimeType:"application/zip",
    buffer:Buffer.from("not the owner's verified ZIP"),
  });
  await expect(page.locator("#studio-kevin-status")).toContainText(
    /Kevin source rejected:/,{timeout:30_000});
  await expect(page.locator("#studio-animation-select option")).toHaveText([
    "Static pose","Idle","Walk","Jog","Sprint",
  ]);
  await page.locator("#studio-animation-select").selectOption("human-walk");
  await expect(page.locator("#studio-animation-play")).toBeEnabled();
  await expect(page.locator("#studio-error")).toBeHidden();
  expect(pageErrors).toEqual([]);
});
