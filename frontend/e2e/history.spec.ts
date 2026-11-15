import { test, expect } from "./fixtures";
import type { APIRequestContext, Page } from "@playwright/test";

async function atlasId(request: APIRequestContext): Promise<string> {
  const projects = (await (await request.get("/api/v1/projects")).json())
    .data as {
    id: string;
    name: string;
  }[];
  return projects.find((project) => project.name === "Atlas")!.id;
}

function treeUrl(project: string, tree: string): string {
  return `/#/projects/${project}/trees/${tree}`;
}

function questUrl(project: string, tree: string, quest: string): string {
  return `${treeUrl(project, tree)}/quests/${quest}`;
}

async function traverseWithConfirmation(
  page: Page,
  direction: "back" | "forward",
  accept: boolean,
) {
  const prompt = page.waitForEvent("dialog");
  const navigation = page.evaluate((move) => history[move](), direction);
  const dialog = await prompt;
  if (accept) await dialog.accept();
  else await dialog.dismiss();
  await navigation;
}

async function stageTitle(page: Page, quest: string, title: string) {
  await page.locator(`[data-id="${quest}"] .quest-node`).click();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await page.getByLabel("Title", { exact: true }).fill(title);
  await page.getByRole("button", { name: "Save quest" }).click();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Save changes" }),
  ).toBeVisible();
}

test("tree and quest navigation support browser back and forward", async ({
  page,
  request,
  ids,
}) => {
  const project = await atlasId(request);
  await page.goto("/");
  await expect(page.locator(".breadcrumbs")).toHaveCSS("user-select", "none");
  await expect(
    page.locator(`[data-id="${ids.vision}"] .quest-node`),
  ).toBeVisible();
  await expect(page).toHaveURL(
    new RegExp(`${treeUrl(project, ids.foundations)}$`),
  );
  await page.getByRole("button", { name: "Launch path", exact: true }).click();
  await expect(
    page.locator(`[data-id="${ids.story}"] .quest-node`),
  ).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`${treeUrl(project, ids.launch)}$`));
  await page.locator(`[data-id="${ids.story}"] .quest-node`).click();
  await expect(
    page.getByRole("dialog", { name: "Write the story" }),
  ).toBeVisible();
  await expect(page).toHaveURL(
    new RegExp(`${questUrl(project, ids.launch, ids.story)}$`),
  );
  await page.evaluate(() => history.back());
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`${treeUrl(project, ids.launch)}$`));
  await page.evaluate(() => history.back());
  await expect(page.locator(".breadcrumbs strong")).toHaveText("Foundations");
  await page.evaluate(() => history.forward());
  await expect(page.locator(".breadcrumbs strong")).toHaveText("Launch path");
  await page.evaluate(() => history.forward());
  await expect(
    page.getByRole("dialog", { name: "Write the story" }),
  ).toBeVisible();
  await expect(page).toHaveURL(
    new RegExp(`${questUrl(project, ids.launch, ids.story)}$`),
  );
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`${treeUrl(project, ids.launch)}$`));
});

test("direct quest links survive reload and close to the requested tree", async ({
  page,
  request,
  ids,
}) => {
  const project = await atlasId(request);
  await page.goto(questUrl(project, ids.launch, ids.story));
  await expect(page.locator(".breadcrumbs strong")).toHaveText("Launch path");
  await expect(
    page.getByRole("dialog", { name: "Write the story" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("dialog", { name: "Write the story" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`${treeUrl(project, ids.launch)}$`));
});

test("invalid targets fall back to an available tree or the requested tree", async ({
  page,
  request,
  ids,
}) => {
  const project = await atlasId(request);
  const missing = "00000000-0000-0000-0000-000000000000";
  await page.goto(questUrl(project, ids.launch, missing));
  await expect(page.locator(".breadcrumbs strong")).toHaveText("Launch path");
  await expect(
    page.locator(`[data-id="${ids.story}"] .quest-node`),
  ).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`${treeUrl(project, ids.launch)}$`));
  // A quest from the same project is invalid on a tree where it has no appearance.
  await page.goto(questUrl(project, ids.foundations, ids.story));
  await expect(page.locator(".breadcrumbs strong")).toHaveText("Foundations");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page).toHaveURL(
    new RegExp(`${treeUrl(project, ids.foundations)}$`),
  );
  await page.goto(treeUrl(project, missing));
  await expect(page.locator(".breadcrumbs strong")).not.toBeEmpty();
  await expect(page.locator(".quest-node").first()).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page).not.toHaveURL(new RegExp(missing));
});

