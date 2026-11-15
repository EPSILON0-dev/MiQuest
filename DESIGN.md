# MiQuest: Web Application Design and Agent Implementation Specification

**Status:** Redesign requirements agreed on 2026-11-13; the user explicitly approved the UI prototype and frontend integration on 2026-11-14. See [ROADMAP.md](ROADMAP.md) and [PROGRESS.md](PROGRESS.md) for current status.
**Primary goal:** A beautiful, self-hosted, single-user quest graph that helps resume and advance long-running projects.  
**Non-goal:** A general-purpose project-management suite.

**v1 success:** After weeks away, the owner can open a project, see what is ready, understand the next quest, and give an external agent enough context to advance it.

**Terminology:** Project and progression mean the same thing. Each project owns one dependency graph; pages/trees are views containing selected quests from that graph.

## 1. Product principles

1. **UI first.** Build a static, interactive frontend with realistic fixture data. The user explicitly approved the UI prototype and frontend integration.
2. **Graph is the product.** The default view is a large, readable dependency graph, not a table of tasks.
3. **Keep it small.** One frontend, one Python backend, one SQLite database. No Redis, queues, Kubernetes, hosted LLM API, or multi-user features.
4. **External agents provide intelligence.** MiQuest exposes controlled data and mutations; it does not run its own LLM. REST supports agent verdicts.
5. **Evidence before completion.** Normal completion is performed by an external agent submitting a reasoned verdict with evidence. Manual overrides are conspicuous and audited.
6. **Unattended after approval.** Backend work is test-driven and should require minimal user involvement.

## 2. Scope

### Required for v1

- Multiple independent projects, each with a directed acyclic graph (DAG) of quests and multiple pages/trees.
- Shared quests across pages within a project: one identity, description, completion state, and verification history; separate position per page.
- A home tree per quest, cross-tree navigation with quest highlighting, and manually ordered progression-wide pins.
- Dense icon-only graph nodes: standard quests are 52px circles; only quests explicitly typed `quest.milestone` are 72px diamonds. Pan, zoom, fit-to-view, selection, and draggable positions.
- UI editing: create, edit, delete quests; create/remove dependency edges; edit quest descriptions and acceptance criteria.
- Dependency validation, including no self-dependency, no cross-project edge, and no cycles.
- Quest details modal showing description, prerequisites, next quests, acceptance criteria, verification history, and evidence.
- Manual and REST editing of projects, pages, quests, dependencies, icons, positions, home trees, and pins.
- SQLite persistence and database migrations.
- Verification states and immutable verification records.
- Manual completion override with a typed reason and visual distinction from agent-verified completion.
- Containerized self-hosted deployment with persistent data, health check, and documented backup procedure.
- Automated tests for backend and critical frontend flows.

### Explicitly excluded from v1

- Accounts, teams, roles, notifications, calendar, time tracking, gamification points, GitHub integration, automatic repository scanning, embedded AI chat, model hosting, autonomous background verification, OR dependencies, cross-project edges, and mobile-native apps.
- Elaborate workflow engines, microservices, task queues, complex authorization frameworks, specialized automatic winding/radial layout algorithms, pixel styling, and automatic next-task ranking.
- Uploads are excluded entirely, including quest icons and artwork. Use one bundled icon library.
- Embedded agent chat and harness integration are deferred beyond v1.

## 3. Stack

| Area | Choice | Notes |
|---|---|---|
| Frontend | React + TypeScript + Vite | Static assets built for deployment |
| Styling | Tailwind CSS + shadcn/ui | Use a restrained, coherent visual system; avoid generic dashboard clutter |
| Graph | React Flow (`@xyflow/react`) | Custom quest nodes, handles, selection, drag, pan/zoom |
| Layout | Dagre or ELK.js | Automatic layout on demand, not on every render; preserve manual positions |
| Backend | Python 3.12+ + FastAPI | REST API and shared domain services |
| Database | SQLite + SQLAlchemy 2.x + Alembic | WAL mode, foreign keys, busy timeout, persistent local volume |
| Backend tests | pytest | SQLite temporary database per test |
| Frontend tests | Vitest + React Testing Library | State, components, interactions |
| E2E tests | Playwright | Browser interactions, screenshots, smoke tests |
| Deployment | Docker Compose | Single app service preferred; frontend can be served by same deployment |

