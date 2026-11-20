import {test,expect} from "@playwright/test";

/** C6.3: Player Studio never requests the development-time Kevin archive. */
test("C6.3 keeps UAL1 functional without a player ZIP import route",async({page})=>{
  test.setTimeout(180_000);
  await page.emulateMedia({reducedMotion:"reduce"});
  await page.goto("/studio/");
  await expect(page.locator("html")).toHaveAttribute("data-studio-ready","true",
    {timeout:90_000});
  await page.locator('[data-section="pose"]').click();
  await expect(page.locator("#studio-kevin-local")).toHaveCount(0);
  await expect(page.locator("#studio-kevin-file")).toHaveCount(0);
  await expect(page.locator('input[type="file"]')).toHaveCount(0);
  for(const id of ["human-idle","human-walk","human-jog","human-sprint"])
    await expect(page.locator('#studio-animation-select option[value="'+id+'"]')).toHaveCount(1);
  await page.locator("#studio-animation-select").selectOption("human-walk");
  await expect(page.locator("#studio-animation-play")).toBeEnabled();
  await expect(page.locator("#studio-error")).toBeHidden();
});
