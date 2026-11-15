import { test, expect } from "./fixtures";

test("manages trees inside expandable projects", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByRole("switch", { name: "Edit mode" }).click();
  await page.getByRole("button", { name: "Workspace settings" }).click();
  const dialog = page.getByRole("dialog", { name: "Workspace settings" });
  const atlas = dialog
    .locator(".manage-project")
    .filter({
      has: page.getByRole("button", { name: "Atlas", exact: true }),
    });
  const studio = dialog
    .locator(".manage-project")
    .filter({
      has: page.getByRole("button", { name: "Studio", exact: true }),
    });
  await expect(
    atlas.getByRole("button", { name: "Atlas", exact: true }),
  ).toHaveAttribute("aria-expanded", "true");
  await expect(atlas).toContainText("Foundations");
  await expect(
    studio.getByRole("button", { name: "Studio", exact: true }),
  ).toHaveAttribute("aria-expanded", "false");
  await studio.getByRole("button", { name: "Studio", exact: true }).click();
  await studio.getByLabel("New tree name").fill("Studio ideas");
  await studio.getByRole("button", { name: "Create", exact: true }).click();
  await expect(studio).toContainText("Studio ideas");
  await expect(atlas).not.toContainText("Studio ideas");
  await page.screenshot({ path: testInfo.outputPath("settings-desktop.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: testInfo.outputPath("settings-narrow.png") });
  await studio.getByRole("button", { name: "Studio", exact: true }).click();
  await expect(studio.getByText("Studio ideas")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(dialog).toHaveCount(0);
});

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
  await expect(
    treeForm.locator("xpath=ancestor::div[contains(@class, 'manage-project')]"),
  ).toContainText("Expedition");
  await treeForm.getByLabel("New tree name").fill("First steps");
  await treeForm.getByRole("button", { name: "Create" }).click();
  await expect(
    page.locator(".manage-project").filter({ hasText: "Expedition" }),
  ).toContainText("First steps");
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
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("button", { name: "Save changes" })).toHaveCount(
    0,
  );
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

test("preserves the draft after a concurrent edit conflicts", async ({
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
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Your draft is preserved",
  );
  await expect(
    page.getByRole("button", { name: "Save changes" }),
  ).toBeDisabled();
  await expect(page.getByRole("button", { name: /Stale edit/ })).toBeVisible();
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
    page.locator(".manage-project").filter({ hasText: "Fresh start" }),
  ).toContainText("First tree");
  await expect(page.getByText("Saving…")).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "First tree", exact: true }),
  ).toBeVisible();
});

test("loads and caches opened tree graphs and clicked quest histories", async ({
  page,
  ids,
}) => {
  const requests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/v1/"))
      requests.push(new URL(request.url()).pathname);
  });
  await page.goto("/");
  await expect(
    page.locator(`[data-id="${ids.vision}"] .quest-node`),
  ).toBeVisible();
  expect(requests.filter((url) => url.endsWith("/graph"))).toEqual([
    `/api/v1/pages/${ids.foundations}/graph`,
  ]);
  expect(requests.filter((url) => url.endsWith("/verifications"))).toEqual([]);
  await page.locator(`[data-id="${ids.vision}"] .quest-node`).click();
  await expect
    .poll(() => requests.filter((url) => url.endsWith("/verifications")).length)
    .toBe(1);
  await page.keyboard.press("Escape");
  await page.locator(`[data-id="${ids.vision}"] .quest-node`).click();
  await page.keyboard.press("Escape");
  expect(requests.filter((url) => url.endsWith("/verifications"))).toEqual([
    `/api/v1/quests/${ids.vision}/verifications`,
  ]);
  await page.getByRole("button", { name: "Launch path", exact: true }).click();
  await expect(
    page.locator(`[data-id="${ids.story}"] .quest-node`),
  ).toBeVisible();
  await page.getByRole("button", { name: "Foundations", exact: true }).click();
  await expect(
    page.locator(`[data-id="${ids.vision}"] .quest-node`),
  ).toBeVisible();
  expect(requests.filter((url) => url.endsWith("/graph"))).toEqual([
    `/api/v1/pages/${ids.foundations}/graph`,
    `/api/v1/pages/${ids.launch}/graph`,
  ]);
});

