import { test, expect } from "@playwright/test";

test("combat survives the enemy's first melee turn and can restart", async ({page}) => {
  const pageErrors:string[]=[];
  page.on("pageerror",error=>pageErrors.push(error.message));
  await page.goto("/");
  await expect(page.locator("#loading")).toBeHidden({timeout:15_000});
  await expect(page.locator("#end-turn")).toBeEnabled();

  // D8 regression: opening rapid slash used to throw inside the WebGL loop.
  await page.locator("#end-turn").click();
  await expect(page.locator("#phase")).toContainText("YOUR ACTION",{timeout:30_000});
  await expect(page.locator("#runtime-fault")).toBeHidden();
  expect(pageErrors).toEqual([]);

  // Reset must release pending projectiles, animations, wounds and buffered inputs.
  await page.locator("#restart").click();
  await expect(page.locator("#hero-hp")).toContainText("100 / 100");
  await expect(page.locator("#end-turn")).toBeEnabled();
  await expect(page.locator("#runtime-fault")).toBeHidden();
  expect(pageErrors).toEqual([]);
});

test("the build and touch/keyboard combat controls remain interactive",async ({page,isMobile})=>{
  const pageErrors:string[]=[];
  page.on("pageerror",error=>pageErrors.push(error.message));
  await page.goto("/");
  await expect(page.locator("#loading")).toBeHidden({timeout:15_000});
  await expect(page.locator("#build-summary")).toContainText(/BUILD/);
  await expect(page.locator("#attack")).toBeEnabled();
  await page.locator("#quality").click();
  await expect(page.locator("#quality")).toContainText(/HIGH|MOBILE/);
  await page.locator("#restart").click();
  await expect(page.locator("#phase")).toContainText("YOUR ACTION");
  if(isMobile){
    await expect(page.locator("#attack")).toBeVisible();
    await expect(page.locator("#dodge")).toBeVisible();
  }else{
    await page.keyboard.press("Digit2");
    await expect(page.locator("#weapon-deck .is-equipped")).toContainText("Sword");
  }
  await expect(page.locator("#runtime-fault")).toBeHidden();
  expect(pageErrors).toEqual([]);
});
