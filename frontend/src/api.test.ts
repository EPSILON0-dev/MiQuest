import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  loadModel,
  loadPageGraph,
  loadPageMemberships,
  loadVerificationHistory,
  persistModel,
  saveTreeDraft,
} from "./api";
import type { Model } from "./model";

const empty: Model = {
  projects: [],
  pages: [],
  quests: [],
  appearances: [],
  dependencies: [],
  pins: [],
  verifications: [],
};
const reply = (data: unknown, projectRevision?: number) =>
  new Response(JSON.stringify({ data, projectRevision }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
afterEach(() => vi.unstubAllGlobals());

describe("API adapter", () => {
  it("loads navigation without graphs or history, then loads one page and paginated history on demand", async () => {
    const project = { id: "p", name: "P", description: "", revision: 3 };
    const quest = { id: "q" };
    const remote = { id: "remote" };
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(reply([project]))
      .mockResolvedValueOnce(
        reply([{ id: "page", projectId: "p", name: "Tree" }], 3),
      )
      .mockResolvedValueOnce(
        reply(
          {
            project,
            page: { id: "page" },
            quests: [quest],
            appearances: [],
            memberships: [],
            dependencies: [],
            externalLinks: [
              {
                direction: "prerequisite",
                localQuestId: "q",
                remoteQuest: remote,
              },
            ],
            pins: [],
          },
          3,
        ),
      )
      .mockResolvedValueOnce(
        reply({ items: [{ id: "v1" }], nextAfterSequence: 200 }, 3),
      )
      .mockResolvedValueOnce(
        reply({ items: [{ id: "v2" }], nextAfterSequence: null }, 3),
      );
    vi.stubGlobal("fetch", fetch);
    const navigation = await loadModel();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(navigation.model.quests).toEqual([]);
    expect(navigation.revisions).toEqual({ p: 3 });
    const graph = await loadPageGraph("page");
    expect(graph.model.dependencies).toEqual([
      { questId: "q", dependsOnQuestId: "remote" },
    ]);
    expect(graph.model.quests).toHaveLength(2);
    const history = await loadVerificationHistory("q");
    expect(history.items.map((v) => v.id)).toEqual(["v1", "v2"]);
    expect(fetch.mock.calls[4][0]).toContain("afterSequence=200");
  });

  it("fetches deletion memberships without loading a graph", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        reply(
          {
            quests: [{ id: "q" }],
            appearances: [{ pageId: "a", questId: "q", x: 1, y: 2 }],
          },
          3,
        ),
      );
    vi.stubGlobal("fetch", fetch);
    const data = await loadPageMemberships("a");
    expect(data.revision).toBe(3);
    expect(data.appearances).toHaveLength(1);
    expect(fetch.mock.calls[0][0]).toBe("/api/v1/pages/a/memberships");
  });

  it("rejects verification history pages from different revisions", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(reply({ items: [], nextAfterSequence: 200 }, 3))
        .mockResolvedValueOnce(
          reply({ items: [], nextAfterSequence: null }, 4),
        ),
    );
    await expect(loadVerificationHistory("q")).rejects.toMatchObject({
      code: "stale_revision",
    });
  });

  it("submits tree changes in one atomic request with the original revision", async () => {
    const quest = {
      id: "q",
      projectId: "p",
      title: "Q",
      description: "",
      acceptanceCriteria: "",
      workState: "not_started" as const,
      completionState: "none" as const,
      icon: "compass",
      milestone: false,
      homePageId: "a",
    };
    const old: Model = {
      ...empty,
      quests: [quest],
      appearances: [{ pageId: "a", questId: "q", x: 1, y: 2 }],
    };
    const next: Model = {
      ...old,
      quests: [{ ...quest, title: "Changed" }],
      appearances: [{ pageId: "a", questId: "q", x: 3, y: 4 }],
    };
    const fetch = vi.fn().mockResolvedValue(reply({ ids: {} }, 8));
    vi.stubGlobal("fetch", fetch);
    expect(await saveTreeDraft(old, next, "p", 7)).toEqual({
      ids: {},
      revision: 8,
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({
      expectedRevision: 7,
      operations: [
        {
          operation: "update_quest_appearance",
          arguments: { pageId: "a", questId: "q", x: 3, y: 4 },
        },
        {
          operation: "update_quest",
          arguments: { questId: "q", title: "Changed" },
        },
      ],
    });
  });

  it("orders draft operations so new appearances and home changes precede removal", async () => {
    const quest = {
      id: "q",
      projectId: "p",
      title: "Q",
      description: "",
      acceptanceCriteria: "",
      workState: "not_started" as const,
      completionState: "none" as const,
      icon: "compass",
      milestone: false,
      homePageId: "a",
    };
    const old: Model = {
      ...empty,
      quests: [quest],
      appearances: [{ pageId: "a", questId: "q", x: 1, y: 2 }],
    };
    const next: Model = {
      ...old,
      quests: [{ ...quest, homePageId: "b" }],
      appearances: [{ pageId: "b", questId: "q", x: 3, y: 4 }],
    };
    const fetch = vi.fn().mockResolvedValue(reply({ ids: {} }, 2));
    vi.stubGlobal("fetch", fetch);
    await saveTreeDraft(old, next, "p", 1);
    const operations = JSON.parse(fetch.mock.calls[0][1].body).operations;
    expect(operations.map((op: { operation: string }) => op.operation)).toEqual(
      ["add_quest_to_page", "update_quest", "remove_quest_from_page"],
    );
    expect(operations[1].arguments.homePageId).toBe("b");
  });

  it("deletes a quest before adding dependencies that were blocked by its edges", async () => {
    const quest = {
      id: "a", projectId: "p", title: "Q", description: "",
      acceptanceCriteria: "", workState: "not_started" as const,
      completionState: "none" as const, icon: "compass", milestone: false,
      homePageId: "page",
    };
    const old: Model = {
      ...empty,
      quests: [quest, { ...quest, id: "b" }, { ...quest, id: "c" }],
      dependencies: [
        { questId: "c", dependsOnQuestId: "b" },
        { questId: "b", dependsOnQuestId: "a" },
      ],
    };
    const next: Model = {
      ...old,
      quests: old.quests.filter((q) => q.id !== "b"),
      dependencies: [{ questId: "a", dependsOnQuestId: "c" }],
    };
    const fetch = vi.fn().mockResolvedValue(reply({ ids: {} }, 3));
    vi.stubGlobal("fetch", fetch);
    await saveTreeDraft(old, next, "p", 2);
    const operations = JSON.parse(fetch.mock.calls[0][1].body).operations;
    expect(operations.map((op: { operation: string }) => op.operation)).toEqual([
      "delete_quest", "add_dependency",
    ]);
  });

  it("maps created ids and carries each returned revision into the next mutation", async () => {
    const next: Model = {
      ...empty,
      projects: [{ id: "temp-p", name: "P", description: "" }],
      pages: [{ id: "temp-page", projectId: "temp-p", name: "Tree" }],
      quests: [
        {
          id: "temp-q",
          projectId: "temp-p",
          title: "Q",
          description: "",
          acceptanceCriteria: "",
          workState: "not_started",
          completionState: "none",
          icon: "compass",
          milestone: false,
          homePageId: "temp-page",
        },
      ],
      appearances: [{ pageId: "temp-page", questId: "temp-q", x: 1, y: 2 }],
    };
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(reply({ id: "p" }, 0))
      .mockResolvedValueOnce(reply({ id: "page" }, 1))
      .mockResolvedValueOnce(reply({ quest: { id: "q" } }, 2))
      .mockResolvedValueOnce(reply([]));
    vi.stubGlobal("fetch", fetch);
    const result = await persistModel(empty, next, {});
    expect(result.ids).toEqual({
      "temp-p": "p",
      "temp-page": "page",
      "temp-q": "q",
    });
    expect(JSON.parse(fetch.mock.calls[1][1].body).expectedRevision).toBe(0);
    expect(JSON.parse(fetch.mock.calls[2][1].body)).toMatchObject({
      expectedRevision: 1,
      pageId: "page",
      x: 1,
      y: 2,
    });
  });

  it("deletes a page and moves its orphan in one transaction", async () => {
    const quest = {
      id: "q",
      projectId: "p",
      title: "Q",
      description: "",
      acceptanceCriteria: "",
      workState: "not_started" as const,
      completionState: "none" as const,
      icon: "compass",
      milestone: false,
      homePageId: "a",
    };
    const old: Model = {
      ...empty,
      projects: [{ id: "p", name: "P", description: "" }],
      pages: [
        { id: "a", projectId: "p", name: "A" },
        { id: "b", projectId: "p", name: "B" },
      ],
      quests: [quest],
      appearances: [{ pageId: "a", questId: "q", x: 1, y: 2 }],
    };
    const next: Model = {
      ...old,
      pages: [old.pages[1]],
      quests: [{ ...quest, homePageId: "b" }],
      appearances: [{ pageId: "b", questId: "q", x: 1, y: 2 }],
    };
    const fetch = vi.fn().mockResolvedValue(reply({}, 2));
    vi.stubGlobal("fetch", fetch);
    const result = await persistModel(old, next, { p: 1 });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toBe("/api/v1/pages/a");
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
      expectedRevision: 1,
      confirmDelete: true,
      questActions: [
        { questId: "q", action: "move", targetPageId: "b", x: 1, y: 2 },
      ],
    });
    expect(result.model).toEqual(next);
  });

  it("surfaces stale revisions as typed errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              error: { code: "stale_revision", message: "stale" },
            }),
            { status: 409 },
          ),
        ),
      ),
    );
    const old = {
      ...empty,
      projects: [{ id: "p", name: "Old", description: "" }],
    };
    const next = { ...old, projects: [{ ...old.projects[0], name: "New" }] };
    await expect(persistModel(old, next, { p: 3 })).rejects.toMatchObject({
      code: "stale_revision",
      status: 409,
    });
    await expect(loadModel()).rejects.toBeInstanceOf(ApiError);
  });
});
