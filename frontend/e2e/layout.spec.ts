import { test, expect } from "./fixtures";

test("layout selection is saved and can be applied", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByRole("switch", { name: "Edit mode" }).click();
  const selector = page.getByLabel("Layout shape");
  await selector.selectOption("radial");
  await page.getByRole("button", { name: "Auto layout" }).click();
  await page.screenshot({ path: testInfo.outputPath("desktop-layout.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: testInfo.outputPath("narrow-layout.png") });
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("button", { name: "Save changes" })).toHaveCount(0);
  await page.reload();
  await page.getByRole("switch", { name: "Edit mode" }).click();
  await expect(page.getByLabel("Layout shape")).toHaveValue("radial");
});
