import type { loadProjectGraph } from "./api";

import type { Verification } from "./model";

export function exportProject(graph: Omit<Awaited<ReturnType<typeof loadProjectGraph>>, "revision">, verifications: Verification[]) {
  return {
    version: 2,
    project: { name: graph.project.name, description: graph.project.description },
    bypassAutoLayout: true,
    pages: graph.pages.map((page) => {
      const appearances = graph.appearances.filter((item) => item.pageId === page.id);
      return {
        key: page.id,
        name: page.name,
        layout: page.layout ?? "branching",
        quests: appearances.map((item) => item.questId),
        positions: appearances.map((item) => ({ quest: item.questId, x: item.x, y: item.y })),
      };
    }),
    quests: graph.quests.map((quest) => ({
      key: quest.id,
      title: quest.title,
      homePage: quest.homePageId,
      description: quest.description,
      acceptanceCriteria: quest.acceptanceCriteria,
      iconName: quest.icon,
      milestone: quest.milestone,
      workState: quest.workState,
      completionState: quest.completionState,
      verifications: verifications.filter((item) => item.questId === quest.id).map((item, index) => ({
        key: item.id,
        sequence: item.sequence ?? index + 1,
        verdict: item.verdict,
        actor: item.actor,
        evidence: item.evidence,
        reasoning: item.reasoning,
        createdAt: item.createdAt,
        snapshot: item.snapshot ?? {},
      })),
    })),
    dependencies: graph.dependencies.map((edge) => ({ quest: edge.questId, dependsOn: edge.dependsOnQuestId })),
    pins: graph.pins.map((pin) => pin.questId),
  };
}