test("browser back preserves a dirty draft when cancelled and discards on leave", async ({
  page,
  request,
  ids,
}) => {
  const project = await atlasId(request);
  await page.goto(treeUrl(project, ids.foundations));
  await page.getByRole("button", { name: "Launch path", exact: true }).click();
  await page.getByRole("switch", { name: "Edit mode" }).click();
  await stageTitle(page, ids.story, "Draft kept until leave");
  // Quest transitions on the same tree do not discard its draft.
  await page.locator(`[data-id="${ids.review}"] .quest-node`).click();
  await page.evaluate(() => history.back());
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Save changes" }),
  ).toBeVisible();
  await traverseWithConfirmation(page, "back", false);
  await expect(page.locator(".breadcrumbs strong")).toHaveText("Launch path");
  await expect(
    page.getByRole("button", { name: "Save changes" }),
  ).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`${treeUrl(project, ids.launch)}$`));
  await traverseWithConfirmation(page, "back", true);
  await expect(page.locator(".breadcrumbs strong")).toHaveText("Foundations");
  await expect(page.getByRole("button", { name: "Save changes" })).toHaveCount(
    0,
  );
  const quest = (
    await (await request.get(`/api/v1/quests/${ids.story}`)).json()
  ).data.quest;
  expect(quest.title).toBe("Write the story");
});

test("turning edit mode off offers stay or discard", async ({
  page,
  request,
  ids,
}) => {
  const project = await atlasId(request);
  await page.goto(treeUrl(project, ids.foundations));
  const edit = page.getByRole("switch", { name: "Edit mode" });
  await edit.click();
  await stageTitle(page, ids.architecture, "Draft before exit");
  page.once("dialog", (dialog) => dialog.dismiss());
  await edit.click();
  await expect(edit).toHaveAttribute("aria-checked", "true");
  await expect(
    page.getByRole("button", { name: "Save changes" }),
  ).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await edit.click();
  await expect(edit).toHaveAttribute("aria-checked", "false");
  await expect(page.getByRole("button", { name: "Save changes" })).toHaveCount(
    0,
  );
  expect(
    (await (await request.get(`/api/v1/quests/${ids.architecture}`)).json())
      .data.quest.title,
  ).toBe("Shape the architecture");
});

test("cross-tree quest links navigate to the home tree and highlight the quest", async ({
  page,
  request,
  ids,
}) => {
  const project = await atlasId(request);
  await page.goto(questUrl(project, ids.launch, ids.story));
  const dialog = page.getByRole("dialog", { name: "Write the story" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: /Set design principles/ }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".breadcrumbs strong")).toHaveText("Foundations");
  await expect(page.locator(".quest-node.ping")).toBeVisible();
  await expect(page).toHaveURL(
    new RegExp(`${treeUrl(project, ids.foundations)}$`),
  );
  await page.evaluate(() => history.back());
  await expect(
    page.getByRole("dialog", { name: "Write the story" }),
  ).toBeVisible();
});

test("same-tree related quests and modal Close follow quest history", async ({
  page,
  request,
  ids,
}) => {
  const project = await atlasId(request);
  await page.goto(treeUrl(project, ids.launch));
  await page.locator(`[data-id="${ids.story}"] .quest-node`).click();
  const story = page.getByRole("dialog", { name: "Write the story" });
  await story.getByRole("button", { name: /Create the identity/ }).click();
  const identity = page.getByRole("dialog", { name: "Create the identity" });
  await expect(identity).toBeVisible();
  await expect(page).toHaveURL(/\/quests\/[^/]+$/);
  await identity.getByRole("button", { name: "Close", exact: true }).click();
  await expect(story).toBeVisible();
  await expect(page).toHaveURL(
    new RegExp(`${questUrl(project, ids.launch, ids.story)}$`),
  );
});

test("browser forward preserves a dirty draft when cancelled and discards it on retry", async ({
  page,
  request,
  ids,
}) => {
  const project = await atlasId(request);
  await page.goto(treeUrl(project, ids.foundations));
  await page.getByRole("button", { name: "Launch path", exact: true }).click();
  await expect(page.locator(".breadcrumbs strong")).toHaveText("Launch path");
  await page.evaluate(() => history.back());
  await expect(page.locator(".breadcrumbs strong")).toHaveText("Foundations");
  await page.getByRole("switch", { name: "Edit mode" }).click();
  await page.getByRole("button", { name: "Auto layout" }).click();
  await expect(
    page.getByRole("button", { name: "Save changes" }),
  ).toBeVisible();
  await traverseWithConfirmation(page, "forward", false);
  await expect(page.locator(".breadcrumbs strong")).toHaveText("Foundations");
  await expect(
    page.getByRole("button", { name: "Save changes" }),
  ).toBeVisible();
  await expect(page).toHaveURL(
    new RegExp(`${treeUrl(project, ids.foundations)}$`),
  );
  await traverseWithConfirmation(page, "forward", true);
  await expect(page.locator(".breadcrumbs strong")).toHaveText("Launch path");
  await expect(page.getByRole("button", { name: "Save changes" })).toHaveCount(
    0,
  );
});

