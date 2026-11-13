import { test, expect } from "@playwright/test";

test("creates a progression and its first tree", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("switch", { name: "Edit mode" }).click();
  await page.getByRole("button", { name: "Manage progressions" }).click();
  const progressionForm = page
    .locator("form")
    .filter({ has: page.getByLabel("New progression name") });
  await progressionForm.getByLabel("New progression name").fill("Expedition");
  await progressionForm.getByRole("button", { name: "Create" }).click();
  const treeForm = page
    .locator("form")
    .filter({ has: page.getByLabel("New tree name") });
  await expect(treeForm.getByLabel("Tree progression")).toHaveValue(
    (await treeForm
      .getByRole("option", { name: "Expedition" })
      .getAttribute("value")) as string,
  );
  await treeForm.getByLabel("New tree name").fill("First steps");
  await treeForm.getByRole("button", { name: "Create" }).click();
  await expect(
    page.locator(".manage-row").filter({ hasText: "First steps" }),
  ).toContainText("Expedition");
});

test("edits membership, home tree, and position of a shared quest", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("switch", { name: "Edit mode" }).click();
  await page.locator('[data-id="milestone"] .quest-node').click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Home tree").selectOption("launch");
  const position = page.getByRole("group", { name: "Launch path position" });
  await position.getByLabel("X", { exact: true }).fill("123");
  await position.getByLabel("Y", { exact: true }).fill("234");
  await page.getByRole("checkbox", { name: "Foundations" }).uncheck();
  await page.getByRole("button", { name: "Save quest" }).click();
  await page.keyboard.press("Escape");
  await expect(page.locator('[data-id="milestone"] .quest-node')).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "Launch path", exact: true }).click();
  const node = page.locator('[data-id="milestone"]');
  await expect(node).toHaveCSS("transform", "matrix(1, 0, 0, 1, 123, 234)");
  await node.locator(".quest-node").click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.getByLabel("Home tree")).toHaveValue("launch");
  await expect(
    page.getByRole("checkbox", { name: "Foundations" }),
  ).not.toBeChecked();
});

test("records a human override and reopen with reasons and retained history", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("switch", { name: "Edit mode" }).click();
  await page.locator('[data-id="vision"] .quest-node').click();
  await page.getByRole("button", { name: "Human override / reopen" }).click();
  await expect(
    page.getByRole("button", { name: "Reopen quest" }),
  ).toBeDisabled();
  await page.getByLabel("Reason").fill("Accepted by owner");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Confirm human override" }).click();
  await page
    .locator("summary")
    .filter({ hasText: "Evidence & history" })
    .click();
  await expect(page.getByText("Accepted by owner")).toBeVisible();
  await expect(page.getByText("Agent verification")).toBeVisible();
  await page.getByRole("button", { name: "Human override / reopen" }).click();
  await page.getByLabel("Reason").fill("Needs another look");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Reopen quest" }).click();
  await expect(page.getByText("Needs another look")).toBeVisible();
  await expect(page.getByText("Accepted by owner")).toBeVisible();
  await expect(page.getByText("Agent verification")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator('[data-id="vision"] .quest-node')).toHaveAttribute(
    "aria-label",
    /Ready to begin/,
  );
});

test("shows historical verification while a prerequisite is unsatisfied", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("switch", { name: "Edit mode" }).click();
  await page.getByRole("button", { name: "Launch path", exact: true }).click();
  const review = page.locator('[data-id="review"] .quest-node');
  await expect(review).toHaveClass(/locked/);
  await expect(review).toHaveClass(/verified/);
  await expect(review.locator(".completion-mark")).toBeVisible();
  await expect(review.locator(".lock-mark")).toBeVisible();
  await review.click();
  await page
    .locator("summary")
    .filter({ hasText: "Evidence & history" })
    .click();
  await expect(page.getByText("Earlier walkthrough notes.")).toBeVisible();
});
