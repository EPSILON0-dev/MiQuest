import { test, expect } from "@playwright/test";

test("journal, focus, shared content, pins and viewport restoration", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.locator(".quest-card")).toHaveCount(8);
  const quest = page
    .locator(".quest-card")
    .filter({ hasText: "Shape the architecture" });
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
  await page
    .locator(".quest-card")
    .filter({ hasText: "A useful first version" })
    .click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page
    .getByLabel("Title", { exact: true })
    .fill("Shared milestone edited");
  await page.getByRole("button", { name: "Save quest" }).click();
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Foundations", exact: true }).click();
  await expect(
    page.locator(".quest-card").filter({ hasText: "Shared milestone edited" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /Write the story/ })
    .first()
    .click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Launch path",
  );
  await expect(page.locator(".quest-card.ping")).toContainText(
    "Write the story",
  );
  await page
    .locator(".quest-card")
    .filter({ hasText: "Write the story" })
    .click();
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Launch path",
  );
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
  await page.getByRole("button", { name: "Add quest", exact: true }).click();
  await page.getByLabel("Title", { exact: true }).fill("A small next step");
  await page
    .getByLabel("Description", { exact: true })
    .fill("A local prototype quest.");
  await page.getByRole("button", { name: "Save quest" }).click();
  await expect(page.locator(".quest-card")).toHaveCount(9);
  await page.getByRole("button", { name: "Fit tree to view" }).click();
  await page
    .locator(".quest-card")
    .filter({ hasText: "A small next step" })
    .click();
  await page.getByRole("button", { name: "Remove from this tree" }).click();
  await expect(page.getByRole("alert")).toContainText("at least one tree");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Delete quest everywhere" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete quest everywhere" }).click();
  await expect(page.locator(".quest-card")).toHaveCount(8);
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
  await expect(page.locator(".quest-card")).toHaveCount(8);
  await expect(page.locator(".react-flow__controls")).toHaveCSS(
    "bottom",
    "55px",
  );
  await page.screenshot({ path: "../docs/screenshots/desktop.png" });
  await page
    .locator(".quest-card")
    .filter({ hasText: "Shape the architecture" })
    .click();
  await page.screenshot({ path: "../docs/screenshots/desktop-journal.png" });
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(page.locator(".quest-card")).toHaveCount(8);
  await page.screenshot({ path: "../docs/screenshots/narrow.png" });
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("button", { name: "Launch path", exact: true }).click();
  await expect(page.locator(".sidebar")).not.toHaveClass(/is-open/);
  await page.getByRole("button", { name: /PINNED QUESTS/ }).click();
  await page
    .getByRole("button", { name: /Write the story/ })
    .first()
    .click();
  await page
    .locator(".quest-card")
    .filter({ hasText: "Write the story" })
    .click();
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
  const after = await card.evaluate(
    (el) => (el as HTMLElement).style.transform,
  );
  expect(after).not.toBe(before);
  await page.getByRole("button", { name: "Launch path", exact: true }).click();
  await page.getByRole("button", { name: "Foundations", exact: true }).click();
  expect(await card.evaluate((el) => (el as HTMLElement).style.transform)).toBe(
    after,
  );
  await page
    .getByRole("button", { name: "Move Write the story up", exact: true })
    .click();
  await expect(page.locator(".pin-row").nth(1)).toContainText(
    "Write the story",
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
    .toBeGreaterThan(0.9);
  const viewport = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("miquest-view")!).viewports.foundations,
  );
  await page.reload();
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
  await expect(page.locator(".quest-card")).toHaveCount(7);
  await page
    .locator(".quest-card")
    .filter({ hasText: "Define the north star" })
    .click();
  await expect(page.getByRole("dialog")).toContainText("Launch path");
});

test("narrow navigation and journal keep keyboard focus inside", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
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
  await page.getByRole("button", { name: "Add quest", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Back", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(
    page.getByRole("button", { name: "Cancel", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Add quest", exact: true }),
  ).toBeFocused();
});
