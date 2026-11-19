import { readFile } from "node:fs/promises";
import { test, expect } from "./fixtures";

test("exports and reimports the complete project graph", async ({ page, request }, testInfo) => {
  await page.goto("/");
  await page.getByRole("switch", { name: "Edit mode" }).click();
  await page.getByRole("button", { name: "Workspace", exact: true }).click();
  await expect(page.getByText(/text evidence.*attachment files are omitted/)).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("desktop.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: testInfo.outputPath("narrow.png") });
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export Atlas" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("Atlas.json");
  const document = JSON.parse(await readFile((await download.path())!, "utf8"));
  expect(document.bypassAutoLayout).toBe(true);
  expect(document.pages.length).toBe(2);
  expect(document.pages[0].quests.some((key: string) => document.pages[1].quests.includes(key))).toBe(true);
  const preview = await request.post("/api/v1/imports/preview", { data: document });
  expect(preview.ok()).toBe(true);
  const imported = await request.post("/api/v1/imports", { data: document });
  expect(imported.ok()).toBe(true);
  const projectId = (await imported.json()).data.id;
  const graph = (await (await request.get(`/api/v1/projects/${projectId}/graph`)).json()).data;
  expect(graph.pages).toHaveLength(document.pages.length);
  expect(graph.quests).toHaveLength(document.quests.length);
  expect(graph.dependencies).toHaveLength(document.dependencies.length);
  expect(graph.appearances).toHaveLength(document.pages.reduce((sum: number, tree: { positions: unknown[] }) => sum + tree.positions.length, 0));
  for (const quest of document.quests) {
    const importedQuest = graph.quests.find((item: { title: string }) => item.title === quest.title);
    expect(importedQuest.workState).toBe(quest.workState);
    expect(importedQuest.completionState).toBe(quest.completionState);
    const history = await request.get(`/api/v1/quests/${importedQuest.id}/verifications`);
    const records = (await history.json()).data.items;
    expect(records.map((item: { evidence: string; verdict: string; reasoning: string }) => ({ evidence: item.evidence, verdict: item.verdict, reasoning: item.reasoning }))).toEqual(
      quest.verifications.map((item: { evidence: string; verdict: string; reasoning: string }) => ({ evidence: item.evidence, verdict: item.verdict, reasoning: item.reasoning })),
    );
  }
  const importedQuests = new Map<string, string>(graph.quests.map((quest: { id: string; title: string }) => [quest.title, quest.id]));
  const importedPages = new Map<string, string>(graph.pages.map((tree: { id: string; name: string }) => [tree.name, tree.id]));
  for (const tree of document.pages) {
    for (const position of tree.positions) {
      const title = document.quests.find((quest: { key: string }) => quest.key === position.quest).title;
      expect(graph.appearances).toContainEqual(expect.objectContaining({ pageId: importedPages.get(tree.name), questId: importedQuests.get(title), x: position.x, y: position.y }));
    }
  }
});

test("reports export failures in Workspace", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("switch", { name: "Edit mode" }).click();
  await page.getByRole("button", { name: "Workspace", exact: true }).click();
  await page.route("**/api/v1/projects/*/graph", (route) => route.abort());
  await page.getByRole("button", { name: "Export Atlas" }).click();
  await expect(page.getByRole("alert")).toContainText("Could not export this project");
});
