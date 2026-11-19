import dagre from "@dagrejs/dagre";

export type Layout = "branching" | "radial" | "spiral";
type LayoutQuest = { id: string; milestone: boolean };
type LayoutDependency = { questId: string; dependsOnQuestId: string };
type Point = { x: number; y: number };

/** Coordinates are top-left positions, matching page appearances. */
export function layoutQuests(
  quests: LayoutQuest[],
  dependencies: LayoutDependency[],
  layout: Layout,
): Record<string, Point> {
  const nodes = [...quests].sort((a, b) => a.id.localeCompare(b.id));
  const ids = new Set(nodes.map((q) => q.id));
  const edges = dependencies.filter(
    (d) => ids.has(d.questId) && ids.has(d.dependsOnQuestId),
  );
  const before = (id: string) =>
    edges
      .filter((d) => d.questId === id)
      .map((d) => d.dependsOnQuestId)
      .sort();
  const after = (id: string) =>
    edges
      .filter((d) => d.dependsOnQuestId === id)
      .map((d) => d.questId)
      .sort();
  const positions: Record<string, Point> = {};
  const put = (q: LayoutQuest, x: number, y: number) => {
    const half = q.milestone ? 36 : 26;
    positions[q.id] = { x: x - half, y: y - half };
  };
  if (!nodes.length) return positions;

  if (layout === "spiral") {
    const ends = nodes.filter((q) => after(q.id).length === 0);
    if (
      ends.length === 1 &&
      nodes.every((q) => before(q.id).length <= 1 && after(q.id).length <= 1) &&
      edges.length === nodes.length - 1
    ) {
      let id: string | undefined = ends[0].id;
      let index = 0;
      while (id !== undefined && index < nodes.length) {
        const q = nodes.find((node) => node.id === id)!;
        const radius = 100 * Math.sqrt(index);
        const angle = 2.5 * Math.sqrt(index);
        put(q, radius * Math.cos(angle), radius * Math.sin(angle));
        id = before(id)[0];
        index++;
      }
      if (index === nodes.length) return positions;
    }
  }

  if (layout === "radial") {
    const outcomes = nodes.filter((q) => after(q.id).length === 0);
    const root = outcomes.find((q) => q.milestone) ?? outcomes[0] ?? nodes[0];
    const levels = new Map<string, number>([[root.id, 0]]);
    const queue = [root.id];
    for (let i = 0; i < queue.length; i++) {
      for (const id of before(queue[i])) {
        if (!levels.has(id)) {
          levels.set(id, levels.get(queue[i])! + 1);
          queue.push(id);
        }
      }
    }
    const outer = Math.max(...levels.values()) + 1;
    nodes.forEach((q) => {
      if (!levels.has(q.id)) levels.set(q.id, outer);
    });
    put(root, 0, 0);
    let radius = 0;
    for (let level = 1; level <= outer; level++) {
      const ring = nodes.filter((q) => levels.get(q.id) === level);
      if (!ring.length) continue;
      radius = Math.max(radius + 110, (ring.length * 110) / (2 * Math.PI));
      ring.forEach((q, i) => {
        const angle = -Math.PI / 2 + (2 * Math.PI * i) / ring.length;
        put(q, radius * Math.cos(angle), radius * Math.sin(angle));
      });
    }
    return positions;
  }

  const graph = new dagre.graphlib.Graph()
    .setGraph({ rankdir: "LR", nodesep: 35, ranksep: 55 })
    .setDefaultEdgeLabel(() => ({}));
  nodes.forEach((q) => {
    const size = q.milestone ? 72 : 52;
    graph.setNode(q.id, { width: size, height: size });
  });
  [...edges]
    .sort((a, b) =>
      `${a.dependsOnQuestId}\0${a.questId}`.localeCompare(
        `${b.dependsOnQuestId}\0${b.questId}`,
      ),
    )
    .forEach((d) => graph.setEdge(d.dependsOnQuestId, d.questId));
  dagre.layout(graph);
  nodes.forEach((q) => put(q, graph.node(q.id).x, graph.node(q.id).y));
  return positions;
}
