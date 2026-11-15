import { test, expect } from "./fixtures";

test("previews and imports a JSON file", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByRole("switch", { name: "Edit mode" }).click();
  await page.getByRole("button", { name: "Import project" }).click();
  const file = page.getByLabel("Choose a JSON file");
  await file.setInputFiles({ name: "invalid.json", mimeType: "application/json", buffer: Buffer.from("{}") });
  await expect(page.getByRole("alert")).toContainText("Could not validate");
  await file.setInputFiles({ name: "project.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify({
    version: 1,
    project: { name: "Imported project" },
    pages: [{ key: "main", name: "Imported tree", quests: ["first"] }],
    quests: [{ key: "first", title: "First quest", homePage: "main" }],
  })) });
  await expect(page.getByText("1 quests, 0 dependencies")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("desktop.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: testInfo.outputPath("narrow.png") });
  await expect(page.getByRole("button", { name: "Imported project" })).toHaveCount(0);
  await page.getByRole("button", { name: "Create project" }).click();
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(page.getByRole("button", { name: "Imported project" })).toBeVisible();
});
