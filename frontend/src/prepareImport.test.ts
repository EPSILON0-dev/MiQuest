import { describe, expect, it } from "vitest";
import { prepareImport } from "./prepareImport";

describe("import layout preparation", () => {
  const base = {
    version: 2,
    pages: [{ key: "main", quests: ["a", "b"], layout: "branching" as const }],
    quests: [{ key: "a" }, { key: "b", milestone: true }],
    dependencies: [{ quest: "b", dependsOn: "a" }],
  };

  it("calculates positions without mutating the source", () => {
    const result = prepareImport(base) as typeof base & { pages: { positions: { quest: string; x: number; y: number }[] }[] };
    expect(result.pages[0].positions).toHaveLength(2);
    expect(result.pages[0].positions[1].x).toBeGreaterThan(result.pages[0].positions[0].x);
    expect(base.pages[0]).not.toHaveProperty("positions");
  });

  it("preserves explicit positions when layout is bypassed", () => {
    const input = { ...base, bypassAutoLayout: true, pages: [{ ...base.pages[0], positions: [{ quest: "a", x: -10, y: 20 }] }] };
    expect(prepareImport(input)).toBe(input);
  });
});
