import { describe, expect, it } from "vitest";
import {
  addDependency,
  createFixture,
  deletePage,
  deleteQuest,
  removeAppearance,
  statusForQuest,
} from "./model";

describe("quest graph", () => {
  it("rejects self, cross-project, duplicate, and cyclic dependencies", () => {
    const model = createFixture();
    expect(() => addDependency(model, "vision", "vision")).toThrow(/itself/);
    expect(() => addDependency(model, "vision", "space")).toThrow(
      /same project/,
    );
    expect(() => addDependency(model, "research", "vision")).toThrow(
      /already exists/,
    );
    expect(() => addDependency(model, "vision", "prototype")).toThrow(/cycle/);
    expect(
      addDependency(model, "audience", "research").dependencies,
    ).toContainEqual({ questId: "audience", dependsOnQuestId: "research" });
  });

  it("relocks dependents without erasing their completion or history", () => {
    const model = createFixture();
    expect(statusForQuest(model, "research")).toBe("verified");
    const reopened = {
      ...model,
      quests: model.quests.map((q) =>
        q.id === "vision" ? { ...q, completionState: "none" as const } : q,
      ),
    };
    expect(statusForQuest(reopened, "research")).toBe("locked");
    expect(
      reopened.quests.find((q) => q.id === "research")?.completionState,
    ).toBe("verified");
    expect(reopened.verifications).toEqual(model.verifications);
    expect(statusForQuest(model, "review")).toBe("locked");
    expect(
      model.verifications.some(
        (v) => v.questId === "review" && v.verdict === "pass",
      ),
    ).toBe(true);
  });
});

describe("tree membership", () => {
  it("rejects orphaning and reassigns the home tree when an appearance is removed", () => {
    const model = createFixture();
    expect(() => removeAppearance(model, "foundations", "vision")).toThrow(
      /at least one tree/,
    );
    const result = removeAppearance(model, "foundations", "milestone");
    expect(result.quests.find((q) => q.id === "milestone")?.homePageId).toBe(
      "launch",
    );
    expect(result.appearances.filter((a) => a.questId === "milestone")).toEqual(
      [{ pageId: "launch", questId: "milestone", x: 580, y: 200 }],
    );
  });

  it("moves otherwise orphaned quests on tree deletion and retains shared appearances", () => {
    const model = createFixture();
    expect(() => deletePage(model, "foundations")).toThrow(/Move quests/);
    expect(() => deletePage(model, "foundations", "rhythm")).toThrow(
      /this project/,
    );
    const result = deletePage(model, "foundations", "launch");
    expect(result.pages.some((p) => p.id === "foundations")).toBe(false);
    expect(result.appearances.find((a) => a.questId === "vision")).toEqual({
      pageId: "launch",
      questId: "vision",
      x: 40,
      y: 220,
    });
    expect(
      result.appearances.filter((a) => a.questId === "milestone"),
    ).toHaveLength(1);
    expect(result.quests.find((q) => q.id === "milestone")?.homePageId).toBe(
      "launch",
    );
  });

  it("cleans up all references when deleting a quest", () => {
    const result = deleteQuest(createFixture(), "vision");
    expect(result.quests.some((q) => q.id === "vision")).toBe(false);
    expect(result.appearances.some((a) => a.questId === "vision")).toBe(false);
    expect(
      result.dependencies.some(
        (d) => d.questId === "vision" || d.dependsOnQuestId === "vision",
      ),
    ).toBe(false);
    expect(result.verifications.some((v) => v.questId === "vision")).toBe(
      false,
    );
    const pinned = deleteQuest(result, "milestone");
    expect(pinned.pins.some((p) => p.questId === "milestone")).toBe(false);
    expect(pinned.appearances.some((a) => a.questId === "milestone")).toBe(
      false,
    );
  });
});

it("ships a consistent fixture with valid homes, appearances, pins and an acyclic graph", () => {
  const model = createFixture();
  expect(model.projects.length).toBeGreaterThanOrEqual(2);
  expect(model.quests.length).toBeGreaterThanOrEqual(12);
  expect(model.quests.length).toBeLessThanOrEqual(20);
  for (const quest of model.quests) {
    expect(
      model.appearances.some(
        (a) => a.questId === quest.id && a.pageId === quest.homePageId,
      ),
    ).toBe(true);
  }
  for (const appearance of model.appearances) {
    expect(model.pages.find((p) => p.id === appearance.pageId)?.projectId).toBe(
      model.quests.find((q) => q.id === appearance.questId)?.projectId,
    );
    expect(
      model.appearances.filter(
        (a) =>
          a.pageId === appearance.pageId && a.questId === appearance.questId,
      ),
    ).toHaveLength(1);
  }
  for (const pin of model.pins)
    expect(model.quests.find((q) => q.id === pin.questId)?.projectId).toBe(
      pin.projectId,
    );
  let graph = { ...model, dependencies: [] as typeof model.dependencies };
  for (const edge of model.dependencies)
    graph = addDependency(graph, edge.questId, edge.dependsOnQuestId);
  expect(graph.dependencies).toEqual(model.dependencies);
});