test("browser back restores the previous tree across reload", async ({
  page,
  request,
  ids,
}) => {
  const project = await atlasId(request);
  await page.goto(treeUrl(project, ids.foundations));
  await page.getByRole("button", { name: "Launch path", exact: true }).click();
  await expect(page.locator(".breadcrumbs strong")).toHaveText("Launch path");
  await page.reload();
  await expect(page.locator(".breadcrumbs strong")).toHaveText("Launch path");
  await page.evaluate(() => history.back());
  await expect(page.locator(".breadcrumbs strong")).toHaveText("Foundations");
  await expect(page).toHaveURL(
    new RegExp(`${treeUrl(project, ids.foundations)}$`),
  );
});

test("back during an in-flight draft save stays on the tree and completes the save", async ({
  page,
  request,
  ids,
}) => {
  const project = await atlasId(request);
  await page.goto(treeUrl(project, ids.foundations));
  await page.getByRole("button", { name: "Launch path", exact: true }).click();
  await page.getByRole("switch", { name: "Edit mode" }).click();
  await stageTitle(page, ids.story, "Saved despite back");

  let release!: () => void;
  let markRequested!: () => void;
  const requested = new Promise<void>((resolve) => {
    markRequested = resolve;
  });
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/tree-draft", async (route) => {
    markRequested();
    await hold;
    await route.continue();
  });
  const dialogs: string[] = [];
  page.on("dialog", async (dialog) => {
    dialogs.push(dialog.message());
    await dialog.dismiss();
  });
  await page.getByRole("button", { name: "Save changes" }).click();
  await requested;
  const traversed = page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        window.addEventListener("popstate", () => resolve(), { once: true });
      }),
  );
  await page.evaluate(() => history.back());
  await traversed;
  await expect(page).toHaveURL(new RegExp(`${treeUrl(project, ids.launch)}$`));
  await expect(page.locator(".breadcrumbs strong")).toHaveText("Launch path");
  expect(dialogs).toEqual([]);
  const response = page.waitForResponse(
    (item) =>
      item.url().endsWith("/tree-draft") && item.request().method() === "POST",
  );
  release();
  expect((await response).ok()).toBeTruthy();
  await expect(page.getByText("Saving…")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Save changes" })).toHaveCount(
    0,
  );
  await expect(page.locator(".breadcrumbs strong")).toHaveText("Launch path");
  await expect(page).toHaveURL(new RegExp(`${treeUrl(project, ids.launch)}$`));
  const quest = (
    await (await request.get(`/api/v1/quests/${ids.story}`)).json()
  ).data.quest;
  expect(quest.title).toBe("Saved despite back");
});