## 4. Authentication and deployment boundary

MiQuest is intended for one owner on a private tailnet.

- **v1:** No built-in user accounts. Bind the app to loopback on the host and publish browser access through **Tailscale Serve**, restricted by tailnet access controls. The application must not be directly internet-facing.
- Browser access is controlled at the network/reverse-proxy boundary. Document that this is *network-level access control*, not app-level identity or per-user authorization.
- No arbitrary shell command execution, user-supplied file execution, or fetching arbitrary URLs from evidence references in v1.
- Container runs as non-root; mount only the database/data directory as writable; no privileged container or Docker socket access.
- Keep SQLite on local storage, not NFS/SMB; back it up with the SQLite backup API or a consistent snapshot.

## 5. UI specification: FIRST MILESTONE

### Desired feel

A polished, dark, graph-centric interface inspired by FTB Minecraft mod quest trees, but without game-themed visual noise. It should look like a deliberate, high-quality tool, not a generic AI-generated SaaS dashboard. Prioritize typography, spacing, graph legibility, restrained accent colors, and meaningful status cues.

### Visual system and tree composition

- Use shadcn/ui controls and centralized semantic CSS custom properties in the root stylesheet as the theme switchboard for colors, borders, radii, and shared visual settings.
- Use a provisional charcoal/neutral palette through centralized semantic CSS variables. Do not add pixel styling.
- Use one bundled icon library, with stable icon names for agents, a default icon, and a searchable manual picker. No uploads.
- Quest nodes are dense and icon-only: 52px circles for ordinary quests, 72px diamonds only for explicit `quest.milestone` quests. Never add permanent node labels.
- Linear quest chains can wind manually; radial arrangements may place a central milestone with prerequisite goals outward. Provide a basic automatic layout for editing only; specialized automatic composition is not required.

### Main layout

- **Left sidebar:** collapsible projects/progressions revealing their pages/trees. Settings at the bottom; no account controls.
- **Top bar:** compact 44px toolbar with current progression/tree and a global Edit mode switch (initially off). Creation and Auto layout controls appear only in Edit mode. Fit view sits at the lower-left of the canvas.
- **Main canvas:** active tree occupies most of the viewport; understated background; directional dependency edges; smooth pan/zoom; selected node emphasized.
- **Pinned quests:** manually ordered quest-title shortcuts in a collapsible top-right panel, initially closed, with a pin icon and count. Pins are progression-wide, including quests on other pages; clicking opens the quest on its home tree. Normal mode supports pin/unpin, drag reordering, and keyboard reordering; pins add no separate task-management behavior.
- **Quest details:** modal over the tree with a blurred background. Title bar contains Back, icon, title, and pin control. Back closes the modal, removes the blur, and restores the tree view.
- **Modal content:** two upper columns show prerequisites and What's next as navigable icons; description and acceptance criteria follow below. Verification history/evidence is expandable, with agent verification and human override clearly distinguished.
- **Edit mode:** one global switch, initially off and reset to off on reload. When on, it reveals all CRUD actions, override controls, layout actions, dependency handles, and enables node dragging. Normal mode keeps the graph navigable and supports pin/unpin, keyboard pin reorder, and quest inspection.
- **Hover/focus tooltip:** a large dark rectangular tooltip shows only title, description, and status. Descriptions longer than 320 characters are truncated with a “Click to read more” affordance. Click, Enter, or one tap opens the full modal.
- **Cross-tree links:** a dependency absent from the current page shows a link to its home tree. Clicking opens that tree and briefly highlights/pings the quest. The modal lists all prerequisites and next quests, including those on other pages.
- **Narrow screens:** left navigation becomes a drawer, pins become a compact expandable list, and the modal fills the screen. The graph remains pannable.
- **View restoration:** localStorage remembers the last progression/tree and each tree's canvas size and pan/zoom, preserving the same centered view across desktop and phone. Accept legacy x/y/zoom records. Reopening restores the view with Edit mode off and the modal closed. Missing/deleted saved targets fall back to an available tree or the empty state.
- **Empty state:** clear calls to create a project, tree, or first quest as appropriate.
- No oversized canvas heading, subtitle, progress strip, bottom bar/legend, sidebar slogan, or right-hand chat sidebar in v1.

