# MiQuest handover

## Immediate task

The user asked to stop this session and write this handover so a new agent can continue. Do not keep retrying network access in this session.

Work in `/home/epsilon/Documents/MiQuest`. Read `MiQuest_DESIGN_WEB.md`: it contains the consolidated, agreed v1 design following a scope interview. The user has authorized the following work, in order:

1. Create a Git repository.
2. Rename `MiQuest_DESIGN_WEB.md` to a more meaningful name (`DESIGN.md` was proposed).
3. Create a v1 roadmap (`ROADMAP.md`) and repository instructions (`AGENTS.md`, uppercase).
4. Create a documentation commit and publish a **private** GitHub repository with the docs. `MiQuest` is the natural repository name; confirm the authenticated GitHub owner through the CLI.
5. Start implementing the Phase A UI prototype on a feature branch. Follow implement → test → create PR. Do not merge or start the backend without the applicable approval.

The user wants action without repeated permission questions. Repository creation, the initial commit, private publication, UI implementation, and PR creation are authorized. No further product questions were identified as blocking.

## Actual repository state

- `.git` now exists and Git commands work. Current branch: `main`.
- No commits exist. No remote was reported.
- Before this handover, only `.gitignore` and `MiQuest_DESIGN_WEB.md` were untracked. `.gitignore` contains `.env`.
- This handover is the only new file created for the handoff.
- The design document was updated successfully during the earlier conversation. It has **not** been renamed.
- No roadmap, AGENTS.md, PROGRESS.md, README, frontend, backend, tests, screenshots, GitHub repository, or PR has been created.
- Do not mistake progress commentary for completed work.

## Access failures in the old session

The original session had restricted network access and a read-only `.git` mount. The user changed permissions several times. Git became writable, but network access never worked in the old session.

Latest checks:

```text
gh api user --jq .login
error connecting to api.github.com

npm ping --fetch-retries=0 --fetch-timeout=10000
npm error code EAI_AGAIN
npm error syscall getaddrinfo
npm error request to https://registry.npmjs.org/-/ping failed
```

`gh auth status` reported an invalid token for `EPSILON0-dev`, but this is inconclusive while GitHub is unreachable. Do not tell the user to reauthenticate until connectivity works and an authentication failure is confirmed.

The user is starting a new agent to obtain fresh session permissions. Check connectivity once in the new session and continue. If external operations remain blocked, complete independent local documentation work rather than repeatedly checking connectivity or claiming publication succeeded.

Git author configuration observed: `EPSILON0-dev`, `lukaforenc@gmail.com`. Do not change it unnecessarily.

## Agreed product scope

The design document is authoritative; this is a short index of the decisions already made:

- Single-user, self-hosted quest graph. Main purpose: resume a project after weeks away, see what is ready, understand the next quest, and give an external agent context to advance it.
- React + TypeScript + Vite, Tailwind + shadcn/ui, React Flow; basic on-demand automatic layout, manual and agent positioning.
- One root stylesheet with semantic CSS custom properties as a high-level switchboard for colors, borders, radii, and shared visual settings.
- Dark, polished FTB Minecraft quest-tree inspiration. Winding linear paths and radial/star milestone compositions can be arranged manually; no custom graph engine or specialized automatic composition algorithm.
- Project/progression are synonyms. Each owns one DAG; pages/trees show selected quests from it.
- A quest can appear on several pages with one identity, description, completion state, and verification history; positions are per page.
- Every quest has a home tree. Its initial tree is its home; the owner can change it to another tree containing the quest.
- Cross-tree dependencies show links to the quest's home tree. Clicking opens that tree and briefly highlights/pings the quest.
- Left sidebar has collapsible progressions and their trees, settings at the bottom. **No accounts in v1.**
- Top bar shows progression and tree names, with tree actions.
- Manually ordered progression-wide pins show quest titles at the top right of the canvas. Pins navigate to the quest on its home tree; no separate task-management semantics.
- Clicking a quest opens a modal **over the tree with a blurred background**. Back closes the modal and unblurs/restores the tree. Modal title bar has quest name and Back.
- Modal shows description and acceptance criteria, prerequisite and next-quest columns with icons/names, expandable evidence/history, and an Edit action. Keyboard focus handling is required.
- Main editing route is external agent/MCP, but all core editing must be possible manually: progression/page/quest CRUD, dependencies, icons, positions, membership, home tree, and pins.
- Removing a quest from a page is separate from deleting it everywhere. Global deletion requires confirmation and removes dependency links.
- Every quest must appear on at least one page. Last-appearance removal/page deletion requires moving affected quests or explicitly deleting them. Home trees must remain valid.
- Icons come from one bundled library with stable agent-visible names, default icon, and searchable manual picker. **No uploads, period.**
- Embedded chat/right-side harness integration is **deferred beyond v1**. Use an existing external agent client through MCP.
- localStorage restores last progression/tree and each tree's pan/zoom. Modal starts closed on reload; handle stale/deleted saved targets.
- Narrow screens: navigation drawer, compact expandable pins, full-screen modal, pannable graph.
- Historically verified quests retain their badge/history if a prerequisite is reopened, while also showing currently unsatisfied prerequisites. New verification passes require prerequisites to be satisfied.
- Backend later: Python/FastAPI, SQLite/SQLAlchemy/Alembic, official Python MCP SDK over stdio. Evidence-based agent verification, audited explicit human override, no arbitrary generic completion updates.
- Private Tailscale-only browser deployment, no application accounts, no unauthenticated remote MCP.

