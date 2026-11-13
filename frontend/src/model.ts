export type QuestState = "not_started" | "in_progress" | "blocked";
export type CompletionState = "none" | "verified" | "overridden";
export type Project = { id: string; name: string; description: string };
export type Page = { id: string; projectId: string; name: string };
export type Quest = {
  id: string;
  projectId: string;
  title: string;
  description: string;
  acceptanceCriteria: string;
  workState: QuestState;
  completionState: CompletionState;
  icon: string;
  homePageId: string;
};
export type Appearance = {
  pageId: string;
  questId: string;
  x: number;
  y: number;
};
export type Dependency = { questId: string; dependsOnQuestId: string };
export type Verification = {
  id: string;
  questId: string;
  verdict: "pass" | "fail" | "inconclusive" | "override" | "reopen";
  evidence: string;
  reasoning: string;
  actor: "agent" | "human";
  createdAt: string;
};
export type Pin = { projectId: string; questId: string };
export type Model = {
  projects: Project[];
  pages: Page[];
  quests: Quest[];
  appearances: Appearance[];
  dependencies: Dependency[];
  verifications: Verification[];
  pins: Pin[];
};

export function statusForQuest(
  model: Model,
  questId: string,
):
  | "locked"
  | "available"
  | "in_progress"
  | "verified"
  | "overridden"
  | "blocked" {
  const quest = model.quests.find((q) => q.id === questId);
  if (!quest) throw new Error("Quest not found");
  if (
    model.dependencies.some(
      (d) =>
        d.questId === questId &&
        !["verified", "overridden"].includes(
          model.quests.find((q) => q.id === d.dependsOnQuestId)
            ?.completionState ?? "none",
        ),
    )
  )
    return "locked";
  return quest.completionState !== "none"
    ? quest.completionState
    : quest.workState === "not_started"
      ? "available"
      : quest.workState;
}

export function addDependency(
  model: Model,
  questId: string,
  dependsOnQuestId: string,
): Model {
  const quest = model.quests.find((q) => q.id === questId);
  const prerequisite = model.quests.find((q) => q.id === dependsOnQuestId);
  if (!quest || !prerequisite) throw new Error("Quest not found");
  if (questId === dependsOnQuestId)
    throw new Error("A quest cannot depend on itself");
  if (quest.projectId !== prerequisite.projectId)
    throw new Error("Dependencies must belong to the same project");
  if (
    model.dependencies.some(
      (d) => d.questId === questId && d.dependsOnQuestId === dependsOnQuestId,
    )
  )
    throw new Error("Dependency already exists");
  const visited = new Set<string>();
  const reachesQuest = (id: string): boolean => {
    if (id === questId) return true;
    if (visited.has(id)) return false;
    visited.add(id);
    return model.dependencies.some(
      (d) => d.questId === id && reachesQuest(d.dependsOnQuestId),
    );
  };
  if (reachesQuest(dependsOnQuestId))
    throw new Error("Dependency would create a cycle");
  return {
    ...model,
    dependencies: [...model.dependencies, { questId, dependsOnQuestId }],
  };
}

export function removeAppearance(
  model: Model,
  pageId: string,
  questId: string,
): Model {
  const quest = model.quests.find((q) => q.id === questId);
  if (
    !quest ||
    !model.appearances.some((a) => a.pageId === pageId && a.questId === questId)
  )
    throw new Error("Appearance not found");
  const remaining = model.appearances.filter(
    (a) => a.questId === questId && a.pageId !== pageId,
  );
  if (!remaining.length)
    throw new Error("A quest must appear on at least one tree");
  return {
    ...model,
    appearances: model.appearances.filter(
      (a) => a.pageId !== pageId || a.questId !== questId,
    ),
    quests: model.quests.map((q) =>
      q.id === questId && q.homePageId === pageId
        ? { ...q, homePageId: remaining[0].pageId }
        : q,
    ),
  };
}

export function deletePage(
  model: Model,
  pageId: string,
  moveToPageId?: string,
): Model {
  const page = model.pages.find((p) => p.id === pageId);
  if (!page) throw new Error("Tree not found");
  const destination = model.pages.find((p) => p.id === moveToPageId);
  if (
    moveToPageId &&
    (!destination ||
      destination.id === pageId ||
      destination.projectId !== page.projectId)
  )
    throw new Error("Choose another tree in this project");
  let result = model;
  for (const appearance of model.appearances.filter(
    (a) => a.pageId === pageId,
  )) {
    const hasOther = result.appearances.some(
      (a) => a.questId === appearance.questId && a.pageId !== pageId,
    );
    if (!hasOther) {
      if (!destination)
        throw new Error("Move quests before deleting their last tree");
      result = {
        ...result,
        appearances: [
          ...result.appearances,
          { ...appearance, pageId: destination.id },
        ],
      };
    }
    result = removeAppearance(result, pageId, appearance.questId);
  }
  return { ...result, pages: result.pages.filter((p) => p.id !== pageId) };
}