### Node design

- Icon-only quest node at the defined 52px/72px size; title and details are available through tooltip and modal.
- Completed quests retain a green outline and check even when relocked, with a separate lock badge. Manual override uses a distinct shield cue. Active quests use a bright outline and dot; other locked quests are subdued.
- Small prerequisite/verification indicator where helpful.
- Connections show prerequisite -> dependent direction consistently.
- Accessible contrast; do not rely on color alone for status.
- Layout supports tens to a few hundred quests without unreadable overlap.

### Editing interactions

- Click, Enter, or one touch on a quest opens its modal; Back or Escape closes it. Keep focus within the modal while open and return focus to the originating control when closed. Hover/focus exposes the tooltip.
- Global Edit mode exposes creation, rename/deletion, override, layout, dependency handles, and node drag. The initial page is the quest's home tree; it can be changed to another page containing that quest. Normal mode still supports pin/unpin and drag/keyboard pin reorder.
- The UI supports the core editing workflow. Completion remains governed by verification/override rules.
- Separate “Remove from this page” from “Delete quest everywhere.” Global deletion requires confirmation and removes dependency links.
- Every quest must appear on at least one page. Removing its last appearance requires moving it to another page or explicitly deleting it. Page deletion preserves quests by moving those with no other appearances, or explicitly deleting them with confirmation. Reassign a home tree when its appearance is removed.
- Create a quest from top-bar action or canvas context menu.
- Create/remove dependency via visible controls or connect handles.
- Drag nodes to position manually; auto-layout button can reorganize on demand.
- Confirm destructive deletion; display errors for cycle/invalid-edge attempts.
- Undo/redo is optional for v1, not a blocker.
- Keep editor forms simple and keyboard accessible.

### Static prototype requirements

- Implement the Phase A React prototype using hard-coded fixture data only. The separately authorized backend remains disconnected until UI approval.
- Fixtures include at least two projects, a branching graph with 12–20 quests, mixed states, a blocked branch, and completed quests. Include multiple pages, a shared explicit `quest.milestone`, a cross-tree prerequisite link, pins, and a historically verified quest with currently unsatisfied prerequisites. Include dense manual winding and radial compositions; basic auto-layout is for editing only.
- All visual interactions work locally in frontend state, including page/shared-quest editing and edge creation. Fixture edits need not survive reload; localStorage view restoration is required. Verification displays and override forms use fixtures/local state only in Phase A.
- Provide a repeatable local launch command and Playwright screenshot capture at desktop viewport (e.g. 1440x900) and narrow viewport (e.g. 390x844).
- Agent should inspect screenshots and fix obvious layout issues before requesting review.
- **Stop and request explicit UI approval.** Do not interpret silence or passing tests as approval. UI iteration is interactive and may take multiple rounds.

## 6. Data model

Use integer or UUID identifiers consistently. Suggested entities:

**Project:** `id`, `name`, `description`, `created_at`, `updated_at`.

**Page/tree:** `id`, `project_id`, `name`, timestamps.

**Quest appearance:** `page_id`, `quest_id`, `position_x`, `position_y`, unique per page/quest. Both must belong to the same project. Every quest has at least one appearance.

