import { test, expect, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";

/**
 * Browser parity after retiring the standalone C2 Character Lab.
 * These use the shipped Studio's actual MakeHuman source-skinned human.
 * Deep geometric invariants and numeric jaw coordination remain in
 * character-c2-5 / character-c3-5 / character-c3-6 headless tests.
 */
const enter = async (page: Page) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/studio/");
  await expect(page.locator("html")).toHaveAttribute("data-studio-ready", "true",
    { timeout: 90_000 });
  await expect(page.locator("#studio-viewport canvas")).toBeVisible();
  await expect(page.locator("#studio-error")).toBeHidden();
};
const section = async (page: Page, name: string) => {
  await page.getByRole("button", { name, exact: true }).click();
};
const capture = async (page: Page, name: string) => {
  mkdirSync("test-results/studio-source-parity", { recursive: true });
  await page.locator("#studio-viewport canvas").screenshot({
    path: "test-results/studio-source-parity/" + test.info().project.name + "-" + name + ".png",
  });
};

test("Canonical Studio replaces C2 Lab's skinned-pose and inspection viewport", async ({page}) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await enter(page);
  await section(page, "View");
  for (const angle of ["front", "side", "rear", "three-quarter"]) {
    await page.locator('[data-view="' + angle + '"]').click();
    await expect(page.locator('[data-view="' + angle + '"]')).toHaveAttribute("aria-pressed", "true");
    await capture(page, "neutral-" + angle);
  }
  await page.locator("#studio-focus-area").selectOption("left-hand");
  await page.locator("#studio-focus").click();
  await expect(page.locator("#studio-return-focus")).toBeEnabled();
  await page.locator("#studio-return-focus").click();
  await section(page, "Pose");
  for (const id of ["shoulder", "shoulder-combined", "crouch", "knee-stress", "fist", "jaw", "neck-jaw"]) {
    await page.locator("#studio-pose-select").selectOption(id);
    await expect(page.locator("#studio-pose-select")).toHaveValue(id);
  }
  await section(page, "Inspect");
  await page.locator("#studio-inspect-skeleton").check();
  await page.locator("#studio-inspect-wireframe").check();
  await page.locator("#studio-inspect-joints").check();
  await capture(page, "jaw-skeleton-wireframe");
  await page.locator("#studio-inspect-skeleton").uncheck();
  await page.locator("#studio-inspect-wireframe").uncheck();
  await page.locator("#studio-inspect-joints").uncheck();
  await section(page, "Pose");
  await page.locator("#studio-pose-select").selectOption("neutral");
  await expect(page.locator("#studio-error")).toBeHidden();
  expect(errors).toEqual([]);
});

test("Original MakeHuman face controls render on Studio skin, jaw and camera modes", async ({page}) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await enter(page);
  await section(page, "Face");
  await expect(page.getByRole("heading", { name:"Shape the face" })).toBeVisible();
  await page.locator("#studio-preset").selectOption("blink");
  await expect(page.locator("#studio-editor-message")).toBeEmpty({timeout:90_000});
  await capture(page,"facial-blink");
  await page.locator("#studio-preset").selectOption("asymmetric");
  await expect(page.locator("#studio-editor-message")).toBeEmpty({timeout:90_000});
  await capture(page,"facial-asymmetric");
  await page.locator("#studio-advanced").check();
  await page.locator("#studio-group").selectOption("all");
  await page.locator("#studio-control-search").fill("mouth-open");
  const mouth = page.locator('[data-control-id="face:native/expression/mouth-open"] input[type=number]');
  await expect(mouth).toBeVisible();
  await mouth.fill("1"); await mouth.press("Tab");
  await expect(page.locator("#studio-editor-message")).toBeEmpty({timeout:90_000});
  await section(page,"Pose");
  await page.locator("#studio-pose-select").selectOption("jaw");
  await section(page,"View");
  await page.locator('[data-view="side"]').click();
  await capture(page,"facial-open-mouth-jaw-side");
  await page.locator('[data-view="front"]').click();
  await capture(page,"facial-open-mouth-jaw-front");
  await section(page,"Face");
  await page.locator("#studio-section-reset").click();
  await expect(page.locator("#studio-editor-message")).toBeEmpty({timeout:90_000});
  await capture(page,"facial-reset");
  expect(errors).toEqual([]);
});

test("Pinned MakeHuman body morphs and infant ages render with stable Studio camera", async ({page}) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await enter(page);
  const manifest = await page.request.get("/anatomy/makehuman-body-v1-index.json");
  expect(manifest.ok()).toBe(true);
  const metadata = await manifest.json() as {
    targetCount: number; chunks: {name:string;compressedBytes:number}[]
  };
  expect(metadata.targetCount).toBe(846);
  expect(metadata.chunks.length).toBeGreaterThan(0);
  for (const chunk of metadata.chunks) {
    expect(chunk.compressedBytes).toBeLessThan(12 * 1024 * 1024);
    expect((await page.request.get("/anatomy/" + chunk.name)).ok()).toBe(true);
  }
  await section(page, "Body");
  for (const preset of ["wideShoulders", "largeHands", "muscular"]) {
    await page.locator("#studio-preset").selectOption(preset);
    await expect(page.locator("#studio-editor-message")).toBeEmpty({timeout:90_000});
    await capture(page,"body-" + preset);
  }
  await section(page, "View");
  await page.locator('[data-view="side"]').click();
  await section(page, "Body");
  const age=page.locator('[data-control-id="body:macro/age"] input[type=number]');
  await expect(age).toBeVisible();
  for (const value of ["0", "0.03", "0.05", "0.06", "0.1875"]) {
    await age.fill(value); await age.press("Tab");
    await expect(page.locator("#studio-editor-message")).toBeEmpty({timeout:90_000});
    await expect(page.locator("#studio-error")).toBeHidden();
    await capture(page,"body-age-" + value);
  }
  await section(page,"View");
  await expect(page.locator('[data-view="side"]')).toHaveAttribute("aria-pressed","true");
  await section(page,"Body");
  await page.locator("#studio-section-reset").click();
  await expect(age).toHaveValue("0.5");
  await expect(page.locator("#studio-editor-message")).toBeEmpty({timeout:90_000});
  await capture(page,"body-reset");
  expect(errors).toEqual([]);
});
