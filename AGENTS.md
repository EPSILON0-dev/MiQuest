# MiQuest repository instructions

- Read DESIGN.md (authoritative scope), ROADMAP.md, and PROGRESS.md before work.
- Workflow: implement → test → create PR on focused branches. Describe actual behavior and validation. Never silently merge.
- The user explicitly approved the UI prototype and authorized frontend integration. MCP is deferred at the user's request.
- Keep changes small, reuse patterns, and add no accounts, chat, uploads, or unrequested infrastructure.
- Delegate bounded tasks to Luna for simple work or Terra for involved implementation/review as useful. Avoid overlapping edits; the primary agent owns integration and verification.
- Use Context7 for libraries, frameworks, SDKs, APIs, CLIs, and cloud services: resolve-library-id first (unless an exact /org/project ID was supplied), then query-docs for one concept at a time. General programming and API-independent refactoring do not need it.
- Use strict TypeScript, accessible controls, centralized semantic CSS variables, and the agreed stack. Validate graph and membership invariants; preserve verification history.
- Test meaningful behavior, run relevant checks, inspect desktop and narrow screenshots, and record actual results and blockers in PROGRESS.md.
- Backend domain work after approval requires red → green → refactor. Never weaken tests to make them pass.
