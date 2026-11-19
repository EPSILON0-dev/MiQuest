import { expect, it } from "vitest";
import { createFixture } from "./model";
import { exportProject } from "./exportProject";

it("preserves project pages, shared quests, positions, cross-tree edges and pins", () => {
  const fixture = createFixture();
  const project = fixture.projects[0];
  const pages = fixture.pages.filter((page) => page.projectId === project.id);
  const quests = fixture.quests.filter((quest) => quest.projectId === project.id);
  const ids = new Set(quests.map((quest) => quest.id));
  const graph = {
    project, pages, quests,
    appearances: fixture.appearances.filter((item) => ids.has(item.questId)),
    dependencies: fixture.dependencies.filter((item) => ids.has(item.questId)),
    pins: fixture.pins.filter((item) => item.projectId === project.id),
  };
  const result = exportProject(graph, [{ id: "proof-1", questId: quests[0].id, sequence: 1, verdict: "pass", actor: "agent", evidence: "proof text", reasoning: "Criteria met.", createdAt: "2026-11-19", snapshot: { title: "saved title", prerequisites: [] } }]);
  expect(result.bypassAutoLayout).toBe(true);
  for (const page of result.pages) {
    expect(page.positions).toEqual(graph.appearances.filter((item) => item.pageId === page.key).map((item) => ({ quest: item.questId, x: item.x, y: item.y })));
  }
  expect(result.quests.map((quest) => quest.homePage)).toEqual(quests.map((quest) => quest.homePageId));
  expect(result.dependencies).toEqual(graph.dependencies.map((edge) => ({ quest: edge.questId, dependsOn: edge.dependsOnQuestId })));
  expect(result.pins).toEqual(graph.pins.map((pin) => pin.questId));
  expect(result.quests[0].workState).toBe(quests[0].workState);
  expect(result.quests[0].completionState).toBe(quests[0].completionState);
  expect(result.quests[0].verifications[0].evidence).toBe("proof text");
});
