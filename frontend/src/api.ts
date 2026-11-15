import type { Model, Page, Project, Quest, Verification } from "./model";

type Revisions = Record<string, number>;
export type LoadedModel = { model: Model; revisions: Revisions };
type Result = LoadedModel;
type Envelope<T> = { data: T; projectRevision?: number };
type PageGraph = {
  project: Project;
  page: Page;
  quests: Quest[];
  appearances: Model["appearances"];
  memberships: Model["appearances"];
  dependencies: Model["dependencies"];
  externalLinks: {
    direction: "prerequisite" | "next";
    localQuestId: string;
    remoteQuest: Quest;
  }[];
  pins: { pin: Model["pins"][number]; quest: Quest }[];
};
type History = { items: Verification[]; nextAfterSequence: number | null };

export class ApiError extends Error {
  code: string;
  status: number;
  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

async function request<T>(
  path: string,
  method = "GET",
  body?: object,
): Promise<Envelope<T>> {
  const response = await fetch(`/api/v1${path}`, {
    method,
    ...(body
      ? {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : {}),
  });
  const result = await response.json();
  if (!response.ok) {
    const error = result.error ?? result;
    throw new ApiError(
      error.code ?? "request_failed",
      error.message ?? `Request failed (${response.status})`,
      response.status,
    );
  }
  return result as Envelope<T>;
}

export async function loadModel(): Promise<Result> {
  const projects = (
    await request<(Project & { revision: number })[]>("/projects")
  ).data;
  const model: Model = {
    projects,
    pages: [],
    quests: [],
    appearances: [],
    dependencies: [],
    pins: [],
    verifications: [],
  };
  const revisions: Revisions = {};
  for (const project of projects) {
    const pages = await request<Page[]>(`/projects/${project.id}/pages`);
    if (pages.projectRevision === undefined)
      throw new Error("Missing project revision");
    revisions[project.id] = pages.projectRevision;
    model.pages.push(...pages.data);
  }
  return { model, revisions };
}

export async function loadPageGraph(
  pageId: string,
): Promise<{ model: Model; revision: number }> {
  const response = await request<PageGraph>(`/pages/${pageId}/graph`);
  if (response.projectRevision === undefined)
    throw new Error("Missing project revision");
  const graph = response.data;
  const quests = new Map(graph.quests.map((quest) => [quest.id, quest]));
  const dependencies = [...graph.dependencies];
  for (const link of graph.externalLinks) {
    quests.set(link.remoteQuest.id, link.remoteQuest);
    dependencies.push(
      link.direction === "prerequisite"
        ? { questId: link.localQuestId, dependsOnQuestId: link.remoteQuest.id }
        : { questId: link.remoteQuest.id, dependsOnQuestId: link.localQuestId },
    );
  }
  for (const pin of graph.pins) quests.set(pin.quest.id, pin.quest);
  return {
    revision: response.projectRevision,
    model: {
      projects: [graph.project],
      pages: [graph.page],
      quests: [...quests.values()],
      appearances: graph.memberships,
      dependencies,
      pins: graph.pins.map(({ pin }) => pin),
      verifications: [],
    },
  };
}

export async function loadProjectQuests(
  projectId: string,
): Promise<{ quests: Quest[]; revision: number }> {
  const response = await request<Quest[]>(`/projects/${projectId}/quests`);
  if (response.projectRevision === undefined)
    throw new Error("Missing project revision");
  return { quests: response.data, revision: response.projectRevision };
}

export async function loadPageMemberships(pageId: string): Promise<{
  quests: Quest[];
  appearances: Model["appearances"];
  revision: number;
}> {
  const response = await request<{
    quests: Quest[];
    appearances: Model["appearances"];
  }>(`/pages/${pageId}/memberships`);
  if (response.projectRevision === undefined)
    throw new Error("Missing project revision");
  return { ...response.data, revision: response.projectRevision };
}

export async function loadVerificationHistory(
  questId: string,
): Promise<{ items: Verification[]; revision: number }> {
  const items: Verification[] = [];
  let after = 0;
  let revision: number | undefined;
  do {
    const response = await request<History>(
      `/quests/${questId}/verifications?afterSequence=${after}&limit=200`,
    );
    if (response.projectRevision === undefined)
      throw new Error("Missing project revision");
    if (revision !== undefined && revision !== response.projectRevision)
      throw new ApiError(
        "stale_revision",
        "Project changed while loading verification history",
        409,
      );
    revision = response.projectRevision;
    items.push(...response.data.items);
    after = response.data.nextAfterSequence ?? 0;
  } while (after);
  return { items, revision: revision! };
}

export async function persistModel(
  old: Model,
  next: Model,
  revisions: Revisions,
): Promise<Result & { ids: Record<string, string> }> {
  const ids: Record<string, string> = {};
  const currentRevisions = { ...revisions };
  const id = (value: string) => ids[value] ?? value;
  async function mutate<T>(
    projectId: string,
    path: string,
    method: string,
    body: object,
  ): Promise<T> {
    const project = id(projectId);
    if (currentRevisions[project] === undefined)
      throw new Error(`Missing revision for project ${project}`);
    const response = await request<T>(path, method, {
      ...body,
      expectedRevision: currentRevisions[project],
    });
    if (response.projectRevision === undefined)
      throw new Error("Missing project revision");
    currentRevisions[project] = response.projectRevision;
    return response.data;
  }
  const deletedPage = old.pages.find(
    (p) =>
      !next.pages.some((n) => n.id === p.id) &&
      next.projects.some((project) => project.id === p.projectId),
  );
  if (deletedPage) {
    const actions: object[] = [];
    for (const previous of old.appearances.filter(
      (a) => a.pageId === deletedPage.id,
    )) {
      const before = old.quests.find((q) => q.id === previous.questId);
      const quest = next.quests.find((q) => q.id === previous.questId);
      if (!before || !quest)
        throw new Error("Missing quest while deleting tree");
      const added = next.appearances.find(
        (a) =>
          a.questId === quest.id &&
          !old.appearances.some(
            (b) => b.questId === a.questId && b.pageId === a.pageId,
          ),
      );
      if (added)
        actions.push({
          questId: quest.id,
          action: "move",
          targetPageId: added.pageId,
          x: added.x,
          y: added.y,
        });
      else if (before.homePageId === deletedPage.id)
        actions.push({
          questId: quest.id,
          action: "rehome",
          targetPageId: quest.homePageId,
        });
    }
    await mutate(deletedPage.projectId, `/pages/${deletedPage.id}`, "DELETE", {
      confirmDelete: true,
      questActions: actions,
    });
    return { model: next, revisions: currentRevisions, ids };
  }
  const has = <T extends { id: string }>(items: T[], key: string) =>
    items.some((item) => item.id === key);
  const appearance = (model: Model, pageId: string, questId: string) =>
    model.appearances.find((a) => a.pageId === pageId && a.questId === questId);
  const edge = (model: Model, questId: string, prerequisite: string) =>
    model.dependencies.some(
      (d) => d.questId === questId && d.dependsOnQuestId === prerequisite,
    );

  for (const project of next.projects) {
    const before = old.projects.find((p) => p.id === project.id);
    if (!before) {
      const created = await request<Project>("/projects", "POST", {
        name: project.name,
        description: project.description,
      });
      if (created.projectRevision === undefined)
        throw new Error("Missing project revision");
      ids[project.id] = created.data.id;
      currentRevisions[created.data.id] = created.projectRevision;
    } else if (
      project.name !== before.name ||
      project.description !== before.description
    ) {
      await mutate(project.id, `/projects/${id(project.id)}`, "PATCH", {
        name: project.name,
        description: project.description,
      });
    }
  }
  for (const page of next.pages) {
    const before = old.pages.find((p) => p.id === page.id);
    if (!before) {
      const created = await mutate<{ id: string }>(
        page.projectId,
        `/projects/${id(page.projectId)}/pages`,
        "POST",
        { name: page.name },
      );
      ids[page.id] = created.id;
    } else if (before.name !== page.name)
      await mutate(page.projectId, `/pages/${id(page.id)}`, "PATCH", {
        name: page.name,
      });
  }
  for (const quest of next.quests) {
    if (has(old.quests, quest.id)) continue;
    const position = appearance(next, quest.homePageId, quest.id);
    if (!position) throw new Error("New quest has no home appearance");
    const created = await mutate<{ quest: Quest }>(
      quest.projectId,
      `/projects/${id(quest.projectId)}/quests`,
      "POST",
      {
        title: quest.title,
        description: quest.description,
        acceptanceCriteria: quest.acceptanceCriteria,
        workState: quest.workState,
        icon: quest.icon,
        milestone: quest.milestone,
        pageId: id(quest.homePageId),
        x: position.x,
        y: position.y,
      },
    );
    ids[quest.id] = created.quest.id;
  }
  for (const a of next.appearances) {
    const quest = next.quests.find((q) => q.id === a.questId);
    if (!quest) throw new Error("Appearance has no quest");
    const before = appearance(old, a.pageId, a.questId);
    if (!before && !has(old.quests, quest.id) && a.pageId === quest.homePageId)
      continue;
    if (!before || before.x !== a.x || before.y !== a.y)
      await mutate(
        quest.projectId,
        `/pages/${id(a.pageId)}/quests/${id(a.questId)}`,
        before ? "PATCH" : "PUT",
        { x: a.x, y: a.y },
      );
  }
  for (const quest of next.quests) {
    const before = old.quests.find((q) => q.id === quest.id);
    if (!before) continue;
    const fields = {
      title: quest.title,
      description: quest.description,
      acceptanceCriteria: quest.acceptanceCriteria,
      workState: quest.workState,
      icon: quest.icon,
      milestone: quest.milestone,
      homePageId: id(quest.homePageId),
    };
    const previous = {
      title: before.title,
      description: before.description,
      acceptanceCriteria: before.acceptanceCriteria,
      workState: before.workState,
      icon: before.icon,
      milestone: before.milestone,
      homePageId: id(before.homePageId),
    };
    if (JSON.stringify(fields) !== JSON.stringify(previous))
      await mutate(quest.projectId, `/quests/${id(quest.id)}`, "PATCH", fields);
  }
  for (const d of old.dependencies) {
    const quest = old.quests.find((q) => q.id === d.questId);
    if (
      quest &&
      has(next.quests, d.questId) &&
      has(next.quests, d.dependsOnQuestId) &&
      !edge(next, d.questId, d.dependsOnQuestId)
    )
      await mutate(
        quest.projectId,
        `/quests/${id(d.questId)}/dependencies/${id(d.dependsOnQuestId)}`,
        "DELETE",
        {},
      );
  }
  for (const d of next.dependencies) {
    if (edge(old, d.questId, d.dependsOnQuestId)) continue;
    const quest = next.quests.find((q) => q.id === d.questId);
    if (!quest) throw new Error("Dependency has no quest");
    await mutate(
      quest.projectId,
      `/quests/${id(d.questId)}/dependencies`,
      "POST",
      { dependsOnQuestId: id(d.dependsOnQuestId) },
    );
  }
  for (const event of next.verifications.filter(
    (v) => !has(old.verifications, v.id),
  )) {
    const quest = next.quests.find((q) => q.id === event.questId);
    if (!quest) throw new Error("Verification has no quest");
    if (event.verdict !== "override" && event.verdict !== "reopen")
      throw new Error("Only manual verification changes can be persisted");
    const data = await mutate<{ verification: Verification }>(
      quest.projectId,
      `/quests/${id(quest.id)}/${event.verdict}`,
      "POST",
      event.verdict === "override"
        ? { reason: event.reasoning, confirmOverride: true }
        : { reason: event.reasoning },
    );
    ids[event.id] = data.verification.id;
  }
  for (const quest of old.quests) {
    if (!has(next.quests, quest.id) && has(next.projects, quest.projectId))
      await mutate(quest.projectId, `/quests/${id(quest.id)}`, "DELETE", {
        confirmDelete: true,
      });
  }
  for (const a of old.appearances) {
    if (
      !has(next.pages, a.pageId) ||
      !has(next.quests, a.questId) ||
      appearance(next, a.pageId, a.questId)
    )
      continue;
    const quest = next.quests.find((q) => q.id === a.questId)!;
    await mutate(
      quest.projectId,
      `/pages/${id(a.pageId)}/quests/${id(a.questId)}`,
      "DELETE",
      {},
    );
  }
  for (const page of old.pages) {
    if (!has(next.pages, page.id) && has(next.projects, page.projectId))
      await mutate(page.projectId, `/pages/${id(page.id)}`, "DELETE", {
        confirmDelete: true,
        questActions: [],
      });
  }
  for (const project of next.projects) {
    const previous = old.pins
      .filter((p) => p.projectId === project.id && has(next.quests, p.questId))
      .map((p) => p.questId);
    const desired = next.pins
      .filter((p) => p.projectId === project.id)
      .map((p) => p.questId);
    for (const questId of previous.filter((q) => !desired.includes(q)))
      await mutate(
        project.id,
        `/projects/${id(project.id)}/pins/${id(questId)}`,
        "DELETE",
        {},
      );
    for (const questId of desired.filter((q) => !previous.includes(q)))
      await mutate(
        project.id,
        `/projects/${id(project.id)}/pins/${id(questId)}`,
        "PUT",
        {},
      );
    if (JSON.stringify(previous) !== JSON.stringify(desired))
      await mutate(project.id, `/projects/${id(project.id)}/pin-order`, "PUT", {
        questIds: desired.map(id),
      });
  }
  for (const project of old.projects) {
    if (!has(next.projects, project.id)) {
      await request(`/projects/${id(project.id)}`, "DELETE", {
        confirmDelete: true,
        expectedRevision: currentRevisions[id(project.id)],
      });
      delete currentRevisions[id(project.id)];
    }
  }
  const mapped: Model = {
    projects: next.projects.map((p) => ({ ...p, id: id(p.id) })),
    pages: next.pages.map((p) => ({
      ...p,
      id: id(p.id),
      projectId: id(p.projectId),
    })),
    quests: next.quests.map((q) => ({
      ...q,
      id: id(q.id),
      projectId: id(q.projectId),
      homePageId: id(q.homePageId),
    })),
    appearances: next.appearances.map((a) => ({
      ...a,
      pageId: id(a.pageId),
      questId: id(a.questId),
    })),
    dependencies: next.dependencies.map((d) => ({
      ...d,
      questId: id(d.questId),
      dependsOnQuestId: id(d.dependsOnQuestId),
    })),
    pins: next.pins.map((p) => ({
      ...p,
      projectId: id(p.projectId),
      questId: id(p.questId),
    })),
    verifications: next.verifications.map((v) => ({
      ...v,
      id: id(v.id),
      questId: id(v.questId),
    })),
  };
  return { model: mapped, revisions: currentRevisions, ids };
}

export async function saveTreeDraft(
  old: Model,
  next: Model,
  projectId: string,
  revision: number,
): Promise<{ ids: Record<string, string>; revision: number }> {
  const operations: {
    operation: string;
    arguments: object;
    clientId?: string;
  }[] = [];
  const add = (operation: string, args: object, clientId?: string) =>
    operations.push({
      operation,
      arguments: args,
      ...(clientId ? { clientId } : {}),
    });
  const questExists = (model: Model, id: string) =>
    model.quests.some((q) => q.id === id);
  const appearance = (model: Model, pageId: string, questId: string) =>
    model.appearances.find((a) => a.pageId === pageId && a.questId === questId);
  const edge = (model: Model, questId: string, prerequisite: string) =>
    model.dependencies.some(
      (d) => d.questId === questId && d.dependsOnQuestId === prerequisite,
    );
  const fields = (quest: Quest) => ({
    title: quest.title,
    description: quest.description,
    acceptanceCriteria: quest.acceptanceCriteria,
    workState: quest.workState,
    icon: quest.icon,
    milestone: quest.milestone,
    homePageId: quest.homePageId,
  });
  for (const quest of next.quests.filter(
    (q) => q.projectId === projectId && !questExists(old, q.id),
  )) {
    const position = appearance(next, quest.homePageId, quest.id);
    if (!position) throw new Error("New quest has no home appearance");
    const { homePageId, ...otherFields } = fields(quest);
    add(
      "create_quest",
      { ...otherFields, pageId: homePageId, x: position.x, y: position.y },
      quest.id,
    );
  }
  for (const a of next.appearances) {
    const quest = next.quests.find(
      (q) => q.id === a.questId && q.projectId === projectId,
    );
    if (!quest) continue;
    const previous = appearance(old, a.pageId, a.questId);
    if (
      !previous &&
      !questExists(old, quest.id) &&
      a.pageId === quest.homePageId
    )
      continue;
    if (!previous || previous.x !== a.x || previous.y !== a.y)
      add(previous ? "update_quest_appearance" : "add_quest_to_page", a);
  }
  for (const quest of next.quests.filter((q) => q.projectId === projectId)) {
    const previous = old.quests.find((q) => q.id === quest.id);
    if (
      previous &&
      JSON.stringify(fields(previous)) !== JSON.stringify(fields(quest))
    )
      add("update_quest", { questId: quest.id, ...fields(quest) });
  }
  for (const d of old.dependencies) {
    if (
      old.quests.some((q) => q.id === d.questId && q.projectId === projectId) &&
      questExists(next, d.questId) &&
      questExists(next, d.dependsOnQuestId) &&
      !edge(next, d.questId, d.dependsOnQuestId)
    )
      add("remove_dependency", d);
  }
  for (const quest of old.quests.filter(
    (q) => q.projectId === projectId && !questExists(next, q.id),
  ))
    add("delete_quest", { questId: quest.id, confirmDelete: true });
  for (const d of next.dependencies) {
    if (
      next.quests.some(
        (q) => q.id === d.questId && q.projectId === projectId,
      ) &&
      !edge(old, d.questId, d.dependsOnQuestId)
    )
      add("add_dependency", d);
  }
  for (const a of old.appearances) {
    if (
      next.quests.some(
        (q) => q.id === a.questId && q.projectId === projectId,
      ) &&
      !appearance(next, a.pageId, a.questId)
    )
      add("remove_quest_from_page", { pageId: a.pageId, questId: a.questId });
  }
  const response = await request<{ ids: Record<string, string> }>(
    `/projects/${projectId}/tree-draft`,
    "POST",
    {
      expectedRevision: revision,
      operations,
    },
  );
  if (response.projectRevision === undefined)
    throw new Error("Missing project revision");
  return { ids: response.data.ids, revision: response.projectRevision };
}