**Pin:** `project_id`, `quest_id`, `sort_order`, unique per project/quest; quest must belong to that project.

**Quest:** `id`, `project_id`, `title`, `description`, `acceptance_criteria` (plain text or structured list), required `milestone` boolean (future suggested model field; only true quests render as diamonds), `work_state` (`not_started`, `in_progress`, `blocked`), `completion_state` (`none`, `verified`, `overridden`), `icon_name`, `home_page_id`, timestamps. The home page must contain an appearance of the quest. Shared appearances do not duplicate quest content or verification state.

**Dependency:** `quest_id` (dependent), `depends_on_quest_id` (prerequisite), composite unique key. Both quests must belong to the same project.

**Verification:** `id`, `quest_id`, `verdict` (`pass`, `fail`, `inconclusive`, `override`), `evidence` (text and/or references), `reasoning`, `actor` (`agent` or `human`), `created_at`. Treat records as append-only.

Keep current state derivable from the latest relevant verification event, or update a cached completion state transactionally. Do not allow an arbitrary status update to masquerade as a successful verification.

**Availability:** A quest is unlocked when every prerequisite has completion state `verified` or `overridden`. If not unlocked, it is shown as locked regardless of work state. Reopening a prerequisite should relock dependent quests; do not automatically erase their prior verification history. Retain the verification badge/history while also showing unsatisfied prerequisites. Clearly distinguish *currently blocked by prerequisites* from *historically verified*. A new verification pass still requires satisfied prerequisites.

## 7. API

Implement core business logic in Python services, with REST as the API adapter.

### REST operations

- List/create/update/delete projects.
- List/create/read/update/delete quests.
- List/create/update/delete pages; manage quest appearances and their positions, home trees, and ordered pins. Enforce page-membership and deletion rules transactionally.
- Add/remove dependencies.
- Read page/tree views and cross-tree references as well as the full project graph.
- Read project graph with nodes, edges, and derived availability.
- Read verification history and create manual override.
- Submit agent verification through the controlled REST endpoint. The actor label represents the entry point, not an authenticated identity.

### Verification rules

- The external agent reads acceptance criteria and evaluates evidence **outside** MiQuest.
- A `pass` requires nonempty evidence and reasoning, and all prerequisites satisfied. A `fail` or `inconclusive` records its reasoning without marking completion.
- The application does not claim to independently validate the LLM's judgment. Record provenance and show it in the UI.
- Manual override requires a human-entered reason and a confirmation step; mark as `overridden`, never `verified`.
- Support reopening a quest with an auditable event, including when previously verified or overridden.
- Never allow a generic `update_quest` call to directly set `verified` or `overridden`.

## 8. Agent implementation workflow

### Phase A: UI prototype (interactive)

1. Scaffold frontend and install graph/UI libraries.
2. Implement polished static trees, navigation, and quest modal using fixtures.
3. Add local-only graph editing interactions.
4. Add component tests and browser smoke tests.
5. Capture and inspect screenshots; provide the user with launch instructions and screenshots.
6. **STOP. Wait for explicit user approval.** Iterate until approved.

### Phase B: Backend (unattended, TDD)

The backend was separately authorized, and the UI prototype and integration were explicitly approved.

1. Add pytest fixtures and failing tests for database constraints and domain behavior.
2. Implement SQLAlchemy models, Alembic migration, and services until tests pass.
3. Add failing REST integration tests, implement endpoints, then connect the approved UI.
4. Add failing verification-state tests, then implement verification and override flows.
5. Add Playwright E2E tests for project creation, quest editing, dependency validation, and verification display.
6. Add Docker deployment, health check, persistence, and backup documentation.
7. Run clean build/test/lint and report results with remaining limitations.

**Red -> green -> refactor** is mandatory for backend domain behavior. Tests must fail for the intended reason before implementing each feature. Do not delete, skip, or weaken tests merely to achieve green status.

