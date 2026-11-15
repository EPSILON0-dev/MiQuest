# MiQuest v1 roadmap

[DESIGN.md](DESIGN.md) defines the product scope. The user approved the UI prototype and frontend integration. [PROGRESS.md](PROGRESS.md) records actual validation and open PRs.

## Foundation
- [x] Initialize Git and consolidate design.
- [x] Add repository instructions, roadmap, README, and progress log.
- [x] Commit documentation and publish a private GitHub repository.

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
- [ ] Non-root container, persistent SQLite, backup procedure, and private Tailscale Serve instructions. Backend liveness/readiness endpoints are implemented.
- [ ] Run clean-checkout build, tests, lint and final acceptance checks; document remaining limits.

## Planned next tasks, in order
1. [x] Add a simple root-level command runner to start frontend and backend in development mode.
2. [ ] Add frontend internationalization with English and Polish.
3. [ ] Add frontend and backend Dockerfiles and a Compose configuration.
4. [ ] Document development and container startup, usage, and backup/restore.
5. [ ] Revisit the in-app chatbox design; its design and scope are deferred.
