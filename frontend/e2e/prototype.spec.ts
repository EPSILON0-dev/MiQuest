import { test, expect } from "@playwright/test";

test("journal, focus, shared content, pins and viewport restoration", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.getByRole("switch", { name: "Edit mode" }).click();
  await expect(page.locator(".quest-node")).toHaveCount(8);
  const quest = page.locator('[data-id="architecture"] .quest-node');
  await quest.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.locator(".modal-overlay")).toHaveCSS(
    "backdrop-filter",
    "blur(6px)",
  );
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(quest).toBeFocused();
  await page.getByRole("button", { name: "Launch path", exact: true }).click();
  await page.locator('[data-id="milestone"] .quest-node').click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page
    .getByLabel("Title", { exact: true })
    .fill("Shared milestone edited");
  await page.getByRole("button", { name: "Save quest" }).click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Foundations", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /Shared milestone edited/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Pinned quests" }).click();
  await page
    .getByRole("button", { name: /Write the story/ })
    .first()
    .click();
  await expect(page.locator(".breadcrumbs strong")).toHaveText("Launch path");
  await expect(
    page.locator('[data-id="story"] .quest-node.ping'),
  ).toBeVisible();
  await page.locator('[data-id="story"] .quest-node').click();
  await page.reload();
  await expect(page.locator(".breadcrumbs strong")).toHaveText("Launch path");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("miquest-view")!),
  );
  expect(saved.pageId).toBe("launch");
  expect(errors).toEqual([]);
});

test("create, validate dependency, protect last appearance, and delete quest", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("switch", { name: "Edit mode" }).click();
  await page.getByRole("button", { name: "Add quest", exact: true }).click();
  await page.getByLabel("Title", { exact: true }).fill("A small next step");
  await page
    .getByLabel("Description", { exact: true })
    .fill("A local prototype quest.");
  await page.getByRole("button", { name: "Save quest" }).click();
  await expect(page.locator(".quest-node")).toHaveCount(9);
  await page.getByRole("button", { name: "Fit View" }).click();
  await page.getByRole("button", { name: /A small next step/ }).click();
  await page.getByRole("button", { name: "Remove from this tree" }).click();
  await expect(page.getByRole("alert")).toContainText("at least one tree");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Delete quest everywhere" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete quest everywhere" }).click();
  await expect(page.locator(".quest-node")).toHaveCount(8);
  await page.getByRole("button", { name: "Tree actions" }).click();
  await page
    .getByLabel("Prerequisite quest", { exact: true })
    .selectOption("research");
  await page
    .getByLabel("Dependent quest", { exact: true })
    .selectOption("vision");
  await page.getByRole("button", { name: "Connect", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("cycle");
});

test("desktop and narrow screenshots, drawer, full-screen journal", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".quest-node")).toHaveCount(8);
  const architecture = page.locator('[data-id="architecture"] .quest-node');
  await expect(architecture).toHaveAttribute(
    "aria-label",
    /Shape the architecture — /,
  );
  await expect(architecture).toHaveText("");
  await expect(architecture).toHaveCSS("width", "52px");
  await expect(page.locator('[data-id="milestone"] .quest-node')).toHaveClass(
    /milestone/,
  );
  await expect(page.locator('[data-id="milestone"] .quest-node')).toHaveCSS(
    "width",
    "72px",
  );
  await expect(
    page.getByRole("button", { name: "Add quest", exact: true }),
  ).toHaveCount(0);
  await page.screenshot({ path: "../docs/screenshots/desktop.png" });
  await page.locator('[data-id="architecture"] .quest-node').hover();
  await expect(page.getByRole("tooltip")).toContainText(
    "Shape the architecture",
  );
  await expect(page.getByRole("tooltip")).not.toContainText(
    "Acceptance criteria",
  );
  await page.screenshot({ path: "../docs/screenshots/tooltip.png" });
  await page.locator('[data-id="architecture"] .quest-node').click();
  await expect(page.locator(".relations-grid")).toContainText("Prerequisites");
  await expect(page.locator(".relations-grid")).toContainText("What's next");
  expect(
    await page
      .locator(".relations-grid")
      .evaluate((el) =>
        Boolean(
          el.compareDocumentPosition(
            document.querySelector(".quest-description")!,
          ) & Node.DOCUMENT_POSITION_FOLLOWING,
        ),
      ),
  ).toBe(true);
  await page.screenshot({ path: "../docs/screenshots/desktop-journal.png" });
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.locator(".quest-node")).toHaveCount(8);
  const phoneMilestone = await page
    .locator('[data-id="milestone"] .quest-node')
    .boundingBox();
  expect(phoneMilestone).not.toBeNull();
  expect(phoneMilestone!.x).toBeLessThan(390);
  expect(phoneMilestone!.x + phoneMilestone!.width).toBeGreaterThan(0);
  await page.screenshot({ path: "../docs/screenshots/narrow.png" });
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("button", { name: "Launch path", exact: true }).click();
  await expect(page.locator(".sidebar")).not.toHaveClass(/is-open/);
  await page.getByRole("button", { name: "Pinned quests" }).click();
  await page
    .getByRole("button", { name: /Write the story/ })
    .first()
    .click();
  await page.locator('[data-id="story"] .quest-node').click();
  await expect(page.getByRole("dialog")).toHaveCSS("height", "844px");
  await page.screenshot({ path: "../docs/screenshots/narrow-journal.png" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("dragging, pin order, and saved viewport", async ({ page }) => {
  await page.goto("/");
  const edit = page.getByRole("switch", { name: "Edit mode" });
  await expect(edit).toHaveAttribute("aria-checked", "false");
  const pins = page.getByRole("button", { name: "Pinned quests" });
  await expect(pins).toHaveAttribute("aria-expanded", "false");
  const card = page.locator('[data-id="architecture"]');
  const before = await card.evaluate(
    (el) => (el as HTMLElement).style.transform,
  );
  const bounds = await card.boundingBox();
  if (!bounds) throw new Error("Quest is missing");
  await page.mouse.move(bounds.x + 35, bounds.y + 30);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 75, bounds.y + 90, { steps: 10 });
  await page.mouse.up();
  expect(await card.evaluate((el) => (el as HTMLElement).style.transform)).toBe(
    before,
  );
  await edit.click();
  const editBounds = await card.boundingBox();
  if (!editBounds) throw new Error("Quest is missing in edit mode");
  await page.mouse.move(editBounds.x + 25, editBounds.y + 25);
  await page.mouse.down();
  await page.mouse.move(editBounds.x + 65, editBounds.y + 85, { steps: 10 });
  await page.mouse.up();
  const after = await card.evaluate(
    (el) => (el as HTMLElement).style.transform,
  );
  expect(after).not.toBe(before);
  await page.getByRole("button", { name: "Launch path", exact: true }).click();
  await page.getByRole("button", { name: "Foundations", exact: true }).click();
  expect(await card.evaluate((el) => (el as HTMLElement).style.transform)).toBe(
    after,
  );
  await edit.click();
  await pins.click();
  await page
    .getByRole("button", { name: "Move Write the story up", exact: true })
    .click();
  await expect(page.locator(".pin-row").nth(1)).toContainText(
    "Write the story",
  );
  await page
    .locator('[data-quest-id="story"]')
    .dragTo(page.locator(".pin-row").first());
  await expect(page.locator(".pin-row").first()).toHaveAttribute(
    "data-quest-id",
    "story",
  );
  const oldZoom = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("miquest-view")!).viewports.foundations
        .zoom,
  );
  await page.getByRole("button", { name: /^zoom in$/i }).click();
  await expect
    .poll(async () =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("miquest-view")!).viewports
            .foundations?.zoom,
      ),
    )
    .toBeGreaterThan(oldZoom);
  const viewport = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("miquest-view")!).viewports.foundations,
  );
  await page.reload();
  await expect(edit).toHaveAttribute("aria-checked", "false");
  await expect(pins).toHaveAttribute("aria-expanded", "false");
  await expect
    .poll(async () =>
      page
        .locator(".react-flow__viewport")
        .evaluate((el) => (el as HTMLElement).style.transform),
    )
    .toContain(`scale(${viewport.zoom})`);
});