export function deleteQuest(model: Model, questId: string): Model {
  return {
    ...model,
    quests: model.quests.filter((q) => q.id !== questId),
    appearances: model.appearances.filter((a) => a.questId !== questId),
    dependencies: model.dependencies.filter(
      (d) => d.questId !== questId && d.dependsOnQuestId !== questId,
    ),
    verifications: model.verifications.filter((v) => v.questId !== questId),
    pins: model.pins.filter((p) => p.questId !== questId),
  };
}

export function createFixture(): Model {
  const projects: Project[] = [
    {
      id: "atlas",
      name: "Atlas",
      description: "A thoughtful home for everything worth finding.",
    },
    {
      id: "studio",
      name: "Studio",
      description: "Make space for creative work.",
    },
  ];
  const pages: Page[] = [
    { id: "foundations", projectId: "atlas", name: "Foundations" },
    { id: "launch", projectId: "atlas", name: "Launch path" },
    { id: "rhythm", projectId: "studio", name: "Creative rhythm" },
  ];
  const definitions: [
    string,
    string,
    string,
    string,
    QuestState,
    CompletionState,
    string,
  ][] = [
    [
      "vision",
      "Define the north star",
      "foundations",
      "atlas",
      "not_started",
      "verified",
      "compass",
    ],
    [
      "research",
      "Map the landscape",
      "foundations",
      "atlas",
      "not_started",
      "verified",
      "search",
    ],
    [
      "audience",
      "Know the audience",
      "foundations",
      "atlas",
      "in_progress",
      "none",
      "users",
    ],
    [
      "principles",
      "Set design principles",
      "foundations",
      "atlas",
      "not_started",
      "verified",
      "sparkles",
    ],
    [
      "architecture",
      "Shape the architecture",
      "foundations",
      "atlas",
      "in_progress",
      "none",
      "layers",
    ],
    [
      "prototype",
      "Build the first prototype",
      "foundations",
      "atlas",
      "not_started",
      "none",
      "box",
    ],
    [
      "feedback",
      "Gather early feedback",
      "foundations",
      "atlas",
      "not_started",
      "none",
      "message-circle",
    ],
    [
      "milestone",
      "A useful first version",
      "foundations",
      "atlas",
      "not_started",
      "none",
      "flag",
    ],
    [
      "story",
      "Write the story",
      "launch",
      "atlas",
      "in_progress",
      "none",
      "book-open",
    ],
    [
      "identity",
      "Create the identity",
      "launch",
      "atlas",
      "not_started",
      "none",
      "palette",
    ],
    [
      "site",
      "Prepare the launch site",
      "launch",
      "atlas",
      "blocked",
      "none",
      "globe",
    ],
    [
      "review",
      "Review the experience",
      "launch",
      "atlas",
      "not_started",
      "verified",
      "check-circle",
    ],
    [
      "launchday",
      "Share with the world",
      "launch",
      "atlas",
      "not_started",
      "none",
      "rocket",
    ],
    [
      "space",
      "Clear a little space",
      "rhythm",
      "studio",
      "not_started",
      "overridden",
      "home",
    ],
    [
      "ritual",
      "Find a daily ritual",
      "rhythm",
      "studio",
      "in_progress",
      "none",
      "sun",
    ],
    [
      "ideas",
      "Collect the sparks",
      "rhythm",
      "studio",
      "not_started",
      "none",
      "lightbulb",
    ],
    [
      "practice",
      "Make something small",
      "rhythm",
      "studio",
      "not_started",
      "none",
      "pen-tool",
    ],
    [
      "share",
      "Share the work",
      "rhythm",
      "studio",
      "not_started",
      "none",
      "send",
    ],
  ];
  const context: Record<string, [string, string]> = {
    vision: [
      "Atlas should make useful knowledge easy to find again. The brief sets boundaries for the first release.",
      "Name the audience, core problem, and first-release goal in a short brief.",
    ],
    research: [
      "Reviewed bookmarking and knowledge tools to understand where retrieval breaks down.",
      "Compare three tools and identify gaps Atlas will address.",
    ],
    audience: [
      "The early audience is still a hypothesis. Continue with interview notes before choosing the first workflow.",
      "Summarize three audience needs, each supported by an observation.",
    ],
    principles: [
      "The first principles favor calm navigation and a clear path back to saved material.",
      "Document the principles with a practical example of each.",
    ],
    architecture: [
      "The sketch separates saved items, collections, and search. Resolve how links between items should work.",
      "Record the core entities, relationships, and one retrieval flow.",
    ],
    prototype: [
      "Build a narrow working slice once the architecture is settled. Focus on saving and finding one item.",
      "A user can save an item, find it again, and explain the flow unaided.",
    ],
    feedback: [
      "Use the audience research to recruit early readers and observe their first attempt.",
      "Capture observations from three sessions and list common points of confusion.",
    ],
    milestone: [
      "Bring the prototype and feedback together into a version useful without a walkthrough.",
      "The save-and-find flow works and major feedback is addressed or recorded.",
    ],
    story: [
      "Draft why Atlas exists, beginning with the frustration of losing a useful reference.",
      "Explain the problem, audience, and promise in plain language.",
    ],
    identity: [
      "Explore a restrained visual identity after the story is clear.",
      "Choose a wordmark direction, palette, and type treatment with examples.",
    ],
    site: [
      "The launch page is waiting on identity decisions. Its outline has a hero, explanation, and invitation.",
      "A responsive page communicates the promise and offers a clear next step.",
    ],
    review: [
      "An earlier walkthrough passed, but the launch site has since been reopened. Repeat the review when it is ready.",
      "Review the full launch experience for clarity, accessibility, and broken paths.",
    ],
    launchday: [
      "Coordinate the first public share once the useful version and launch review are ready.",
      "Publish the launch page and share the release with the early audience.",
    ],
    space: [
      "The desk was cleared enough to begin, even though the storage plan is unfinished.",
      "Keep a clear work surface and a reachable place for current materials.",
    ],
    ritual: [
      "Try a short daily session before checking messages. Mornings seem easiest to protect.",
      "Complete five short sessions and note a sustainable time and duration.",
    ],
    ideas: [
      "Collect fragments in one place instead of leaving them across notebooks and browser tabs.",
      "Gather existing fragments into one list and tag promising starting points.",
    ],
    practice: [
      "Use the ritual and idea list to make something small enough to finish in one sitting.",
      "Finish one small piece and write a sentence about what to try next.",
    ],
    share: [
      "Choose a finished piece and share it with someone who can offer thoughtful feedback.",
      "Send the work with a specific question and record the response.",
    ],
  };
  const quests: Quest[] = definitions.map(
    ([id, title, homePageId, projectId, workState, completionState, icon]) => ({
      id,
      title,
      homePageId,
      projectId,
      workState,
      completionState,
      icon,
      description: context[id][0],
      acceptanceCriteria: context[id][1],
    }),
  );
  const coordinates: Record<string, [number, number]> = {
    vision: [40, 220],
    research: [290, 80],
    audience: [290, 340],
    principles: [540, 30],
    architecture: [540, 220],
    prototype: [790, 150],
    feedback: [790, 360],
    milestone: [1040, 230],
    story: [50, 80],
    identity: [50, 300],
    site: [320, 80],
    review: [320, 300],
    launchday: [850, 200],
    space: [40, 200],
    ritual: [300, 100],
    ideas: [300, 310],
    practice: [560, 200],
    share: [820, 200],
  };
  const appearances: Appearance[] = quests.map((q) => ({
    pageId: q.homePageId,
    questId: q.id,
    x: coordinates[q.id][0],
    y: coordinates[q.id][1],
  }));
  appearances.push({ pageId: "launch", questId: "milestone", x: 580, y: 200 });
  const edges = [
    ["research", "vision"],
    ["audience", "vision"],
    ["principles", "research"],
    ["architecture", "research"],
    ["prototype", "architecture"],
    ["feedback", "audience"],
    ["milestone", "prototype"],
    ["milestone", "feedback"],
    ["story", "principles"],
    ["identity", "story"],
    ["site", "identity"],
    ["review", "site"],
    ["launchday", "milestone"],
    ["launchday", "review"],
    ["ritual", "space"],
    ["ideas", "space"],
    ["practice", "ritual"],
    ["practice", "ideas"],
    ["share", "practice"],
  ];
  return {
    projects,
    pages,
    quests,
    appearances,
    dependencies: edges.map(([questId, dependsOnQuestId]) => ({
      questId,
      dependsOnQuestId,
    })),
    verifications: [
      {
        id: "v1",
        questId: "vision",
        verdict: "pass",
        evidence: "Vision brief reviewed.",
        reasoning: "The direction and intended audience are clear.",
        actor: "agent",
        createdAt: "2026-10-12",
      },
      {
        id: "v3",
        questId: "research",
        verdict: "pass",
        evidence: "Landscape comparison notes.",
        reasoning: "Three tools and their gaps are documented.",
        actor: "agent",
        createdAt: "2026-10-15",
      },
      {
        id: "v4",
        questId: "principles",
        verdict: "pass",
        evidence: "Design principles brief.",
        reasoning: "Each principle has a practical example.",
        actor: "agent",
        createdAt: "2026-10-18",
      },
      {
        id: "v5",
        questId: "space",
        verdict: "override",
        evidence: "",
        reasoning: "The desk is usable; the remaining storage can wait.",
        actor: "human",
        createdAt: "2026-10-20",
      },
      {
        id: "v2",
        questId: "review",
        verdict: "pass",
        evidence: "Earlier walkthrough notes.",
        reasoning:
          "The previous experience met the criteria before the launch site was reopened.",
        actor: "agent",
        createdAt: "2026-10-25",
      },
    ],
    pins: [
      { projectId: "atlas", questId: "architecture" },
      { projectId: "atlas", questId: "milestone" },
      { projectId: "atlas", questId: "story" },
      { projectId: "studio", questId: "ritual" },
    ],
  };
}
