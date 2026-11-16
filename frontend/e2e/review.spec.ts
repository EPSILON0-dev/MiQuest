import { test, expect } from "./fixtures";

test("verification becomes available only after a new quest is saved", async ({
  page,
}) => {
  const reviewRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/review-runs"))
      reviewRequests.push(request.url());
  });
  await page.goto("/");
  await page.getByRole("switch", { name: "Edit mode" }).click();
  await page.getByRole("button", { name: "Add quest", exact: true }).click();
  await page.getByLabel("Title", { exact: true }).fill("Draft review quest");
  await page.getByRole("button", { name: "Save quest" }).click();
  await page.getByRole("button", { name: "Fit View" }).click();
  await page.getByRole("button", { name: /Draft review quest/ }).click();
  await expect(
    page.getByRole("heading", { name: "OpenRouter verification" }),
  ).toHaveCount(0);
  expect(reviewRequests).toEqual([]);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("button", { name: "Save changes" })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: /Draft review quest/ }).click();
  await expect(
    page.getByRole("heading", { name: "OpenRouter verification" }),
  ).toBeVisible();
  await expect.poll(() => reviewRequests.length).toBeGreaterThan(0);
});

test("review accepts a message without attachments", async ({
  page,
  request,
  ids,
}) => {
  const submissions: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && request.url().includes("/review-runs"))
      submissions.push(request.url());
  });
  const settings = await request.put("/api/v1/verification-settings", {
    data: { key: "test-only-key", model: "mock/reviewer", effort: "none" },
  });
  expect(settings.ok()).toBeTruthy();
  await page.goto("/");
  await page.locator(`[data-id="${ids.architecture}"] .quest-node`).click();
  await page.getByLabel("Evidence message").fill("Message-only evidence.");
  await page.getByRole("button", { name: "Request verification" }).click();
  await expect.poll(() => submissions.length).toBe(1);
  await page.getByText("Review attempts").click();
  const run = page
    .locator(".journal-section .history article")
    .filter({ hasText: "Message-only evidence." });
  await expect(run).toHaveCount(1);
  await expect(run).toBeVisible();
  await expect(
    page
      .locator(".journal-section .history article")
      .filter({ hasText: "More evidence is needed." }),
  ).toBeVisible();
});

test("review submits evidence and restores history on narrow screens", async ({
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
    page.getByText("Submitting sends this quest's context", { exact: false }),
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
      .filter({ hasText: "More evidence is needed." })
      .first(),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "proof.txt" })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page.getByText("Review attempts").click();
  await expect(
    page
      .locator(".history article p")
      .getByText("The architecture is documented."),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "proof.txt" })).toBeVisible();
});
