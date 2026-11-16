import { test, expect } from "./fixtures";

test("offline review submits evidence and restores history on narrow screens", async ({
  page,
  request,
  ids,
}) => {
  const settings = await request.put("/api/v1/verification-settings", {
    data: { key: "test-only-key", model: "mock/reviewer", effort: "none" },
  });
  expect(settings.ok()).toBeTruthy();
  await page.goto("/");
  await page.locator(`[data-id="${ids.architecture}"] .quest-node`).click();
  await expect(
    page.getByText("The mock reviewer runs offline.", { exact: false }),
  ).toBeVisible();
  await page
    .getByLabel("Evidence message")
    .fill("The architecture is documented.");
  await page.getByLabel("Attachments").setInputFiles({
    name: "proof.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Evidence text"),
  });
  await page.getByRole("button", { name: "Request verification" }).click();
  await page.getByText("Review attempts").click();
  await expect(
    page
      .locator(".history article")
      .filter({ hasText: "Mock reviewer: no real evaluation was performed." })
      .first(),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "proof.txt" })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page.getByText("Review attempts").click();
  await expect(page.locator(".history article p").getByText("The architecture is documented.")).toBeVisible();
  await expect(page.getByRole("link", { name: "proof.txt" })).toBeVisible();
});
