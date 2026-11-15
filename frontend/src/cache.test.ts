import { describe, expect, it } from "vitest";
import { remapModelIds, statusForLoadedQuest } from "./cache";
import { createFixture } from "./model";

describe("cached graph helpers", () => {
  it("uses server status for remote quests and local edges for the open tree", () => {
    const model = createFixture();
    model.quests = model.quests.map((quest) =>
      quest.id === "story" ? { ...quest, status: "locked" } : quest,
    );
    model.dependencies = model.dependencies.filter(
      (edge) => edge.questId !== "story",
    );
    expect(statusForLoadedQuest(model, "story", new Set(["vision"]))).toBe(
      "locked",
    );
    expect(statusForLoadedQuest(model, "story", new Set(["story"]))).toBe(
      "in_progress",
    );
    model.quests = model.quests.map((quest) =>
      quest.id === "story"
        ? { ...quest, status: "locked", unsatisfiedPrerequisiteIds: ["vision"] }
        : quest,
    );
    expect(statusForLoadedQuest(model, "story", new Set(["vision"]))).toBe(
      "in_progress",
    );
    model.quests = model.quests.map((quest) =>
      quest.id === "vision" ? { ...quest, completionState: "none" } : quest,
    );
    expect(statusForLoadedQuest(model, "story", new Set(["vision"]))).toBe(
      "locked",
    );
    model.quests = model.quests.map((quest) =>
      quest.id === "story" ? { ...quest, status: "available" } : quest,
    );
    model.dependencies.push({ questId: "story", dependsOnQuestId: "audience" });
    expect(statusForLoadedQuest(model, "story", new Set(["vision"]))).toBe(
      "locked",
    );
  });

  it("remaps only identifiers and leaves user-entered strings intact", () => {
    const model = createFixture();
    model.projects[0].description = "vision";
    model.quests[0].title = "vision";
    model.quests[0].description = "foundations";
    model.verifications[0].reasoning = "vision";
    const mapped = remapModelIds(model, {
      atlas: "project-id",
      foundations: "page-id",
      vision: "quest-id",
      v1: "verification-id",
    });
    expect(mapped.projects[0]).toMatchObject({
      id: "project-id",
      description: "vision",
    });
    expect(mapped.quests[0]).toMatchObject({
      id: "quest-id",
      projectId: "project-id",
      homePageId: "page-id",
      title: "vision",
      description: "foundations",
    });
    expect(mapped.appearances[0]).toMatchObject({
      pageId: "page-id",
      questId: "quest-id",
    });
    expect(mapped.dependencies[0].dependsOnQuestId).toBe("quest-id");
    expect(mapped.verifications[0]).toMatchObject({
      id: "verification-id",
      questId: "quest-id",
      reasoning: "vision",
    });
    expect(model.quests[0].id).toBe("vision");
  });
});
