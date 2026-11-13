# MiQuest v1 roadmap

DESIGN.md defines the agreed scope and acceptance criteria.

## Foundation
- [x] Initialize Git and consolidate design.
- [x] Add repository instructions, roadmap, README, and progress log.
- [x] Commit documentation and publish a private GitHub repository.

## Phase A — interactive UI prototype
- [x] Scaffold React/TypeScript/Vite, Tailwind/shadcn, React Flow, bundled icons, and semantic theme variables.
- [x] Build two fixture projects with 12–20 branching quests, multiple pages, shared milestone, mixed states, historical verification, cross-tree links, and pins.
- [x] Implement graph navigation, positions, automatic layout, modal/focus handling, responsive navigation, and view restoration.
- [x] Implement local project/page/quest editing, dependencies, membership/home trees, ordered pins, icons, and safe deletion.
- [x] Test invariants and critical interactions; build/lint; capture and inspect 1440×900 and 390×844 screenshots.
- [ ] Create PR and provide launch instructions and walkthrough.
- [ ] **Explicit user UI approval. Stop here until granted.**

## Phase B — only after UI approval
- [ ] TDD domain models, SQLite constraints/migrations, shared services, and persistence.
- [ ] TDD REST adapters and connect approved frontend.
- [ ] TDD official Python MCP stdio adapter with real protocol integration checks.
- [ ] TDD verification/evidence requirements, audited override/reopen, and retained history.
- [ ] End-to-end persistence, graph editing, home-tree/membership, and verification checks.

## Delivery
- [ ] Non-root container, persistent SQLite, health check, backup procedure, and private Tailscale Serve instructions.
- [ ] Clean checkout build/test/lint and final acceptance checks; document remaining limits.