test("tree deletion moves orphaned quests to the chosen tree even with duplicate names", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("switch", { name: "Edit mode" }).click();
  await page
    .getByRole("button", { name: "Workspace settings", exact: true })
    .click();
  const name = page.getByRole("textbox", { name: "New tree name" });
  await name.fill("Launch path");
  await page
    .locator("form")
    .filter({ has: name })
    .getByRole("button", { name: "Create", exact: true })
    .click();
  page.on("dialog", async (dialog) => {
    if (dialog.type() === "prompt") await dialog.accept("2");
    else await dialog.accept();
  });
  await page
    .getByRole("button", { name: "Delete Foundations", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Rename Foundations", exact: true }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Launch path", exact: true })
    .last()
    .click();
  await expect(page.locator(".quest-node")).toHaveCount(7);
  await page.locator('[data-id="vision"] .quest-node').click();
  await expect(page.getByRole("dialog")).toContainText("Launch path");
});

test("narrow navigation and journal keep keyboard focus inside", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("switch", { name: "Edit mode" }).click();
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(page.locator(".sidebar .brand")).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(
    page.getByRole("button", { name: "Workspace settings", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.locator(".sidebar .brand")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Open navigation" }),
  ).toBeFocused();
  const quest = page.locator('[data-id="architecture"] .quest-node');
  await quest.click();
  await expect(
    page.getByRole("button", { name: "Back", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(page.getByRole("dialog").locator(":focus")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(quest).toBeFocused();
});

test("long descriptions are truncated in the focus tooltip", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("switch", { name: "Edit mode" }).click();
  const quest = page.locator('[data-id="architecture"] .quest-node');
  await quest.click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const description = `${"Long description ".repeat(24)}ending`;
  await page
    .getByRole("textbox", { name: "Description", exact: true })
    .fill(description);
  await page.getByRole("button", { name: "Save quest" }).click();
  await page.keyboard.press("Escape");
  await page.getByRole("switch", { name: "Edit mode" }).click();
  await quest.focus();
  const tooltip = page.getByRole("tooltip");
  await expect(tooltip).toContainText("Click to read more");
  await expect(tooltip).not.toContainText("ending");
  await page.keyboard.press("Escape");
  await expect(tooltip).not.toBeVisible();
  await quest.click();
  await expect(page.locator(".quest-description")).toHaveText(description);
});

test("touch opens the journal directly", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ hasTouch: true, baseURL });
  const page = await context.newPage();
  await page.goto("/");
  await page.locator('[data-id="architecture"] .quest-node').tap();
  await expect(page.getByRole("dialog")).toBeVisible();
  await context.close();
});

test("Escape closes a journal even when a related quest tooltip is focused", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator('[data-id="architecture"] .quest-node').click();
  await page.locator(".relations-grid .quest-node").first().focus();
  await expect(page.getByRole("tooltip")).toContainText("Map the landscape");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.locator('[data-id="architecture"] .quest-node'),
  ).toBeFocused();
});
