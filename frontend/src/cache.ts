import { statusForQuest, type Model } from "./model";

export function remapModelIds(
  model: Model,
  ids: Record<string, string>,
): Model {
  const id = (value: string) => ids[value] ?? value;
  return {
    projects: model.projects.map((project) => ({
      ...project,
      id: id(project.id),
    })),
    pages: model.pages.map((page) => ({
      ...page,
      id: id(page.id),
      projectId: id(page.projectId),
    })),
    quests: model.quests.map((quest) => ({
      ...quest,
      id: id(quest.id),
      projectId: id(quest.projectId),
      homePageId: id(quest.homePageId),
      ...(quest.unsatisfiedPrerequisiteIds && {
        unsatisfiedPrerequisiteIds: quest.unsatisfiedPrerequisiteIds.map(id),
      }),
    })),
    appearances: model.appearances.map((appearance) => ({
      ...appearance,
      pageId: id(appearance.pageId),
      questId: id(appearance.questId),
    })),
    dependencies: model.dependencies.map((edge) => ({
      ...edge,
      questId: id(edge.questId),
      dependsOnQuestId: id(edge.dependsOnQuestId),
    })),
    pins: model.pins.map((pin) => ({
      ...pin,
      projectId: id(pin.projectId),
      questId: id(pin.questId),
    })),
    verifications: model.verifications.map((event) => ({
      ...event,
      id: id(event.id),
      questId: id(event.questId),
    })),
  };
}

export function statusForLoadedQuest(
  model: Model,
  questId: string,
  localQuestIds: Set<string>,
): ReturnType<typeof statusForQuest> {
  const localStatus = statusForQuest(model, questId);
  if (localQuestIds.has(questId) || localStatus === "locked")
    return localStatus;
  const quest = model.quests.find((item) => item.id === questId);
  if (
    quest?.status === "locked" &&
    (quest.unsatisfiedPrerequisiteIds === undefined ||
      quest.unsatisfiedPrerequisiteIds.some(
        (id) =>
          !["verified", "overridden"].includes(
            model.quests.find((item) => item.id === id)?.completionState ??
              "none",
          ),
      ))
  )
    return "locked";
  return localStatus;
}
