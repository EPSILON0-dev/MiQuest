# MiQuest

A self-hosted, single-user quest graph for resuming and advancing long-running projects.

Phase A is an interactive frontend prototype: two progressions, 18 quests, three trees, shared milestones, cross-tree links, pins, and fixture verification history. Changes are held in memory. Your last tree and each tree's pan/zoom are restored after reload; quest journals start closed.

## Run locally

Requires Node.js 22.12+ and npm.

```sh
cd frontend
npm ci
npm run dev -- --host 127.0.0.1
```

Open http://127.0.0.1:5173. This preview runs on loopback. No backend, accounts, or remote service is involved.

## Try the prototype

1. Explore **Atlas → Foundations**. Pan, zoom, drag quests, use Fit view, or reorganize with Auto layout.
2. Open **Shape the architecture** for its journal. Back or Escape restores focus and the unblurred tree. Edit its fields, icon, dependencies, tree memberships, home tree, and positions.
3. Open **A useful first version** on either Atlas tree: both appearances share one identity. Pin shortcuts open quests on their home tree and highlight them; use their arrows to reorder.
4. On **Launch path**, follow the cross-tree prerequisite or inspect **Review the experience**: historical verification remains visible while a prerequisite is unsatisfied.
5. Add a quest from the toolbar or canvas context menu. Connect handles or use workspace settings. Click an edge to remove it; cycles are rejected.
6. Use workspace settings to create/rename/delete progressions and trees. Last appearances cannot be removed; tree deletion requires moving otherwise orphaned quests. Global quest deletion requires confirmation.
7. Try the local human override/reopen form with a reason and confirmation, then inspect its history. These are prototype records, not backend verification.
8. At phone width, use the navigation drawer, expandable pins, and full-screen journal. The graph stays pannable.

## Validate and capture screenshots

```sh
cd frontend
npm run lint
npm test
npm run build
npm exec playwright -- install chromium
npm run test:e2e
```

Browser tests automatically start the preview and capture [desktop](docs/screenshots/desktop.png), [desktop journal](docs/screenshots/desktop-journal.png), [narrow](docs/screenshots/narrow.png), and [narrow journal](docs/screenshots/narrow-journal.png). They use an existing `/usr/bin/chromium` when available, otherwise Playwright's installed Chromium. Set `CHROME_PATH` to use another executable. GitHub Actions runs the same checks and uploads screenshots.

The root stylesheet `frontend/src/index.css` holds semantic theme settings. Icons use stable names from one bundled Lucide registry; there are no uploads.

## Scope and next gate

[DESIGN.md](DESIGN.md) is authoritative. See [ROADMAP.md](ROADMAP.md), [PROGRESS.md](PROGRESS.md), and [AGENTS.md](AGENTS.md).

**Explicit user UI approval is required before Phase B.** Backend, database, MCP, real verification, and deployment remain deferred. Fixture edits reset on reload.

Known tooling notes: the graph/UI production bundle triggers Vite's 500 kB advisory; the dependency audit reports seven moderate findings in the development-only TypeScript ESLint/minimatch chain. No forced dependency downgrade was applied.
