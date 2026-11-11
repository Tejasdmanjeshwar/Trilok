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

test("the build and touch/keyboard combat controls remain interactive",async ({page})=>{
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
  if(test.info().project.name==="touch-chromium"){
    await expect(page.locator("#attack")).toBeVisible();
    await expect(page.locator("#dodge")).toBeVisible();
  }else{
    await page.keyboard.press("Digit2");
    await expect(page.locator("#weapon-deck .is-equipped")).toContainText("Sword");
  }
  await expect(page.locator("#runtime-fault")).toBeHidden();
  expect(pageErrors).toEqual([]);
});

test("D12 sword attacks expose an optional rhythmic execution prompt",async ({page})=>{
  const errors:string[]=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.goto("/");
  await expect(page.locator("#loading")).toBeHidden({timeout:15000});
  await page.keyboard.press("Digit2");
  await expect(page.locator("#weapon-deck .is-equipped")).toContainText("Sword");
  await page.locator("#attack").click();
  await expect(page.locator("#offense-rhythm")).toBeVisible();
  await expect(page.locator("#rhythm-input")).toBeVisible();
  // No beat is required to complete combat; input is an optional reward.
  await expect(page.locator("#offense-rhythm")).toBeHidden({timeout:15000});
  await expect(page.locator("#runtime-fault")).toBeHidden();
  expect(errors).toEqual([]);
});

test("D13 sustains multiple enemy decisions without a soft-lock",async ({page})=>{
  // Rendering two whole undefended enemy turns with software WebGL can exceed
  // the default 45s test budget; a real stall still fails the strict deadline.
  test.setTimeout(95_000);
  const errors:string[]=[];
  page.on("pageerror",error=>errors.push(error.message));
  await page.goto("/");
  await expect(page.locator("#loading")).toBeHidden({timeout:15000});
  for(let turn=0;turn<2;turn++){
    await expect(page.locator("#end-turn")).toBeEnabled({timeout:20000});
    await page.locator("#end-turn").click();
    // An undefended fighter may legitimately lose after repeated enemy turns.
    // Victory/defeat are terminal game states, NOT runtime soft-locks.
    await expect(page.locator("#phase")).toContainText(/YOUR ACTION|DEFEAT/,
      {timeout:70000});
    await expect(page.locator("#runtime-fault")).toBeHidden();
    if((await page.locator("#phase").textContent())?.includes("DEFEAT")){
      await page.locator("#restart").click();
      await expect(page.locator("#end-turn")).toBeEnabled();
      await expect(page.locator("#hero-hp")).toContainText("100 / 100");
    }
  }
  expect(errors).toEqual([]);
});
