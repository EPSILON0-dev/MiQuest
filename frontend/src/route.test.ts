import { describe, expect, it } from "vitest";
import { formatRoute, parseRoute } from "./route";

describe("tree and quest routes", () => {
  it("round trips identifiers containing reserved characters", () => {
    const route = {
      projectId: "project / one",
      pageId: "tree?#",
      questId: "quest/✓",
    };
    expect(parseRoute(formatRoute(route))).toEqual(route);
    expect(parseRoute(formatRoute({ projectId: "p", pageId: "t" }))).toEqual({
      projectId: "p",
      pageId: "t",
    });
  });

  it("round trips project-only links for an empty project", () => {
    const project = { projectId: "empty / project" };
    expect(parseRoute(formatRoute(project))).toEqual(project);
  });

  it("distinguishes bare routes from malformed links", () => {
    for (const hash of ["", "#", "#/"])
      expect(parseRoute(hash)).toBeUndefined();
    for (const hash of [
      "#bad",
      "#/projects/p/trees",
      "#/projects/p/trees/t/quests",
      "#/projects/p/trees/t/extra",
      "#/projects/%ZZ/trees/t",
      "#/projects/p/trees//quests/q",
    ])
      expect(parseRoute(hash)).toBeNull();
  });
});
