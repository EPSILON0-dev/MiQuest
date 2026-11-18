# Progress

## Current status — 2026-11-18

- The approved frontend, backend, verification pipeline, English and Polish interface, and single-container deployment are implemented. Verification pipeline [PR #12](https://github.com/EPSILON0-dev/MiQuest/pull/12) and review retry/settings [PR #13](https://github.com/EPSILON0-dev/MiQuest/pull/13) are merged.
- Docker Compose startup, persistence, and backup/restore passed the checks below. The user confirms Tailscale access works on their server. Backend, frontend, and integration CI passed for PR #13; the user accepts passing CI as evidence for automated tests. Live OpenRouter text and image reviews passed the checks below. Final acceptance remains open.
- Earlier entries are historical snapshots: references to pending approval, open PRs, and deferred deployment describe their status at the time, not the current state.

## Live OpenRouter verification — 2026-11-18

- Ran two synthetic text-only reviews through the real MiQuest review pipeline and OpenRouter using `z-ai/glm-5.3-flash`, each in an isolated migrated database. The passing review created a verification record and marked its quest verified; the failing review created a record and left its quest incomplete. Neither touched existing project data.
- Both requests completed using provider InferenceNet. OpenRouter reported costs of $0.000063446 and $0.000083102.
- Submitted a synthetic PNG through the multipart review API in an isolated database. The model identified its red circle and blue square, returned a passing verdict, and the retained image downloaded as a valid JPEG. Provider Wafer reported a cost of $0.000020422. The browser submission workflow and other models were not tested live.

## Docker Compose validation — 2026-11-18

- Built and started the current branch with Docker Compose in an isolated project. The container became healthy, served the frontend and readiness endpoint on loopback, and ran as UID 10001. A project created through the API survived a Compose restart.
- Stopped the container, copied its data using the documented backup command, and restored it into a fresh Compose volume with ownership preserved. The restored application returned the project through the API. Both disposable containers and volumes were removed.
- The frontend build retained its existing bundle-size advisory. Tailscale access and a live OpenRouter review were not tested.

## Single-container deployment — 2026-11-17

Added frontend and backend Dockerfiles and a one-service Compose configuration. The backend image builds static frontend assets and runs nginx and the API as UID 10001, migrates the persistent data volume at startup, and publishes nginx on loopback. The README documents private access and backups.

Validation: Docker image build passed, including the frontend production build (existing bundle-size advisory). The first container failed because nginx temp paths were not writable; configured all nginx temp paths under /tmp and rebuilt. The replacement ran as UID 10001, reached healthy status, served the frontend and readiness endpoint, accepted a same-origin API write, and retained the project across restart. The test container was removed. Docker Compose and desktop/narrow screenshots were not tested; the Compose plugin is not installed.

## Backend CI contract fix — 2026-11-18

- Synchronized the documented OpenAPI contract with the packaged review-retry description. Backend CI had failed the existing contract-equality test.
- Validation: backend pytest passed (102 tests), Ruff passed, and strict Pyright reported no errors. No UI behavior changed.

## Review retry and settings — 2026-11-17

- Kept unsuccessful review attempts immediately retryable in the open quest dialog; verified and overridden quests must be reopened before another OpenRouter review. The backend enforces this while retaining review and verification history.
- Moved language, API key, model, and thinking effort to an always-available Settings dialog. Workspace management remains in Edit mode. The model selector filters the catalog by name or ID.
- Validation: 102 backend tests passed, including a red-to-green domain test for the reopen rule; Ruff and strict Pyright passed. Frontend build and 38 unit tests passed. ESLint reported its existing `page` effect dependency warning. All 44 browser tests passed. Desktop (1440×900) and narrow (390×844) settings screenshots were inspected.
- The production build retains Vite's existing large-chunk advisory. Browser tests use mocked OpenRouter responses; a live provider was not contacted.

## Message-only verification — 2026-11-16

- Made it explicit in English and Polish that attachments are optional. The API and UI already accepted a nonempty message without files; strengthened the backend regression test to confirm that message reaches the mocked reviewer prompt.
- Validation: message-only backend test passed, frontend unit suite passed (36), and the message-only browser flow passed. Provider calls remained mocked.

## Verification pipeline — 2026-11-16

- Added user-triggered OpenRouter verification, private settings, streamed and validated evidence, durable runs, review locks, startup recovery, status events, and localized submission/history controls. The user clarified that the finished app should use the real adapter while all tests mock OpenRouter; no live provider calls have been made.
- Validation: 101 backend tests passed; Ruff and strict Pyright passed. Frontend build and 36 unit tests passed; lint reports the existing hook dependency warning and the build reports its existing chunk-size advisory. The full browser run passed 42/43; the remaining assertion matched both the review-run list and immutable verification history. After scoping it to the review-run list, all three verification browser tests passed; the other 40 browser tests passed in the full run. Desktop and narrow screenshots were inspected.
- The real adapter and model capability discovery are exercised only through fake HTTP responses, including usage, a successful decision, and errors. Both pytest and Playwright fail on unmocked provider calls. No live OpenRouter calls were made; live provider compatibility remains unverified by request.
- Draft PR: [#12](https://github.com/EPSILON0-dev/MiQuest/pull/12), unmerged.

## Sidebar footer — 2026-11-15

- Grouped language, import, and workspace controls at the bottom of the sidebar and allowed the project list to scroll. Included the pending HTML title change to `MiQuest`.
- Validation: frontend build and the desktop/narrow sidebar browser test passed; both screenshots were inspected. Frontend lint passed with the existing hook dependency warning. The build retains its large-bundle advisory.

## Modal and workspace settings — 2026-11-15

- Replaced modal Back controls with a top-right close button, retaining quest history and keyboard focus behavior. Grouped trees under collapsible projects in workspace settings, with the current project expanded by default and tree creation under each project.
- Validation: frontend build and 29 unit tests passed; lint passed with the existing hook dependency warning. Desktop and narrow settings screenshots were captured and inspected. The full browser run passed 38 of 39 tests; after fixing initial close-button focus, both focused keyboard/Escape tests passed on rerun.

## JSON project import — 2026-11-15

- Added a JSON file picker with server validation, a summary and confirmation. Each import creates a separate project in one transaction, starts quests incomplete, and drafts page positions from dependencies. The repository skill includes the versioned schema and an example.
- Validation: 53 backend tests passed, including invalid graphs and rollback after a mid-import failure; Ruff passed. Frontend unit tests passed (29), the build passed, and the import browser test passed at desktop and narrow widths; screenshots were inspected. Frontend lint passed with one existing hook dependency warning. The build retains the existing large-bundle advisory.

## Documentation scope change — 2026-11-15

- Removed the planned agent integration from the design, roadmap, API descriptions, and project documentation. The importer design will be decided separately.
- Validation: checked documentation references, parsed and compared both API contract copies, and checked the diff for whitespace errors. No application behavior changed.

## Browser ID compatibility — 2026-11-15

- Replaced secure-context-only `crypto.randomUUID()` calls with IDs generated by `crypto.getRandomValues()`, including history session and draft item IDs. This allows development over non-localhost HTTP.
- Validation: frontend lint, build, and 29 unit tests passed. A Chromium test removed `randomUUID`, loaded a tree, created a quest, saved it, and verified persistence; it passed using an isolated test port. No visual controls changed.

## Browser history and breadcrumb — 2026-11-15

- Added hash URLs for projects, trees, and quest details, including direct links, browser Back/Forward, modal Back, missing-target fallback, and restoration of empty projects. Cross-tree quest links retain their tree-and-highlight behavior.
- Tree changes and leaving Edit mode confirm before discarding an unsaved draft; same-tree quest navigation preserves it. Reload and leaving the app retain the browser's native unsaved-changes warning. Navigation waits for in-flight saves, and temporary IDs in earlier history entries resolve after saving.
- Disabled text selection for the project/tree breadcrumb. Frontend lint, production build, and 29 unit tests passed. Playwright passed 35 Chromium tests in the full run plus one separately run direct-link cancellation regression; local servers required execution outside the sandbox. Desktop and narrow screenshots were inspected. Vite retains its chunk-size advisory.
- A first browser run found duplicate modal-close events that could navigate Back twice; the fix and edit-mode draft protection passed subsequent tests. Integration CI exposed an obsolete reload expectation; the test now checks that the URL restores the quest modal. Browser-history coverage includes direct links, invalid targets, reload, cancelled Back and Forward, save in flight, temporary IDs, and empty projects.

## Tree drafts and on-demand loading — 2026-11-15

- Tree edits are staged in one in-memory draft with Save/Discard and navigation protection. Saves use a single revision-checked backend transaction; failures preserve the draft, while conflicts require discard and reload. Pins, verification, and workspace management remain immediate after resolving a draft.
- Navigation loads project/tree metadata first, then caches each opened page graph. Quest verification history is paginated and cached only when that quest is opened. Shared memberships, cross-tree links, and unloaded-tree deletion use focused reads. WebSocket invalidation and persistent drafts remain deferred.
- Validation: backend pytest 51 passed (outside sandbox because the HTTP portal hangs inside it); backend Ruff and strict Pyright passed. Frontend build, lint, and 26 unit tests passed. Playwright passed 22 Chromium tests, plus a separately run navigation Save/failure/retry test; local server binding required running outside the sandbox. Desktop and narrow draft screenshots were captured and inspected. Vite retains its existing chunk-size advisory.
- The initial full browser run identified three tests with obsolete autosave expectations; those were updated for explicit Save and passed in the final suite. A focused review found and fixed dependency ordering, stale membership merging, identifier remapping, remote quest status, and the history/override race.

## Integration milestone — 2026-11-14 (historical)

## Frontend internationalization — 2026-11-14

- Added complete English and Polish UI language packs with compile-time key parity, a persistent sidebar language selector, and `lang` metadata updates.
- All application chrome, forms, editor validation, confirmations, and accessible labels use the selected pack; project and quest content remains unchanged user data.
- Validation: frontend build, lint, and 19 unit tests passed; Playwright passed all 17 Chromium tests, including locale switch and reload persistence. Desktop and narrow screenshot captures were refreshed and inspected.

The user explicitly approved the UI prototype and authorized frontend integration and manual prefill. Work is on `feat/integration` from merged `main`. Deployment remains deferred.

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

The user separately authorized the backend and test suite. Backend implementation is in [PR #2](https://github.com/EPSILON0-dev/MiQuest/pull/2), branch `feat/backend`, open and unmerged. The frontend remains a fixture prototype from [PR #1](https://github.com/EPSILON0-dev/MiQuest/pull/1), merged on 2026-11-13; explicit UI approval is still pending. Wait for that approval before connecting the frontend or deployment.

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

## Publication / next step at the time (historical)

- Redesign commit `9533b5d` was included in PR #1, merged on 2026-11-13. Both GitHub Actions runs passed, including clean install, lint, build, unit/browser tests, and screenshot upload: https://github.com/EPSILON0-dev/MiQuest/actions/runs/43440368682 and https://github.com/EPSILON0-dev/MiQuest/actions/runs/43440354993.
- User reviews the live prototype/screenshots and explicitly approves the UI or requests further iteration.
- Final palette remains undecided. Backend REST, SQLite, and verification are implemented in PR #2; UI integration and deployment remain outstanding.

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
- Backend implementation is committed on `feat/backend` and open for review in [PR #2](https://github.com/EPSILON0-dev/MiQuest/pull/2). The user explicitly requested the backend and test suite; that does not approve the Phase A UI.
- Added a FastAPI REST adapter, including controlled agent verdict submission, typed request validation, SQLite/SQLAlchemy domain services and Alembic migration, plus strict Pyright configuration and a pre-commit hook. The frontend still uses fixtures.
- Validation: 47 backend tests passed on Python 3.12.13 and 3.14.10; Ruff and the strict Pyright pre-commit hook passed. Tests cover REST operations, agent verification, migration rollback, shared membership, cycle races, revision conflicts and response snapshots. A built wheel initialized a database and loaded the API contract; a live loopback server returned `200 {"status":"ok"}` from `/readyz`. HTTP tests required running outside this sandbox because its thread portal hangs.
- The first domain tests were written before implementation, but their initial run could not reach their intended assertions because dependencies were unavailable. Later fixes used observed red-to-green tests; the initial domain work therefore does not fully meet the requested TDD evidence.
- Type checking covers all backend Python modules and tests in strict Pyright mode. Dynamic REST operation dispatch and JSON decoding require explicit casts; individual dispatched signatures are verified by integration tests rather than by the type checker.


### 2026-11-18: Accept connections on all interfaces

- Backend binds to `0.0.0.0`, accepts arbitrary hostnames, and no longer exposes bind or host-allowlist flags. Compose publishes port 8080 on all interfaces. Same-origin mutation and request validation remain in place.
- Validation: backend regression reproduced the previous 400; all 102 backend tests passed; Compose configuration validated; a live server listened on `0.0.0.0` and returned 200 for a remote Host header. Screenshots were not applicable to this backend/deployment change.