## Approval gates and workflow

- **Phase A only now:** real interactive frontend using hard-coded fixtures and local state. No API, database, backend MCP, or verification backend.
- Use at least two projects, 12–20 quest branching fixtures, multiple pages, shared milestone, mixed/blocked/completed states, cross-tree links, and pins.
- Fixture edits need not survive reload; view restoration in localStorage is required.
- Implement and test interactions, capture and inspect desktop (1440×900) and narrow (390×844) screenshots, fix obvious visual issues, provide launch instructions and walkthrough.
- Stop for **explicit user UI approval** before Phase B. The user's approval of the design spec is not prototype approval.
- After UI approval, backend domain work requires red → green → refactor TDD, then API/MCP integration, deployment, and checks as specified in the design.
- Maintain `PROGRESS.md` with actual completed work, test commands/results, blockers, and next steps.

## AGENTS.md requested contents

- Propose/use the simple workflow: **implement → test → create PR**. Work on focused branches; PRs explain behavior and actual validation. Do not invent checks or silently merge.
- Delegate smaller, bounded tasks to **Terra or Luna** agents as needed; the primary agent owns integration and verification. The user explicitly requested this delegation policy, so model selection/delegation is authorized. Prefer Luna for simple bounded work, Terra for more involved implementation/review. Avoid overlapping edits.
- Keep changes small, reuse project patterns, no unrequested infrastructure, accounts, chat, uploads, or backend before UI approval.
- Include current-documentation policy: use Context7 for libraries/frameworks/SDKs/APIs/CLIs/cloud services. Start with resolve-library-id, then query-docs scoped by concept; exact supplied library IDs can skip resolution. General programming/refactoring without library APIs does not need Context7.

## Skills and tools already consulted

- Ponytail full is active: smallest complete solution, meaningful checks for nontrivial code, concise handoff with limitations. Read the installed skill if needed.
- Grilling interview is finished; decisions are incorporated into the design. Do not restart the interview.
- Context7 was used for GitHub CLI, Vite, React Flow, and shadcn/ui documentation. Useful IDs: `/websites/cli_github_manual`, `/vitejs/vite`, `/websites/reactflow_dev`, `/shadcn-ui/ui`. Recheck relevant current docs during implementation.
- Sites skill was read for local-only preview guidance. This is a local self-hosted GitHub project, **not** a request to register or deploy a hosted Site. Do not create a Sites-hosted app or change the chosen stack.
- GitHub CLI publication pattern from docs: `gh repo create MiQuest --private --source=. --remote=origin --push` after the docs commit. Check for an existing repo/remote first to avoid collisions or duplicating work.
- Plugin Management search found an uninstalled GitHub plugin (`plugin_connector_1p_1a69035c238881919c4190932b2df699`); no installation/suggestion/connection was performed. Prefer the CLI if working. No GitHub tools were available in the previous session.

## Suggested first actions

1. Read this handover and the design, inspect Git status, verify new session connectivity once.
2. Finish the authorized doc rename, roadmap, agent instructions, README, progress log, and sensible ignore patterns. Keep roadmap tied to the agreed scope and approval gates.
3. Validate document references, commit docs, create/push the private GitHub repo, and verify visibility.
4. Create a UI branch, scaffold the agreed frontend, delegate small independent work when useful, implement/test/inspect screenshots, create a PR, and request UI review. Remain in Phase A.
