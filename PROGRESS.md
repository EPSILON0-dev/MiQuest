# Progress

## Tree drafts and on-demand loading — 2026-11-15

- Tree edits are staged in one in-memory draft with Save/Discard and navigation protection. Saves use a single revision-checked backend transaction; failures preserve the draft, while conflicts require discard and reload. Pins, verification, and workspace management remain immediate after resolving a draft.
- Navigation loads project/tree metadata first, then caches each opened page graph. Quest verification history is paginated and cached only when that quest is opened. Shared memberships, cross-tree links, and unloaded-tree deletion use focused reads. WebSocket invalidation and persistent drafts remain deferred.
- Validation: backend pytest 51 passed (outside sandbox because the HTTP portal hangs inside it); backend Ruff and strict Pyright passed. Frontend build, lint, and 26 unit tests passed. Playwright passed 22 Chromium tests, plus a separately run navigation Save/failure/retry test; local server binding required running outside the sandbox. Desktop and narrow draft screenshots were captured and inspected. Vite retains its existing chunk-size advisory.
- The initial full browser run identified three tests with obsolete autosave expectations; those were updated for explicit Save and passed in the final suite. A focused review found and fixed dependency ordering, stale membership merging, identifier remapping, remote quest status, and the history/override race.

## Current state — 2026-11-14, integration

## Frontend internationalization — 2026-11-14

- Added complete English and Polish UI language packs with compile-time key parity, a persistent sidebar language selector, and `lang` metadata updates.
- All application chrome, forms, editor validation, confirmations, and accessible labels use the selected pack; project and quest content remains unchanged user data.
- Validation: frontend build, lint, and 19 unit tests passed; Playwright passed all 17 Chromium tests, including locale switch and reload persistence. Desktop and narrow screenshot captures were refreshed and inspected.

The user explicitly approved the UI prototype and authorized frontend integration and manual prefill. Work is on `feat/integration` from merged `main`. MCP and deployment remain deferred.

The frontend loads persisted project graphs and verification history from the REST API, saves the existing editing and pin flows, reloads after revision conflicts, and offers retry if the backend is unavailable. A multi-step edit may have saved earlier steps when a later request fails; the UI reloads and reports this. Vite proxies API requests to the local backend. `python -m miquest.runtime prefill` populates an empty migrated database atomically with both example graphs and coherent verification history, and refuses populated databases.

Validation so far: backend pytest 48 passed; Ruff and strict Pyright passed; frontend build and 18 unit tests passed; frontend lint passed. The prefill CLI was run on a migrated database and a second invocation was rejected. Desktop and narrow browser screenshots were captured and inspected. Playwright passed all 16 Chromium tests against an isolated backend, including persisted edits, conflict recovery, retry, and the empty workspace. Integration PR: https://github.com/EPSILON0-dev/MiQuest/pull/4 (open, unmerged).

## CI workflow separation — 2026-11-14

Frontend CI runs lint, build, and unit tests; Backend CI runs Python checks; Integration CI runs Playwright against both services when either changes. The integration environment installs backend runtime dependencies without the development extra. The 16 Playwright tests passed using a fresh runtime-only environment; all three workflow YAML files parsed successfully.

## CI trigger change — 2026-11-14

All three CI workflows run on pull requests and on pushes to `main` only. Existing path filters remain in place. Validation: parsed all three workflow files and checked their push branch, pull request, and path filters.

## Development runner — 2026-11-14

Added root Make targets for setup, explicit migration and prefill, development servers, and tests. The launcher stops both process groups on Ctrl+C or if either server exits. The default database directory is ignored by Git; frontend changes reload automatically, while backend changes require restarting the launcher.

Validation: system GNU Make `make setup`, migration and prefill against a temporary database, repeated-prefill refusal, and live proxy/startup/Ctrl+C shutdown all passed. `make test` passed 2 launcher, 48 backend, 18 frontend, and 16 Chromium browser tests. Ruff passed on the launcher scripts.

## Earlier state — 2026-11-14

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
