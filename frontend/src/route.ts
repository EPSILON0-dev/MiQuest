export type Route =
  | { projectId: string; pageId?: never; questId?: never }
  | { projectId: string; pageId: string; questId?: string };

export function parseRoute(hash: string): Route | null | undefined {
  if (hash === "" || hash === "#" || hash === "#/") return undefined;
  const match =
    /^#\/projects\/([^/]+)(?:\/trees\/([^/]+)(?:\/quests\/([^/]+))?)?$/.exec(
      hash,
    );
  if (!match) return null;
  try {
    const projectId = decodeURIComponent(match[1]);
    if (!projectId) return null;
    if (match[2] === undefined) return { projectId };
    const pageId = decodeURIComponent(match[2]);
    const questId =
      match[3] === undefined ? undefined : decodeURIComponent(match[3]);
    if (!pageId || (match[3] !== undefined && !questId)) return null;
    return { projectId, pageId, ...(questId === undefined ? {} : { questId }) };
  } catch {
    return null;
  }
}

export function formatRoute(route: Route): string {
  const project = `#/projects/${encodeURIComponent(route.projectId)}`;
  if (route.pageId === undefined) return project;
  const tree = `${project}/trees/${encodeURIComponent(route.pageId)}`;
  return route.questId === undefined
    ? tree
    : `${tree}/quests/${encodeURIComponent(route.questId)}`;
}
