import { test, expect } from "./fixtures";

test("previews and imports a JSON file", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByRole("switch", { name: "Edit mode" }).click();
  await page.getByRole("button", { name: "Import project" }).click();
  const file = page.getByLabel("Choose a JSON file");
  await file.setInputFiles({ name: "invalid.json", mimeType: "application/json", buffer: Buffer.from("{}") });
  await expect(page.getByRole("alert")).toContainText("Could not validate");
  await file.setInputFiles({ name: "project.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({
    version: 2,
    project: { name: "Imported project" },
    pages: [{ key: "main", name: "Imported tree", quests: ["first"], layout: "branching" }],
    quests: [{ key: "first", title: "First quest", homePage: "main", iconName: "emoji:🦕" }],
  })) });
  await expect(page.getByText("1 quests, 0 dependencies")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("desktop.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: testInfo.outputPath("narrow.png") });
  await expect(page.getByRole("button", { name: "Imported project" })).toHaveCount(0);
  await page.getByRole("button", { name: "Create project" }).click();
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(page.getByRole("button", { name: "Imported project" })).toBeVisible();
  await page.getByRole("button", { name: "Imported tree" }).click();
  await expect(page.getByText("🦕")).toBeVisible();
  await expect(page.locator(".quest-node .quest-emoji")).toHaveCSS("z-index", "1");
  await expect(page.locator(".quest-node .quest-emoji")).toHaveCSS("filter", "grayscale(1)");
  await page.screenshot({ path: testInfo.outputPath("narrow-emoji.png") });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: testInfo.outputPath("desktop-emoji.png") });
  await page.getByRole("switch", { name: "Edit mode" }).click();
  await page.getByRole("button", { name: /First quest/ }).click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Custom emoji").fill("👩🏽‍🚀");
  await page.screenshot({ path: testInfo.outputPath("desktop-editor.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: testInfo.outputPath("narrow-editor.png") });
  await page.getByRole("button", { name: "Save quest" }).click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("button", { name: "Save changes" })).toHaveCount(0);
  await page.reload();
  await expect(page.getByText("👩🏽‍🚀")).toBeVisible();
});
