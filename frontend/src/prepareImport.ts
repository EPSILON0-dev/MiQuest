import { layoutQuests } from "./layout";
import type { LayoutShape } from "./model";

type ImportDocument = {
  bypassAutoLayout?: boolean;
  pages: { key: string; quests: string[]; layout: LayoutShape; positions?: { quest: string; x: number; y: number }[] }[];
  quests: { key: string; milestone?: boolean }[];
  dependencies?: { quest: string; dependsOn: string }[];
};

// The server validates the document before it reaches this function.
export function prepareImport(document: object): object {
  const input = document as ImportDocument;
  if (input.bypassAutoLayout) return input;
  return {
    ...input,
    pages: input.pages.map((page) => {
      const quests = input.quests.filter((quest) => page.quests.includes(quest.key));
      const positions = layoutQuests(
        quests.map((quest) => ({ id: quest.key, milestone: !!quest.milestone })),
        (input.dependencies ?? []).map((edge) => ({ questId: edge.quest, dependsOnQuestId: edge.dependsOn })),
        page.layout,
      );
      return { ...page, positions: page.quests.map((quest) => ({ quest, ...positions[quest] })) };
    }),
  };
}
