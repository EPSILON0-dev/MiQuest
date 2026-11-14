import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, loadModel, persistModel } from "./api";
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
  it("loads every verification history page with a consistent revision", async () => {
    const project = { id: "p", name: "P", description: "" };
    const quest = { id: "q" };
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(reply([project]))
      .mockResolvedValueOnce(
        reply(
          {
            project,
            pages: [],
            quests: [quest],
            appearances: [],
            dependencies: [],
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
    const result = await loadModel();
    expect(result.model.verifications.map((v) => v.id)).toEqual(["v1", "v2"]);
    expect(result.revisions).toEqual({ p: 3 });
    expect(fetch.mock.calls[3][0]).toContain("afterSequence=200");
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

  it("adds a surviving appearance and changes home before deleting a page", async () => {
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
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(reply({}, 2))
      .mockResolvedValueOnce(reply({}, 3))
      .mockResolvedValueOnce(reply({}, 4))
      .mockResolvedValueOnce(reply([]));
    vi.stubGlobal("fetch", fetch);
    await persistModel(old, next, { p: 1 });
    expect(
      fetch.mock.calls.slice(0, 3).map((call) => [call[0], call[1].method]),
    ).toEqual([
      ["/api/v1/pages/b/quests/q", "PUT"],
      ["/api/v1/quests/q", "PATCH"],
      ["/api/v1/pages/a", "DELETE"],
    ]);
    expect(JSON.parse(fetch.mock.calls[2][1].body)).toEqual({
      expectedRevision: 3,
      confirmDelete: true,
      questActions: [],
    });
  });

  it("surfaces stale revisions as typed errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockImplementation(() =>
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
