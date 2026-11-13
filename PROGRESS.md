# Progress

## Current state — 2026-11-13, redesign

The user rejected the first card-based visual direction, supplied FTB graph/modal/tooltip references, and confirmed the redesign through a design interview. This authorizes the redesign, **not approval of the finished UI**. Phase A review remains pending. Do not merge or start Phase B without explicit approval.

Private repository: https://github.com/EPSILON0-dev/MiQuest. Branch: `feat/phase-a-ui`. PR: https://github.com/EPSILON0-dev/MiQuest/pull/1 (open, unmerged).

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

- Redesign is prepared for publication on existing PR #1; local checks pass. GitHub CI result will be reported after publication.
- User reviews the live prototype/screenshots and explicitly approves the UI or requests further iteration.
- Final palette remains undecided. API, SQLite, MCP, real verification, and deployment remain unstarted and gated on UI approval.

## Earlier milestones

- `5e7b29a`: initial documentation and private repository publication.
- `9409636`: original interactive prototype (visual design superseded by this redesign).
- `c7cf82c`: original progress/PR record. Original CI passed: https://github.com/EPSILON0-dev/MiQuest/actions/runs/43434429272.

Limits: fixture edits reset after reload; only view context persists. Chromium desktop and emulated touch/narrow checks were run, not physical-device or cross-browser validation. Backend persistence/security checks are outside Phase A.
