---
name: miquest-project
description: Create a JSON project file for import into MiQuest from a user's project or quest-tree idea.
---

Create a UTF-8 JSON file using [the schema](references/project-v2.schema.json), the [UI example](references/example.json), and the [multi-page OS example](references/os-example.json). Ask for missing information only when necessary.

## Plan the graph

For substantial projects, first break the outcome into major components, then recursively into subcomponents. Stop when each component has understandable boundaries and outputs; avoid splitting indefinitely. Only then create actionable, independently verifiable quests for the smallest useful components. Small projects may go straight to quests. If a crucial design decision is unresolved, use a focused decision quest instead of inventing an architecture.

Add an edge only when the dependent quest cannot reasonably be completed without its prerequisite. Seek useful parallel work, including independent branches that converge on an integration quest. Review component interfaces and add real cross-component dependencies and integration work. Never add dependencies just to make a shape or impose a generic plan-then-build sequence.

Use meaningful milestones for completed outcomes and link their real prerequisites. Use pages for useful component or overview views, not arbitrary size limits. Shared quests are one identity on multiple pages; include each quest in its home page. Choose the layout that suits each page: branching for independent branches, radial for a central outcome surrounded by components, or spiral for genuinely sequential work.

## Write quests

Use short, generally named titles and descriptions that explain the specific scope. Write observable acceptance criteria as plain-text bullet points, each `Generic label — specific outcome`. Keep small details in the criteria when they do not need separate dependencies or verification. Choose an explicit, relevant supported icon or emoji for every quest; prefer different emoji on a page, but repeat them when appropriate. Shared quests keep the same icon everywhere.

## Validate and deliver

Use unique page and quest keys. Each dependency's `quest` depends on `dependsOn`; reject self-dependencies and cycles. Use supported icon names or `emoji:` followed by a supported emoji. Normally omit positions and leave `bypassAutoLayout` false so the frontend lays out each page. If `bypassAutoLayout` is true, supply finite positions for every appearance on every page. Do not include database IDs, completion states, or verification history. Pins are optional quest keys in display order.

Check the decomposition, granularity, true blockers, parallelism, integration, milestone criteria, icon variety, observable requirements, references and graph validity. Validate the JSON against the schema. Present a compact text outline of pages, shapes, major branches, counts and material assumptions alongside the file. Tell the user to select it in MiQuest's import dialog and review the summary before confirming.
