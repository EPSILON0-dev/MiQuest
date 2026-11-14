# Progress

## Current state — 2026-11-14

The user separately authorized the backend and test suite, while asking to skip MCP for now. Backend implementation is in [PR #2](https://github.com/EPSILON0-dev/MiQuest/pull/2), branch `feat/backend`, open and unmerged. The frontend remains a fixture prototype from [PR #1](https://github.com/EPSILON0-dev/MiQuest/pull/1), merged on 2026-11-13; explicit UI approval is still pending. Wait for that approval before connecting the frontend or deployment.

The user rejected the first card-based visual direction and confirmed a redesign through a design interview; that design approval is not approval of the finished UI.

## Completed redesign

- Replaced quest cards with icon-only 52px circles and explicit 72px milestone diamonds. The milestone editor field is shared across appearances.
- Added substantial dark hover/focus tooltips with title, description, and status only. Descriptions over 320 characters truncate with a read-more hint; full text remains in the modal. Touch opens the modal directly.
- Completed quests use green outlines/checkmarks; locked history retains them with a separate lock badge. Human overrides also display a shield. Active and blocked work have distinct indicators.
- Reworked fixture positions into compact winding paths and inward milestone branches; four cardinal handles keep straight edges attached as quests move. Basic Dagre layout remains on demand.
- Removed oversized canvas heading/subtitle/progress, footer/legend/hint bar, sidebar slogan, gradients, and purple palette. Provisional charcoal colors and shared visual settings are centralized in the root stylesheet.
- Added a global Edit mode switch, initially off and reset on reload. It gates all CRUD, content editing, overrides/reopens, layout, dependency controls, and node dragging while remaining active across tree navigation.
- Pins are a collapsed icon/count button by default. Expanded titles support native drag reordering and keyboard-accessible move buttons in normal mode; pin/unpin remains available in the modal.
- Modal follows the references: compact title/icon/Back/pin bar, prerequisites and What's next icon sections above description/acceptance criteria, then expandable history. Preserved blurred background and focus trapping/return.
- Saved viewports include canvas dimensions so restoration preserves the viewed graph center across desktop/phone sizes. Older x/y/zoom-only records still load.
- Preserved fixture/local-state project/tree/quest editing, shared identity, independent positions, cross-tree home navigation/highlighting, graph validation, and deletion/orphan safeguards. No backend or new dependencies were added.

## Actual validation

Run from `frontend/` on the current redesign:

- `npm run build`: passed strict TypeScript and production build. Vite reports a ~606 kB JavaScript chunk (~194 kB gzip), above its 500 kB advisory threshold.
- `npm run lint`: passed with no warnings.
- `npm test`: 14 tests passed across three unit/component files, including milestone editing and viewport restoration across canvas sizes.
- `npm run test:e2e`: 13 Chromium tests passed. Covers icon shapes/accessibility, tooltip content/truncation/focus, touch direct-open, edit-mode gating/reset, pin drag/keyboard reorder in normal mode, node drag, shared edits, memberships/home/positions, cycle rejection, project/tree creation, orphan/duplicate-name tree deletion, overrides/reopens/history, responsive views, modal focus/Escape.
- Captured and inspected five screenshots: `docs/screenshots/desktop.png`, `tooltip.png`, `desktop-journal.png`, `narrow.png`, and `narrow-journal.png` at 1440×900 / 390×844.
- Focused read-only review found no remaining gating, pin keyboard, or viewport defect. Integration checks found and fixed React Flow pointer-event handling in normal mode, its default canvas background, and tooltip Escape consuming the modal shortcut.
- Fixed a browser test's zoom wait to compare against the actual previous zoom before reading the saved viewport; the earlier fixed threshold could pass before the animation finished.

The earlier dependency audit reported seven moderate findings in the development-only TypeScript ESLint/minimatch chain. No dependencies changed during the redesign and no forced downgrade was applied.

## Publication / next step

- Redesign commit `9533b5d` was included in PR #1, merged on 2026-11-13. Both GitHub Actions runs passed, including clean install, lint, build, unit/browser tests, and screenshot upload: https://github.com/EPSILON0-dev/MiQuest/actions/runs/43440368682 and https://github.com/EPSILON0-dev/MiQuest/actions/runs/43440354993.
- User reviews the live prototype/screenshots and explicitly approves the UI or requests further iteration.
- Final palette remains undecided. Backend REST, SQLite, and verification are implemented in PR #2; MCP is deferred, and UI integration and deployment remain outstanding.

## Earlier milestones

- `5e7b29a`: initial documentation and private repository publication.
- `9409636`: original interactive prototype (visual design superseded by this redesign).
- `c7cf82c`: original progress/PR record. Original CI passed: https://github.com/EPSILON0-dev/MiQuest/actions/runs/43434429272.

Limits: fixture edits reset after reload; only view context persists. Chromium desktop and emulated touch/narrow checks were run, not physical-device or cross-browser validation. Backend persistence/security checks are outside Phase A.

## Backend design artifacts — 2026-11-14

- Added proposed OpenAPI 3.1 contract with a Redoc HTML viewer and a DBML database diagram with browser viewing instructions in `docs/backend/`.
- Validation: JSON parsed, local references resolved, and Redocly CLI validated the OpenAPI with three advisory warnings (license and 4xx responses on health probes). DBML CLI parsed the diagram and generated SQL. Browser rendering remains unverified. These are design documents; Phase A UI approval remains pending.

## Backend implementation — 2026-11-14

- Added backend CI for pushes and pull requests touching the backend or its workflow. It installs locked dependencies on Python 3.12 and runs Ruff, strict Pyright, and pytest. Local validation on Python 3.14: Ruff and Pyright passed; 47 tests passed.
- Backend implementation is committed on `feat/backend` and open for review in [PR #2](https://github.com/EPSILON0-dev/MiQuest/pull/2). The user explicitly requested the backend and test suite, then excluded MCP; that does not approve the Phase A UI.
- Added a FastAPI REST adapter, including controlled agent verdict submission, typed request validation, SQLite/SQLAlchemy domain services and Alembic migration, plus strict Pyright configuration and a pre-commit hook. The frontend still uses fixtures; no MCP server has been added.
- Validation: 47 backend tests passed on Python 3.12.13 and 3.14.10; Ruff and the strict Pyright pre-commit hook passed. Tests cover REST operations, agent verification, migration rollback, shared membership, cycle races, revision conflicts and response snapshots. A built wheel initialized a database and loaded the API contract; a live loopback server returned `200 {"status":"ok"}` from `/readyz`. HTTP tests required running outside this sandbox because its thread portal hangs.
- The first domain tests were written before implementation, but their initial run could not reach their intended assertions because dependencies were unavailable. Later fixes used observed red-to-green tests; the initial domain work therefore does not fully meet the requested TDD evidence.
- Type checking covers all backend Python modules and tests in strict Pyright mode. Dynamic REST operation dispatch and JSON decoding require explicit casts; individual dispatched signatures are verified by integration tests rather than by the type checker.
