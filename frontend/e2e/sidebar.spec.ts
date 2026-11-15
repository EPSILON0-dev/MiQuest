import { test, expect } from "./fixtures";

test("keeps language and workspace controls together at the bottom", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await page.getByRole("switch", { name: "Edit mode" }).click();

  async function checkControls() {
    const sidebar = page.locator(".sidebar");
    const language = await sidebar.getByLabel("Language").boundingBox();
    const importer = await sidebar
      .getByRole("button", { name: "Import project" })
      .boundingBox();
    const settings = await sidebar
      .getByRole("button", { name: "Workspace settings" })
      .boundingBox();
    const bounds = await sidebar.boundingBox();
    expect(language && importer && settings && bounds).toBeTruthy();
    expect(importer!.y - (language!.y + language!.height)).toBeLessThan(20);
    expect(settings!.y - (importer!.y + importer!.height)).toBeLessThan(20);
    expect(
      bounds!.y + bounds!.height - (settings!.y + settings!.height),
    ).toBeLessThan(20);
  }

  await checkControls();
  await page.screenshot({ path: testInfo.outputPath("sidebar-desktop.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Open navigation" }).click();
  await checkControls();
  await page.screenshot({ path: testInfo.outputPath("sidebar-narrow.png") });
});
