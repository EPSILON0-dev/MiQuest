import { execFileSync } from "node:child_process";
import { test as base, expect } from "@playwright/test";

type Ids = Record<string, string>;
const names: Record<string, string> = {
  foundations: "Foundations",
  launch: "Launch path",
  vision: "Define the north star",
  research: "Map the landscape",
  architecture: "Shape the architecture",
  milestone: "A useful first version",
  story: "Write the story",
  review: "Review the experience",
};
export const test = base.extend<{ ids: Ids }>({
  ids: [
    async ({ request, context }, use) => {
      const root = process.env.MIQUEST_E2E_DIR!;
      execFileSync(
        process.env.MIQUEST_PYTHON || "../backend/.venv/bin/python",
        [
          "-c",
          "import sqlite3,sys; a=sqlite3.connect(sys.argv[1]); b=sqlite3.connect(sys.argv[2]); a.backup(b); b.close(); a.close()",
          `${root}/seed.sqlite3`,
          `${root}/test.sqlite3`,
        ],
      );
      const projects = (await (await request.get("/api/v1/projects")).json())
        .data as { id: string; name: string }[];
      const atlas = projects.find((p) => p.name === "Atlas");
      if (!atlas) throw new Error("Seeded Atlas project missing");
      const graph = (
        await (await request.get(`/api/v1/projects/${atlas.id}/graph`)).json()
      ).data as {
        pages: { id: string; name: string }[];
        quests: { id: string; title: string }[];
      };
      const ids: Ids = {};
      for (const [key, name] of Object.entries(names)) {
        const item = [
          ...graph.pages.map((p) => ({ id: p.id, name: p.name })),
          ...graph.quests.map((q) => ({ id: q.id, name: q.title })),
        ].find((p) => p.name === name);
        if (!item) throw new Error(`Seeded item missing: ${name}`);
        ids[key] = item.id;
      }
      await context.addInitScript((pageId) => {
        if (!localStorage.getItem("miquest-view"))
          localStorage.setItem(
            "miquest-view",
            JSON.stringify({ pageId, viewports: {} }),
          );
      }, ids.foundations);
      await use(ids);
    },
    { auto: true },
  ],
});
export { expect };