### Autonomy and checkpoints

- Agent may choose routine implementation details and fix test failures without asking.
- Agent may run builds, tests, linters, local containers, and make milestone commits.
- Agent must not modify the approved UI design substantially without asking.
- Backend implementation was explicitly authorized; do not connect the UI or begin deployment before explicit UI approval.
- Maintain `PROGRESS.md` with completed work, test commands, current blocker, and next steps so a fresh agent session can resume.
- Do not claim completion until all required tests pass; report blocked tasks honestly.

## 9. Engineering standards

### Python

- Type annotations for public interfaces; use Pydantic for boundary schemas.
- Prefer small services, explicit dependencies, and SQLAlchemy 2.x patterns.
- Use `ruff` for lint/format and `mypy` or `pyright` for meaningful type checking.
- Avoid unnecessary abstraction, plugin frameworks, and dependency injection containers.
- Database sessions scoped per operation/request; enforce transactions and foreign keys.

### TypeScript/React

- Strict TypeScript, no unjustified `any`, typed graph node/edge data.
- Functional components, focused hooks, no global mutable state.
- Avoid premature state-management libraries; local React state/context is sufficient until proven otherwise.
- ESLint and Prettier; accessibility checks for controls and keyboard interactions.
- Do not invent a custom graph engine when React Flow already provides the behavior.

### Tests and CI

- pytest for domain/database/API; Vitest for frontend logic; Playwright for E2E and screenshots.
- Tests for persistence after restart, cycle detection across pages, cross-project edge rejection, dependency unlock/relock with historical verification retained, evidence requirements, and override audit.
- Cover shared quest state with separate page positions, home-tree navigation/highlighting, page membership/deletion safeguards, pins, modal close/focus behavior, and localStorage view restoration.
- Run checks on every milestone and in CI. Maintain deterministic fixtures and avoid external network dependencies in tests.
- No fabricated test results or unverified claims that the app works.

## 10. Acceptance criteria

### UI approval gate

- The user can launch a static web app and inspect a convincing quest graph.
- Node and edge editing works in memory through global Edit mode; icon-only nodes, tooltips, status cues, and quest modal match this specification.
- Quest modal is usable and visually coherent, blurs the tree behind it, and restores the tree when closed.
- Shared quests, page navigation, cross-tree links/highlighting, pins, icons, and localStorage view restoration work with fixtures.
- Desktop and narrow layouts do not have major clipping or broken controls.
- Screenshots and a short usage walkthrough are provided.
- **User explicitly approves the UI.**

### Final v1

- UI connects to persisted projects, pages, shared quests, appearances, pins, and dependency graphs; state survives app/container restart.
- Manual and REST editing preserve shared quest identity, home-tree validity, and at least one page appearance per quest.
- Cyclic, self-referential, and cross-project dependencies are rejected.
- Unlocking follows prerequisites; verification history is visible.
- Agent `pass` requires evidence/reasoning and is recorded with provenance.
- Manual override is visibly distinct and audited.
- Docker Compose starts the app with persistent SQLite storage; Tailscale-only deployment instructions are documented.
- Automated tests and linters pass from a clean checkout.

## 11. Suggested repository structure

```text
miquest/
├── DESIGN.md
├── AGENTS.md
├── PROGRESS.md
├── frontend/
│   ├── src/
│   └── tests/
├── backend/
│   ├── miquest/
│   │   ├── api/
│   │   ├── core/
│   │   └── db/
│   ├── migrations/
│   └── tests/
├── e2e/
├── compose.yaml
└── README.md
```

## 12. Instruction to the coding agent

> Implement MiQuest according to this document and the current roadmap. The UI prototype and integration were explicitly approved, and backend implementation was separately authorized. Use strict TDD, automated tests, and minimal interruptions. Keep the architecture small, report actual test results, and do not add features outside this specification.
