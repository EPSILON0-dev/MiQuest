import { describe, expect, it } from "vitest";
import { layoutQuests } from "./layout";

const quests = Array.from({ length: 30 }, (_, i) => ({
  id: String(i).padStart(2, "0"),
  milestone: i === 29,
}));
const chain = quests
  .slice(1)
  .map((q, i) => ({ questId: q.id, dependsOnQuestId: quests[i].id }));

describe("quest layouts", () => {
  it.each(["branching", "radial", "spiral"] as const)(
    "places a chain deterministically without overlaps in %s",
    (layout) => {
      const result = layoutQuests(quests, chain, layout);
      expect(result).toEqual(
        layoutQuests([...quests].reverse(), [...chain].reverse(), layout),
      );
      for (const [i, q] of quests.entries()) {
        expect(Number.isFinite(result[q.id].x)).toBe(true);
        expect(Number.isFinite(result[q.id].y)).toBe(true);
        for (const other of quests.slice(i + 1)) {
          const a = result[q.id];
          const b = result[other.id];
          const sizeA = q.milestone ? 72 : 52;
          const sizeB = other.milestone ? 72 : 52;
          expect(
            a.x + sizeA <= b.x ||
              b.x + sizeB <= a.x ||
              a.y + sizeA <= b.y ||
              b.y + sizeB <= a.y,
          ).toBe(true);
        }
      }
    },
  );
  it("centers the outcome and places prerequisites outward", () => {
    const result = layoutQuests(quests.slice(-3), chain, "radial");
    expect(result["29"]).toEqual({ x: -36, y: -36 });
    expect(
      Math.hypot(result["27"].x + 26, result["27"].y + 26),
    ).toBeGreaterThan(Math.hypot(result["28"].x + 26, result["28"].y + 26));
  });
  it("places disconnected radial nodes without overlap", () => {
    const nodes = Array.from({ length: 100 }, (_, i) => ({
      id: String(i).padStart(3, "0"),
      milestone: i % 3 === 0,
    }));
    const result = layoutQuests(nodes, [], "radial");
    for (const [i, node] of nodes.entries()) {
      for (const other of nodes.slice(i + 1)) {
        const a = result[node.id];
        const b = result[other.id];
        const sizeA = node.milestone ? 72 : 52;
        const sizeB = other.milestone ? 72 : 52;
        expect(
          a.x + sizeA <= b.x ||
            b.x + sizeB <= a.x ||
            a.y + sizeA <= b.y ||
            b.y + sizeB <= a.y,
        ).toBe(true);
      }
    }
  });
  it("falls back for a non-linear spiral and ignores external edges", () => {
    const graph = [
      ...chain.slice(0, 2),
      { questId: "02", dependsOnQuestId: "00" },
      { questId: "outside", dependsOnQuestId: "00" },
    ];
    expect(layoutQuests(quests.slice(0, 3), graph, "spiral")).toEqual(
      layoutQuests(quests.slice(0, 3), graph, "branching"),
    );
    expect(layoutQuests([], graph, "radial")).toEqual({});
  });
});