test("keeps edits local until save and preserves a draft after a failed save", async ({
  page,
  request,
  ids,
}) => {
  await page.goto("/");
  await page.getByRole("switch", { name: "Edit mode" }).click();
  await page.locator(`[data-id="${ids.architecture}"] .quest-node`).click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Title", { exact: true }).fill("Draft title");
  await page.getByRole("button", { name: "Save quest" }).click();
  await page.keyboard.press("Escape");
  const readTitle = async () =>
    (await (await request.get(`/api/v1/quests/${ids.architecture}`)).json())
      .data.quest.title as string;
  expect(await readTitle()).toBe("Shape the architecture");
  await page.route("**/tree-draft", (route) =>
    route.fulfill({
      status: 500,
      json: { error: { code: "failed", message: "Save failed" } },
    }),
  );
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("alert")).toContainText("Save failed");
  expect(await readTitle()).toBe("Shape the architecture");
  await expect(page.getByRole("button", { name: /Draft title/ })).toBeVisible();
  await page.unroute("**/tree-draft");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect.poll(readTitle).toBe("Draft title");
  await expect(page.getByRole("button", { name: "Save changes" })).toHaveCount(
    0,
  );
});

test("asks before discarding a draft when leaving a tree", async ({
  page,
  request,
  ids,
}) => {
  await page.goto("/");
  await page.getByRole("switch", { name: "Edit mode" }).click();
  await page.locator(`[data-id="${ids.architecture}"] .quest-node`).click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Title", { exact: true }).fill("Discard this");
  await page.getByRole("button", { name: "Save quest" }).click();
  await page.keyboard.press("Escape");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Launch path", exact: true }).click();
  await expect(
    page.locator(`[data-id="${ids.story}"] .quest-node`),
  ).toBeVisible();
  const quest = (
    await (await request.get(`/api/v1/quests/${ids.architecture}`)).json()
  ).data.quest;
  expect(quest.title).toBe("Shape the architecture");
});

test("draft controls fit on a narrow screen", async ({ page, ids }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("switch", { name: "Edit mode" }).click();
  await page.locator(`[data-id="${ids.architecture}"] .quest-node`).click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Title", { exact: true }).fill("A revised quest");
  await page.getByRole("button", { name: "Save quest" }).click();
  await page.keyboard.press("Escape");
  for (const name of ["Save changes", "Discard changes"]) {
    const button = page.getByRole("button", { name });
    await expect(button).toBeInViewport();
  }
  await page.screenshot({ path: "/tmp/miquest-draft-narrow.png" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: "/tmp/miquest-draft-desktop.png" });
});

test("refreshes memberships for quests on a newly opened tree", async ({
  page,
  request,
  ids,
}) => {
  await page.goto("/");
  await expect(
    page.locator(`[data-id="${ids.milestone}"] .quest-node`),
  ).toBeVisible();
  const graph = await (
    await request.get(`/api/v1/pages/${ids.foundations}/graph`)
  ).json();
  const update = await request.patch(`/api/v1/quests/${ids.milestone}`, {
    data: { homePageId: ids.launch, expectedRevision: graph.projectRevision },
  });
  expect(update.ok()).toBeTruthy();
  const revision = (await update.json()).projectRevision;
  const remove = await request.delete(
    `/api/v1/pages/${ids.foundations}/quests/${ids.milestone}`,
    {
      data: { expectedRevision: revision },
    },
  );
  expect(remove.ok()).toBeTruthy();
  await page.getByRole("button", { name: "Launch path", exact: true }).click();
  await page.getByRole("switch", { name: "Edit mode" }).click();
  await page.locator(`[data-id="${ids.milestone}"] .quest-node`).click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(
    page.getByRole("checkbox", { name: "Foundations" }),
  ).not.toBeChecked();
});

test("keeps the draft after a failed save before navigating", async ({
  page,
  request,
  ids,
}) => {
  await page.goto("/");
  await page.getByRole("switch", { name: "Edit mode" }).click();
  await page.locator(`[data-id="${ids.architecture}"] .quest-node`).click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Title", { exact: true }).fill("Saved on navigation");
  await page.getByRole("button", { name: "Save quest" }).click();
  await page.keyboard.press("Escape");
  await page.route("**/tree-draft", (route) =>
    route.fulfill({
      status: 500,
      json: { error: { code: "failed", message: "Save failed" } },
    }),
  );
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("alert")).toContainText("Save failed");
  await expect(
    page.locator(`[data-id="${ids.architecture}"] .quest-node`),
  ).toHaveCount(1);
  const readTitle = async () =>
    (await (await request.get(`/api/v1/quests/${ids.architecture}`)).json())
      .data.quest.title as string;
  expect(await readTitle()).toBe("Shape the architecture");
  await page.unroute("**/tree-draft");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect.poll(readTitle).toBe("Saved on navigation");
  await page.getByRole("button", { name: "Launch path", exact: true }).click();
  await expect(
    page.locator(`[data-id="${ids.story}"] .quest-node`),
  ).toBeVisible();
  await expect.poll(readTitle).toBe("Saved on navigation");
});