test("forward history reopens a newly saved quest with its persisted ID", async ({
  page,
  request,
  ids,
}) => {
  const project = await atlasId(request);
  await page.goto(treeUrl(project, ids.foundations));
  await page.getByRole("switch", { name: "Edit mode" }).click();
  await page.getByRole("button", { name: "Add quest", exact: true }).click();
  await page.getByLabel("Title", { exact: true }).fill("New history quest");
  await page.getByRole("button", { name: "Save quest" }).click();
  await page.getByRole("button", { name: "Fit View" }).click();
  await page.getByRole("button", { name: /New history quest/ }).click();
  await expect(
    page.getByRole("dialog", { name: "New history quest" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const response = page.waitForResponse(
    (item) =>
      item.url().endsWith("/tree-draft") && item.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Save changes" }).click();
  expect((await response).ok()).toBeTruthy();
  await expect(page.getByText("Saving…")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Save changes" })).toHaveCount(
    0,
  );
  const quests = (
    await (await request.get(`/api/v1/projects/${project}/quests`)).json()
  ).data as { id: string; title: string }[];
  const saved = quests.find((quest) => quest.title === "New history quest");
  expect(saved).toBeDefined();
  await page.evaluate(() => history.forward());
  await expect(
    page.getByRole("dialog", { name: "New history quest" }),
  ).toBeVisible();
  await expect(page).toHaveURL(
    new RegExp(`${questUrl(project, ids.foundations, saved!.id)}$`),
  );
});

test("empty project URLs restore through history and protect a dirty tree", async ({
  page,
  request,
  ids,
}) => {
  const project = await atlasId(request);
  const created = await request.post("/api/v1/projects", {
    data: { name: "Empty project", description: "No trees yet" },
  });
  expect(created.status()).toBe(201);
  const emptyProject = (await created.json()).data.id as string;
  const emptyHash = `/#/projects/${emptyProject}`;
  await page.goto(treeUrl(project, ids.foundations));
  await page
    .getByRole("button", { name: "Empty project", exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`${emptyHash}$`));
  await expect(page.locator(".breadcrumbs")).toContainText("Empty project");
  await expect(page.locator(".breadcrumbs strong")).toHaveText("No tree yet");
  await page.evaluate(() => history.back());
  await expect(page).toHaveURL(
    new RegExp(`${treeUrl(project, ids.foundations)}$`),
  );
  await expect(page.locator(".breadcrumbs strong")).toHaveText("Foundations");
  await page.evaluate(() => history.forward());
  await expect(page).toHaveURL(new RegExp(`${emptyHash}$`));
  await expect(page.locator(".breadcrumbs")).toContainText("Empty project");
  await page.evaluate(() => history.back());
  await expect(page.locator(".breadcrumbs strong")).toHaveText("Foundations");
  await page.getByRole("switch", { name: "Edit mode" }).click();
  await page.getByRole("button", { name: "Auto layout" }).click();
  await expect(
    page.getByRole("button", { name: "Save changes" }),
  ).toBeVisible();
  page.once("dialog", (dialog) => dialog.dismiss());
  await page
    .getByRole("button", { name: "Empty project", exact: true })
    .click();
  await expect(page).toHaveURL(
    new RegExp(`${treeUrl(project, ids.foundations)}$`),
  );
  await expect(page.locator(".breadcrumbs strong")).toHaveText("Foundations");
  await expect(
    page.getByRole("button", { name: "Save changes" }),
  ).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Empty project", exact: true })
    .click();
  await expect(page).toHaveURL(new RegExp(`${emptyHash}$`));
  await expect(page.locator(".breadcrumbs")).toContainText("Empty project");
  await expect(page.getByRole("button", { name: "Save changes" })).toHaveCount(
    0,
  );
});

test("cancelling navigation from a direct quest keeps its modal back inside the app", async ({
  page,
  request,
  ids,
}) => {
  const project = await atlasId(request);
  await page.goto(treeUrl(project, ids.foundations));
  await page.getByRole("switch", { name: "Edit mode" }).click();
  await stageTitle(page, ids.architecture, "Direct link draft");
  await page.evaluate(
    (hash) => {
      location.hash = hash;
    },
    questUrl(project, ids.foundations, ids.architecture).slice(1),
  );
  await expect(
    page.getByRole("dialog", { name: "Direct link draft" }),
  ).toBeVisible();
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.evaluate((hash) => {
    location.hash = hash;
  }, treeUrl(project, ids.launch).slice(1));
  await expect(page).toHaveURL(
    new RegExp(`${questUrl(project, ids.foundations, ids.architecture)}$`),
  );
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page).toHaveURL(
    new RegExp(`${treeUrl(project, ids.foundations)}$`),
  );
  await expect(
    page.getByRole("button", { name: "Save changes" }),
  ).toBeVisible();
});

test("works when randomUUID is unavailable", async ({ page, request, ids }) => {
  const project = await atlasId(request);
  await page.addInitScript(() => {
    Object.defineProperty(crypto, "randomUUID", { value: undefined });
  });
  await page.goto(treeUrl(project, ids.foundations));
  await expect(
    page.locator(`[data-id="${ids.architecture}"] .quest-node`),
  ).toBeVisible();
  await page.getByRole("switch", { name: "Edit mode" }).click();
  await page.getByRole("button", { name: "Add quest", exact: true }).click();
  await page
    .getByLabel("Title", { exact: true })
    .fill("Works without randomUUID");
  await page.getByRole("button", { name: "Save quest" }).click();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("button", { name: "Save changes" })).toHaveCount(
    0,
  );
  const quests = (
    await (await request.get(`/api/v1/projects/${project}/quests`)).json()
  ).data as { title: string }[];
  expect(
    quests.some((quest) => quest.title === "Works without randomUUID"),
  ).toBe(true);
});
