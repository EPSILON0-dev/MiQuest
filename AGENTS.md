# MiQuest repository instructions

- Read DESIGN.md (authoritative scope), ROADMAP.md, and PROGRESS.md before work.
- Workflow: implement → test → create PR on focused branches. Describe actual behavior and validation. Never silently merge.
- Phase A uses frontend fixtures/local state only. The user separately authorized backend and database work but has not approved the UI. Wait for explicit UI approval before connecting the frontend or deployment; MCP is deferred at the user's request. Design approval is not prototype approval.
- Keep changes small, reuse patterns, and add no accounts, chat, uploads, or unrequested infrastructure.
- Delegate bounded tasks to Luna for simple work or Terra for involved implementation/review as useful. Avoid overlapping edits; the primary agent owns integration and verification.
- Use Context7 for libraries, frameworks, SDKs, APIs, CLIs, and cloud services: resolve-library-id first (unless an exact /org/project ID was supplied), then query-docs for one concept at a time. General programming and API-independent refactoring do not need it.
- Use strict TypeScript, accessible controls, centralized semantic CSS variables, and the agreed stack. Validate graph and membership invariants; preserve verification history.
- Test meaningful behavior, run relevant checks, inspect desktop and narrow screenshots, and record actual results and blockers in PROGRESS.md.
- Backend domain work after approval requires red → green → refactor. Never weaken tests to make them pass.
