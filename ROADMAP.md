# MiQuest v1 roadmap

[DESIGN.md](DESIGN.md) defines the product scope. The user approved the UI prototype and frontend integration. [PROGRESS.md](PROGRESS.md) records validation and milestone history.

## Verification pipeline
- [x] Add durable user-triggered verification, evidence storage, settings, progress, and history with the safeguards specified in the verification handoff.
- [x] Validate with a mocked OpenRouter provider; automated tests do not make real OpenRouter calls.
- [x] Perform a separate live OpenRouter smoke test for passing and failing text reviews using a low-cost model.
- [x] Test an image upload through the review API and a live low-cost model.

## Foundation
- [x] Initialize Git and consolidate design.
- [x] Add repository instructions, roadmap, README, and progress log.
- [x] Commit documentation and publish a private GitHub repository.

## Expressive quest generation
- [x] Support emoji and per-page branching, radial and spiral layouts in version 2 imports and the editor.
- [x] Improve the project-generation skill with decomposition, parallelism, examples and a quality checklist.

## Phase A — interactive UI prototype
- [x] Build the fixture-based React graph UI, navigation, quest modal, and editing interactions.
- [x] Implement the dense icon-only redesign, responsive views, pins, shared quests, and viewport restoration.
- [x] Test critical interactions, capture and inspect desktop/narrow screenshots, and provide a walkthrough.
- [x] Merge UI prototype [PR #1](https://github.com/EPSILON0-dev/MiQuest/pull/1); the user subsequently approved the UI.
- [x] Obtain explicit user UI approval.

## Backend — implemented in PR #2
- [x] Define [OpenAPI and database contracts](docs/backend/README.md).
- [x] Implement SQLite models, Alembic migration, shared domain services, graph and membership invariants, and ordered pins.
- [x] Implement REST operations, including controlled agent verdict submission, manual override, reopening, and verification history.
- [x] Add backend tests, strict Pyright configuration, and a pre-commit type-check hook. See [backend setup](backend/README.md) and [PROGRESS.md](PROGRESS.md) for validation and the TDD evidence limitation.
- [x] Open backend [PR #2](https://github.com/EPSILON0-dev/MiQuest/pull/2); merged.
- [x] Connect the approved frontend to the API, preserving editing and view behavior.
- [x] Add persisted end-to-end tests for frontend graph editing, membership, and verification.
- [x] Add validated JSON project import and a project-generation skill.

## Delivery
- [x] Add a non-root container, persistent SQLite, backup procedure, private access guidance, and liveness/readiness endpoints. Compose startup, persistence, and backup/restore have been tested.
- [ ] Complete final acceptance checks and document remaining limits. The user accepts passing CI as evidence for the automated tests.

## Additional completed work
- [x] Add a root-level development command runner.
- [x] Add English and Polish frontend translations.
- [x] Add frontend and backend Dockerfiles and a Compose configuration.
- [x] Document development and container startup, usage, and backup/restore.

## Deferred
- Embedded chat and its design are outside v1 scope.
