import type { Model, Project, Quest, Verification } from "./model";

type Revisions = Record<string, number>;
export type LoadedModel = { model: Model; revisions: Revisions };
type Result = LoadedModel;
type Envelope<T> = { data: T; projectRevision?: number };
type Graph = Omit<Model, "projects" | "verifications"> & { project: Project };
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
  const projects = (await request<Project[]>("/projects")).data;
  const model: Model = {
    projects: [],
    pages: [],
    quests: [],
    appearances: [],
    dependencies: [],
    pins: [],
    verifications: [],
  };
  const revisions: Revisions = {};
  for (const project of projects) {
    const graph = await request<Graph>(`/projects/${project.id}/graph`);
    if (graph.projectRevision === undefined)
      throw new Error("Missing project revision");
    revisions[project.id] = graph.projectRevision;
    model.projects.push(graph.data.project);
    model.pages.push(...graph.data.pages);
    model.quests.push(...graph.data.quests);
    model.appearances.push(...graph.data.appearances);
    model.dependencies.push(...graph.data.dependencies);
    model.pins.push(...graph.data.pins);
    for (const quest of graph.data.quests) {
      let after = 0;
      do {
        const history = await request<History>(
          `/quests/${quest.id}/verifications?afterSequence=${after}&limit=200`,
        );
        if (history.projectRevision !== revisions[project.id])
          throw new ApiError(
            "stale_revision",
            "Project changed while loading",
            409,
          );
        model.verifications.push(...history.data.items);
        after = history.data.nextAfterSequence ?? 0;
      } while (after);
    }
  }
  return { model, revisions };
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
  return { ...(await loadModel()), ids };
}
