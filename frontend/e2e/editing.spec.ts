import { test, expect } from "./fixtures";

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
  ids,
}) => {
  await page.goto("/");
  await page.getByRole("switch", { name: "Edit mode" }).click();
  await page.locator(`[data-id="${ids.milestone}"] .quest-node`).click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Home tree").selectOption(ids.launch);
  const position = page.getByRole("group", { name: "Launch path position" });
  await position.getByLabel("X", { exact: true }).fill("123");
  await position.getByLabel("Y", { exact: true }).fill("234");
  await page.getByRole("checkbox", { name: "Foundations" }).uncheck();
  await page.getByRole("button", { name: "Save quest" }).click();
  await page.keyboard.press("Escape");
  await expect(
    page.locator(`[data-id="${ids.milestone}"] .quest-node`),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Launch path", exact: true }).click();
  const node = page.locator(`[data-id="${ids.milestone}"]`);
  await expect(node).toHaveCSS("transform", "matrix(1, 0, 0, 1, 123, 234)");
  await node.locator(".quest-node").click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.getByLabel("Home tree")).toHaveValue(ids.launch);
  await expect(
    page.getByRole("checkbox", { name: "Foundations" }),
  ).not.toBeChecked();
});

test("records a human override and reopen with reasons and retained history", async ({
  page,
  ids,
}) => {
  await page.goto("/");
  await page.getByRole("switch", { name: "Edit mode" }).click();
  await page.locator(`[data-id="${ids.vision}"] .quest-node`).click();
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
  await expect(
    page.locator(`[data-id="${ids.vision}"] .quest-node`),
  ).toHaveAttribute("aria-label", /Ready to begin/);
});

test("shows historical verification while a prerequisite is unsatisfied", async ({
  page,
  ids,
}) => {
  await page.goto("/");
  await page.getByRole("switch", { name: "Edit mode" }).click();
  await page.getByRole("button", { name: "Launch path", exact: true }).click();
  const review = page.locator(`[data-id="${ids.review}"] .quest-node`);
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

test("reloads current data after a concurrent edit conflicts", async ({
  page,
  request,
  ids,
}) => {
  await page.goto("/");
  await page.getByRole("switch", { name: "Edit mode" }).click();
  await page.locator(`[data-id="${ids.architecture}"] .quest-node`).click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const projects = (await (await request.get("/api/v1/projects")).json())
    .data as { id: string; name: string }[];
  const atlas = projects.find((project) => project.name === "Atlas")!;
  const graph = await (
    await request.get(`/api/v1/projects/${atlas.id}/graph`)
  ).json();
  const response = await request.patch(`/api/v1/quests/${ids.architecture}`, {
    data: {
      title: "Changed elsewhere",
      expectedRevision: graph.projectRevision,
    },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  await page.getByLabel("Title", { exact: true }).fill("Stale edit");
  await page.getByRole("button", { name: "Save quest" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "latest data was reloaded",
  );
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: /Changed elsewhere/ }),
  ).toBeVisible();
});

test("retries loading after the backend is unavailable", async ({ page }) => {
  await page.route("**/api/v1/**", (route) => route.abort());
  await page.goto("/");
  await expect(page.getByRole("alert")).toContainText("backend is running");
  await page.unrouteAll();
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByRole("switch", { name: "Edit mode" })).toBeVisible();
});

test("creates a first progression and tree in an empty database", async ({
  page,
  request,
}) => {
  const projects = (await (await request.get("/api/v1/projects")).json())
    .data as { id: string; revision: number }[];
  for (const project of projects) {
    const response = await request.delete(`/api/v1/projects/${project.id}`, {
      data: { confirmDelete: true, expectedRevision: project.revision },
    });
    expect(response.ok(), await response.text()).toBeTruthy();
  }
  await page.goto("/");
  await expect(page.getByText("Your next chapter starts here")).toBeVisible();
  await page.getByRole("button", { name: "Enter edit mode" }).click();
  await page.getByRole("button", { name: "Open workspace settings" }).click();
  const progression = page
    .locator("form")
    .filter({ has: page.getByLabel("New progression name") });
  await progression.getByLabel("New progression name").fill("Fresh start");
  await progression.getByRole("button", { name: "Create" }).click();
  const tree = page
    .locator("form")
    .filter({ has: page.getByLabel("New tree name") });
  await tree.getByLabel("New tree name").fill("First tree");
  await tree.getByRole("button", { name: "Create" }).click();
  await expect(
    page.locator(".manage-row").filter({ hasText: "First tree" }),
  ).toContainText("Fresh start");
  await expect(page.getByText("Saving…")).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "First tree", exact: true }),
  ).toBeVisible();
});
