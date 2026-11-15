---
name: miquest-project
description: Create a JSON project file for import into MiQuest from a user's project or quest-tree idea.
---

Create a UTF-8 JSON file representing one new project. Use [the schema](references/project-v1.schema.json) and [the example](references/example.json). Ask for missing project information only when needed; keep quests actionable and acceptance criteria observable.

Use unique `key` values for pages and quests. Page `quests` contain quest keys; a shared quest appears in each relevant page, including its `homePage`. Each dependency's `quest` depends on `dependsOn`; reject self-dependencies and cycles. Use the icon names listed in the schema, or omit `iconName` to use the default. Do not include positions, database IDs, completion states, or verification history. The importer creates initial positions and starts quests incomplete. Pins are optional quest keys in display order.

Validate the JSON against the schema and check the reference and graph rules before delivering it. Tell the user to select the file in MiQuest's import dialog and review the summary before confirming.
