import { useEffect, useState, useRef } from "react";
import {
  ApiError,
  loadModel,
  loadPageGraph,
  loadPageMemberships,
  loadProjectQuests,
  loadVerificationHistory,
  persistModel,
  saveTreeDraft,
  type LoadedModel,
} from "./api";
import { Tooltip } from "radix-ui";
import { remapModelIds, statusForLoadedQuest } from "./cache";
import { formatRoute, parseRoute, type Route } from "./route";
import QuestButton from "./QuestButton";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  Position,
  ConnectionMode,
  type Node,
  type NodeProps,
  type ReactFlowInstance,
  type Viewport,
} from "@xyflow/react";
import { layoutQuests, type Layout } from "./layout";
import {
  ArrowUpRight,
  ArrowRight,
  ChevronDown,
  ChevronRight,
  GitBranch,
  Layers,
  LayoutGrid,
  Menu,
  MoreHorizontal,
  Pin,
  Plus,
  Settings,
  ShieldCheck,
  X,
  ArrowUp,
  ArrowDown,
  Pencil,
  Trash2,
  GripVertical,
} from "lucide-react";
import {
  statusForQuest,
  addDependency,
  deletePage,
  deleteQuest,
  removeAppearance,
  type Model,
  type Page,
  type Quest,
} from "./model";
import { QuestIcon } from "./icons";
import Modal from "./Modal";
import ImportProject from "./ImportProject";
import QuestEditor from "./QuestEditor";
import { QuestVerification, VerificationSettings } from "./Verification";
import { readView, restoreViewport, type SavedViewport } from "./view";
import {
  getLocale,
  getMessages,
  setLocale,
  useI18n,
  type Locale,
} from "./i18n";

type QuestNodeData = {
  quest: Quest;
  status: string;
  editMode: boolean;
  ping: boolean;
  open: () => void;
};
type QuestNode = Node<QuestNodeData, "quest">;
function QuestCard({ data }: NodeProps<QuestNode>) {
  return (
    <>
      <QuestButton
        quest={data.quest}
        status={data.status}
        onClick={data.open}
        className={data.ping ? "ping" : ""}
      />
      {(
        [
          ["left", Position.Left],
          ["right", Position.Right],
          ["top", Position.Top],
          ["bottom", Position.Bottom],
        ] as const
      ).map(([id, position]) => (
        <Handle
          key={id}
          id={id}
          type="source"
          position={position}
          isConnectable={data.editMode}
          style={{ visibility: data.editMode ? "visible" : "hidden" }}
        />
      ))}
    </>
  );
}
const nodeTypes = { quest: QuestCard };
function uid() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
function markReturnFocus() {
  document
    .querySelectorAll("[data-return-focus]")
    .forEach((el) => el.removeAttribute("data-return-focus"));
  const active = document.activeElement;
  if (active instanceof HTMLElement)
    active.setAttribute("data-return-focus", "true");
}

export default function App() {
  const t = useI18n();
  const [loaded, setLoaded] = useState<LoadedModel | null>(null);
  const [loadError, setLoadError] = useState("");
  const [attemptNumber, setAttemptNumber] = useState(0);
  useEffect(() => {
    let active = true;
    loadModel()
      .then((result) => {
        if (active) setLoaded(result);
      })
      .catch(() => {
        if (active) setLoadError(getMessages().loadError);
      });
    return () => {
      active = false;
    };
  }, [attemptNumber]);
  if (!loaded)
    return (
      <main className="connection-state" role="status">
        {loadError ? (
          <>
            <p role="alert">{loadError}</p>
            <button
              className="button button-primary"
              onClick={() => {
                setLoadError("");
                setAttemptNumber((n) => n + 1);
              }}
            >
              {t.retry}
            </button>
          </>
        ) : (
          <p>{t.loading}</p>
        )}
      </main>
    );
  return <Workspace initial={loaded} />;
}

function readRouteIds(): Record<string, string> {
  try {
    const value: unknown = JSON.parse(
      sessionStorage.getItem("miquest-route-ids") ?? "{}",
    );
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
    );
  } catch {
    return {};
  }
}
function remapRoute(route: Route, ids: Record<string, string>): Route {
  const projectId = ids[route.projectId] ?? route.projectId;
  return route.pageId
    ? {
        projectId,
        pageId: ids[route.pageId] ?? route.pageId,
        ...(route.questId
          ? { questId: ids[route.questId] ?? route.questId }
          : {}),
      }
    : { projectId };
}
function Workspace({ initial }: { initial: LoadedModel }) {
  const t = useI18n();
  const [initialView] = useState(() => readView(initial.model));
  const [initialRouteIds] = useState(readRouteIds);
  const [initialRoute] = useState(() => {
    const parsed = parseRoute(window.location.hash);
    const requested = parsed ? remapRoute(parsed, initialRouteIds) : parsed;
    const page =
      requested &&
      initial.model.pages.find(
        (item) =>
          item.id === requested.pageId &&
          item.projectId === requested.projectId,
      );
    if (
      requested &&
      (page ||
        (!requested.pageId &&
          initial.model.projects.some(
            (item) => item.id === requested.projectId,
          )))
    )
      return requested;
    const fallback = initial.model.pages.find(
      (item) => item.id === initialView.pageId,
    );
    return fallback
      ? { projectId: fallback.projectId, pageId: fallback.id }
      : undefined;
  });
  const [historySession] = useState(() =>
    typeof window.history.state?.miquest?.session === "string"
      ? window.history.state.miquest.session
      : uid(),
  );
  const historyIndex = useRef(
    typeof window.history.state?.miquest?.index === "number"
      ? window.history.state.miquest.index
      : 0,
  );
  const restoringHistory = useRef(false);
  const closingQuest = useRef(false);
  const currentCloseBack = useRef(
    window.history.state?.miquest?.closeBack === true,
  );
  const [model, setLocalModel] = useState<Model>(initial.model);
  const saved = useRef(initial);
  const [baseline, setBaseline] = useState(initial.model);
  const [saving, setSaving] = useState(false);
  const [needsReload, setNeedsReload] = useState(false);
  const savingRef = useRef(false);
  useEffect(() => {
    const dialogs = document.querySelectorAll<HTMLElement>(".modal-content");
    dialogs.forEach((dialog) => {
      dialog.inert = saving;
    });
    return () => {
      dialogs.forEach((dialog) => {
        dialog.inert = false;
      });
    };
  }, [saving]);
  const [measurements, setMeasurements] = useState<
    Record<string, { width: number; height: number }>
  >({});
  const [pageId, setPageId] = useState(
    initialRoute ? (initialRoute.pageId ?? "") : initialView.pageId,
  );
  const [emptyProject, setEmptyProject] = useState(
    initialRoute && !initialRoute.pageId ? initialRoute.projectId : "",
  );
  const [selectedId, setSelectedId] = useState<string | null>(
    initialRoute?.questId ?? null,
  );
  const [editing, setEditing] = useState(false);
  const [reviewActive, setReviewActive] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [draggedPin, setDraggedPin] = useState<string | null>(null);
  const [draft, setDraft] = useState<Quest | null>(null);
  const [management, setManagement] = useState(false);
  const [appSettings, setAppSettings] = useState(false);
  const [managementExpanded, setManagementExpanded] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [pinsOpen, setPinsOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [ping, setPing] = useState("");
  const [error, setError] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [showOverride, setShowOverride] = useState(false);
  const [dependencySource, setDependencySource] = useState("");
  const flow = useRef<ReactFlowInstance<QuestNode> | null>(null);
  const [viewports, setViewports] = useState<Record<string, SavedViewport>>(
    initialView.viewports,
  );
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const [conflicted, setConflicted] = useState(false);
  const allowUnload = useRef(false);
  const lastSavedIds = useRef<Record<string, string>>(initialRouteIds);
  function rememberRouteIds(ids: Record<string, string>) {
    lastSavedIds.current = { ...lastSavedIds.current, ...ids };
    try {
      sessionStorage.setItem(
        "miquest-route-ids",
        JSON.stringify(lastSavedIds.current),
      );
    } catch {
      /* Storage is optional. */
    }
  }
  const [loadedPages, setLoadedPages] = useState<Set<string>>(() => new Set());
  const pageRevisions = useRef<Record<string, number>>({});
  const graphRequests = useRef(
    new Map<string, ReturnType<typeof loadPageGraph>>(),
  );
  const historyRequests = useRef(
    new Map<string, ReturnType<typeof loadVerificationHistory>>(),
  );
  const [histories, setHistories] = useState<Set<string>>(() => new Set());
  const [graphError, setGraphError] = useState("");
  const [historyError, setHistoryError] = useState("");
  const [graphAttempt, setGraphAttempt] = useState(0);
  const [historyAttempt, setHistoryAttempt] = useState(0);
  useEffect(() => {
    if (!ping || !loadedPages.has(pageId)) return;
    const focus = window.setTimeout(() => {
      flow.current?.fitView({
        nodes: [{ id: ping }],
        duration: 450,
        maxZoom: 1,
      });
      document
        .querySelector<HTMLElement>(`[data-id="${ping}"] button`)
        ?.focus();
    }, 100);
    const clear = window.setTimeout(() => setPing(""), 3000);
    return () => {
      window.clearTimeout(focus);
      window.clearTimeout(clear);
    };
  }, [ping, pageId, loadedPages]);
  useEffect(() => {
    if (!pageId || saving || loadedPages.has(pageId)) return;
    let active = true;
    let request = graphRequests.current.get(pageId);
    if (!request) {
      request = loadPageGraph(pageId);
      graphRequests.current.set(pageId, request);
    }
    request
      .then(({ model: fragment, revision }) => {
        if (!active) return;
        const mergeBy = <T,>(
          old: T[],
          incoming: T[],
          key: (item: T) => string,
        ) => {
          const result = new Map(old.map((item) => [key(item), item]));
          incoming.forEach((item) => result.set(key(item), item));
          return [...result.values()];
        };
        const base = saved.current.model;
        const projectId = fragment.pages[0].projectId;
        const localIds = new Set(
          fragment.appearances
            .filter((a) => a.pageId === pageId)
            .map((a) => a.questId),
        );
        const merged: Model = {
          ...base,
          projects: mergeBy(base.projects, fragment.projects, (p) => p.id),
          pages: mergeBy(base.pages, fragment.pages, (p) => p.id),
          quests: mergeBy(base.quests, fragment.quests, (q) => q.id),
          appearances: mergeBy(
            base.appearances.filter(
              (a) => a.pageId !== pageId && !localIds.has(a.questId),
            ),
            fragment.appearances,
            (a) => `${a.pageId}:${a.questId}`,
          ),
          dependencies: mergeBy(
            base.dependencies.filter(
              (d) =>
                !localIds.has(d.questId) && !localIds.has(d.dependsOnQuestId),
            ),
            fragment.dependencies,
            (d) => `${d.questId}:${d.dependsOnQuestId}`,
          ),
          pins: [
            ...base.pins.filter((p) => p.projectId !== projectId),
            ...fragment.pins,
          ],
        };
        pageRevisions.current[pageId] = revision;
        saved.current = {
          model: merged,
          revisions: { ...saved.current.revisions, [projectId]: revision },
        };
        setBaseline(merged);
        setLocalModel(merged);
        setLoadedPages((pages) => new Set([...pages, pageId]));
        const requested = parseRoute(window.location.hash);
        if (
          requested?.pageId === pageId &&
          requested.questId &&
          !merged.appearances.some(
            (a) => a.pageId === pageId && a.questId === requested.questId,
          )
        ) {
          setSelectedId(null);
          window.history.replaceState(
            window.history.state,
            "",
            formatRoute({ projectId, pageId }),
          );
        }
        setGraphError("");
      })
      .catch(() => {
        graphRequests.current.delete(pageId);
        if (active) setGraphError(getMessages().loadError);
      });
    return () => {
      active = false;
    };
  }, [pageId, loadedPages, graphAttempt, saving]);
  useEffect(() => {
    if (!selectedId || histories.has(selectedId)) return;
    // New quests have no server history yet.
    if (!saved.current.model.quests.some((q) => q.id === selectedId)) return;
    let active = true;
    let request = historyRequests.current.get(selectedId);
    if (!request) {
      request = loadVerificationHistory(selectedId);
      historyRequests.current.set(selectedId, request);
    }
    request
      .then(({ items }) => {
        if (!active) return;
        const merge = (value: Model): Model => ({
          ...value,
          verifications: [
            ...value.verifications.filter((v) => v.questId !== selectedId),
            ...items,
          ],
        });
        saved.current = { ...saved.current, model: merge(saved.current.model) };
        setBaseline(saved.current.model);
        setLocalModel(merge);
        setHistories((values) => new Set([...values, selectedId]));
        setHistoryError("");
      })
      .catch(() => {
        historyRequests.current.delete(selectedId);
        if (active) setHistoryError(getMessages().historyError);
      });
    return () => {
      active = false;
    };
  }, [selectedId, histories, historyAttempt, loadedPages]);
  const dirty = JSON.stringify(model) !== JSON.stringify(baseline);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      if (!allowUnload.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  useEffect(() => {
    const hash = initialRoute ? formatRoute(initialRoute) : "#/";
    window.history.replaceState(
      {
        miquest: {
          session: historySession,
          index: historyIndex.current,
          closeBack:
            window.history.state?.miquest?.session === historySession &&
            window.history.state.miquest.closeBack === true,
        },
      },
      "",
      hash,
    );
  }, [historySession, initialRoute]);
  function writeRoute(
    route: Route | undefined,
    mode: "push" | "replace",
    closeBack = false,
  ) {
    const hash = route ? formatRoute(route) : "#/";
    if (mode === "push" && window.location.hash === hash) return;
    if (mode === "push") {
      historyIndex.current += 1;
      currentCloseBack.current = closeBack;
      window.history.pushState(
        {
          miquest: {
            session: historySession,
            index: historyIndex.current,
            closeBack,
          },
        },
        "",
        hash,
      );
    } else {
      window.history.replaceState(window.history.state, "", hash);
    }
  }
  function leaveDraft(nextRoute?: Route): boolean {
    if (!dirty) return true;
    if (!window.confirm(t.leaveDraftConfirm)) return false;
    if (conflicted) {
      allowUnload.current = true;
      if (nextRoute) writeRoute(nextRoute, "replace");
      window.location.reload();
      return false;
    }
    setLocalModel(saved.current.model);
    setError("");
    return true;
  }
  function refreshAfterReview() {
    if (dirty) {
      setConflicted(true);
      return;
    }
    graphRequests.current.delete(pageId);
    historyRequests.current.delete(selectedId ?? "");
    setLoadedPages(
      (pages) => new Set([...pages].filter((id) => id !== pageId)),
    );
    setHistories(
      (items) => new Set([...items].filter((id) => id !== selectedId)),
    );
  }
  function setModel(next: Model) {
    if (!savingRef.current) setLocalModel(next);
  }
  function guard(action: () => void) {
    if (dirty) setPendingAction(() => action);
    else action();
  }
  async function saveDraft(): Promise<boolean> {
    if (!project || savingRef.current || conflicted) return false;
    savingRef.current = true;
    setSaving(true);
    try {
      const result = await saveTreeDraft(
        saved.current.model,
        model,
        project.id,
        saved.current.revisions[project.id],
      );
      rememberRouteIds(result.ids);
      const remapped = remapModelIds(model, result.ids);
      for (const page of model.pages) {
        if (
          page.projectId === project.id &&
          pageRevisions.current[page.id] === saved.current.revisions[project.id]
        )
          pageRevisions.current[page.id] = result.revision;
      }
      saved.current = {
        model: remapped,
        revisions: {
          ...saved.current.revisions,
          [project.id]: result.revision,
        },
      };
      setBaseline(remapped);
      setLocalModel(remapped);
      setSelectedId((id) => (id ? (result.ids[id] ?? id) : null));
      const route = parseRoute(window.location.hash);
      if (route?.questId && result.ids[route.questId])
        writeRoute({ ...route, questId: result.ids[route.questId] }, "replace");
      setError("");
      return true;
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === "stale_revision") {
        setConflicted(true);
        setError(t.draftConflict);
      } else
        setError(
          cause instanceof Error
            ? `${t.draftSaveError} ${cause.message}`
            : t.draftSaveError,
        );
      return false;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }
  function discardDraft() {
    if (conflicted) {
      allowUnload.current = true;
      window.location.reload();
      return false;
    }
    setLocalModel(saved.current.model);
    setError("");
    return true;
  }
  function setImmediateModel(next: Model) {
    if (savingRef.current) return;
    savingRef.current = true;
    graphRequests.current.clear();
    setSaving(true);
    setLocalModel(next);
    void persistModel(saved.current.model, next, saved.current.revisions)
      .then((result) => {
        rememberRouteIds(result.ids);
        for (const tree of result.model.pages) {
          const oldRevision = saved.current.revisions[tree.projectId];
          if (pageRevisions.current[tree.id] === oldRevision)
            pageRevisions.current[tree.id] = result.revisions[tree.projectId];
        }
        saved.current = result;
        setBaseline(result.model);
        setLocalModel(result.model);
        setViewports((views) =>
          Object.fromEntries(
            Object.entries(views).map(([id, view]) => [
              result.ids[id] ?? id,
              view,
            ]),
          ),
        );
        try {
          const view = JSON.parse(localStorage.getItem("miquest-view") ?? "{}");
          if (result.ids[view.pageId]) {
            view.pageId = result.ids[view.pageId];
            view.viewports = Object.fromEntries(
              Object.entries(view.viewports ?? {}).map(([id, viewport]) => [
                result.ids[id] ?? id,
                viewport,
              ]),
            );
            localStorage.setItem("miquest-view", JSON.stringify(view));
          }
        } catch {
          // View restoration is optional when browser storage is unavailable.
        }
        const route = parseRoute(window.location.hash);
        if (
          route &&
          (result.ids[route.projectId] ||
            (route.pageId && result.ids[route.pageId]) ||
            (route.questId && result.ids[route.questId]))
        )
          writeRoute(remapRoute(route, result.ids), "replace");
        setPageId((id) => result.ids[id] ?? id);
        setEmptyProject((id) => result.ids[id] ?? id);
        setManagementExpanded((ids) => ids.map((id) => result.ids[id] ?? id));
        setSelectedId((id) => (id ? (result.ids[id] ?? id) : null));
        setError("");
      })
      .catch(async (cause: unknown) => {
        try {
          const latest = await loadModel();
          saved.current = latest;
          graphRequests.current.clear();
          historyRequests.current.clear();
          pageRevisions.current = {};
          setLoadedPages(new Set());
          setHistories(new Set());
          setBaseline(latest.model);
          setLocalModel(latest.model);
          setPageId((id) =>
            latest.model.pages.some((page) => page.id === id)
              ? id
              : (latest.model.pages[0]?.id ?? ""),
          );
          setError(
            cause instanceof ApiError && cause.code === "stale_revision"
              ? "This change was not saved because the project changed elsewhere. The latest data was reloaded; earlier steps may have been saved."
              : cause instanceof Error
                ? `${cause.message} The latest data was reloaded. Some changes may have been saved before the error; please review them.`
                : t.saveError,
          );
        } catch {
          setError(t.saveReloadError);
          setNeedsReload(true);
        }
      })
      .finally(() => {
        savingRef.current = false;
        setSaving(false);
      });
  }
  const page = model.pages.find((p) => p.id === pageId);
  useEffect(() => {
    document.title = page ? `${page.name} -- MiQuest` : "MiQuest";
  }, [page?.name]);
  const project =
    model.projects.find((p) => p.id === (page?.projectId ?? emptyProject)) ??
    model.projects[0];
  function openManagement(projectId = project?.id) {
    setManagementExpanded(projectId ? [projectId] : []);
    setManagement(true);
  }
  const selected = model.quests.find((q) => q.id === selectedId);
  const projectQuests = model.quests.filter((q) => q.projectId === project?.id);
  const appearances = model.appearances.filter((a) => a.pageId === pageId);
  const pageQuests = model.quests.filter((q) =>
    appearances.some((a) => a.questId === q.id),
  );
  const currentPins = model.pins.filter((p) => p.projectId === project?.id);
  function saveView(id: string, viewport?: Viewport) {
    const bounds = document
      .querySelector(".canvas-section")
      ?.getBoundingClientRect();
    const nextViewports = viewport
      ? {
          ...viewports,
          [id]: { ...viewport, width: bounds?.width, height: bounds?.height },
        }
      : viewports;
    if (viewport) setViewports(nextViewports);
    try {
      localStorage.setItem(
        "miquest-view",
        JSON.stringify({ pageId: id, viewports: nextViewports }),
      );
    } catch {
      /* View restoration is optional when browser storage is unavailable. */
    }
  }
  function navigate(id: string, routeProjectId?: string) {
    const targetProject =
      model.pages.find((p) => p.id === id)?.projectId ??
      routeProjectId ??
      project?.id;
    const target = targetProject
      ? id
        ? { projectId: targetProject, pageId: id }
        : { projectId: targetProject }
      : undefined;
    if (
      (id !== pageId || (!id && targetProject !== emptyProject)) &&
      !leaveDraft(target)
    )
      return;
    if (!id && targetProject) setEmptyProject(targetProject);
    navigateNow(id, "push", routeProjectId);
  }
  function navigateNow(
    id: string,
    mode: "push" | "none" = "push",
    routeProjectId?: string,
  ) {
    const destination =
      saved.current.model.pages.find((p) => p.id === id) ??
      model.pages.find((p) => p.id === id);
    if (mode === "push") {
      const projectId = destination?.projectId ?? routeProjectId ?? project?.id;
      writeRoute(
        projectId
          ? id
            ? { projectId, pageId: id }
            : { projectId }
          : undefined,
        "push",
      );
    }
    if (destination && pageRevisions.current[id] !== undefined)
      saved.current.revisions[destination.projectId] =
        pageRevisions.current[id];
    setGraphError("");
    setPageId(id);
    saveView(id);
    setDrawer(false);
    if (drawer)
      requestAnimationFrame(() =>
        document.querySelector<HTMLElement>(".mobile-menu")?.focus(),
      );
    setSelectedId(null);
    setEditing(false);
    setError("");
  }
  function openQuest(id: string) {
    markReturnFocus();
    if (page && selectedId !== id)
      writeRoute(
        { projectId: page.projectId, pageId, questId: id },
        "push",
        true,
      );
    setSelectedId(id);
    setEditing(false);
    setError("");
    setShowOverride(false);
    setOverrideReason("");
  }
  function goHome(q: Quest) {
    if (
      q.homePageId !== pageId &&
      !leaveDraft({ projectId: q.projectId, pageId: q.homePageId })
    )
      return;
    goHomeNow(q);
  }
  function goHomeNow(q: Quest) {
    navigateNow(q.homePageId);
    setPing(q.id);
    setPinsOpen(false);
  }
  function attempt(action: () => void) {
    try {
      action();
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    }
  }
  const questLists = useRef(new Map<string, number>());
  function handleLookupError(cause: unknown) {
    if (cause instanceof ApiError && cause.code === "stale_revision") {
      setConflicted(true);
      setError(dirty ? t.draftConflict : t.refreshNeeded);
    } else setError(t.loadError);
  }
  async function prepareQuestList(projectId: string) {
    if (
      questLists.current.get(projectId) === saved.current.revisions[projectId]
    )
      return;
    const { quests, revision } = await loadProjectQuests(projectId);
    if (revision !== saved.current.revisions[projectId]) {
      throw new ApiError("stale_revision", t.draftConflict, 409);
    }
    const addMissing = (value: Model): Model => ({
      ...value,
      quests: [
        ...value.quests,
        ...quests.filter((q) => !value.quests.some((old) => old.id === q.id)),
      ],
    });
    saved.current = {
      ...saved.current,
      model: addMissing(saved.current.model),
    };
    setBaseline(saved.current.model);
    setLocalModel(addMissing);
    questLists.current.set(projectId, revision);
  }
  function newQuest() {
    if (!editMode || !page || !project) return;
    void prepareQuestList(project.id)
      .then(() => newQuestReady())
      .catch(handleLookupError);
  }
  function newQuestReady() {
    if (!page || !project) return;
    markReturnFocus();
    setDraft({
      id: uid(),
      projectId: project.id,
      title: "",
      description: "",
      acceptanceCriteria: "",
      icon: "compass",
      milestone: false,
      homePageId: page.id,
      workState: "not_started",
      completionState: "none",
    });
    setError("");
  }
  function autoLayout() {
    const positions = layoutQuests(
      pageQuests,
      model.dependencies,
      page?.layout ?? "branching",
    );
    setModel({
      ...model,
      appearances: model.appearances.map((appearance) =>
        appearance.pageId === pageId && positions[appearance.questId]
          ? { ...appearance, ...positions[appearance.questId] }
          : appearance,
      ),
    });
    window.setTimeout(
      () => flow.current?.fitView({ padding: 0.22, duration: 400 }),
      50,
    );
  }
  const nodes: QuestNode[] = appearances.flatMap((a) => {
    const q = model.quests.find((q) => q.id === a.questId);
    if (!q) return [];
    return [
      {
        id: q.id,
        type: "quest",
        position: { x: a.x, y: a.y },
        measured: measurements[q.id],
        width: q.milestone ? 72 : 52,
        height: q.milestone ? 72 : 52,
        data: {
          quest: q,
          status: statusForQuest(model, q.id),
          editMode,
          ping: ping === q.id,
          open: () => openQuest(q.id),
        },
      },
    ];
  });
  const visibleIds = new Set(nodes.map((n) => n.id));
  const edges = model.dependencies
    .filter(
      (d) => visibleIds.has(d.questId) && visibleIds.has(d.dependsOnQuestId),
    )
    .map((d) => {
      const source = nodes.find((n) => n.id === d.dependsOnQuestId)!;
      const target = nodes.find((n) => n.id === d.questId)!;
      const dx =
        target.position.x +
        target.width! / 2 -
        source.position.x -
        source.width! / 2;
      const dy =
        target.position.y +
        target.height! / 2 -
        source.position.y -
        source.height! / 2;
      const horizontal = Math.abs(dx) > Math.abs(dy);
      return {
        id: `${d.dependsOnQuestId}-${d.questId}`,
        source: d.dependsOnQuestId,
        target: d.questId,
        type: "default",
        animated: true,
        sourceHandle: horizontal
          ? dx > 0
            ? "right"
            : "left"
          : dy > 0
            ? "bottom"
            : "top",
        targetHandle: horizontal
          ? dx > 0
            ? "left"
            : "right"
          : dy > 0
            ? "top"
            : "bottom",
        className:
          model.quests.find((q) => q.id === d.dependsOnQuestId)
            ?.completionState !== "none"
            ? "edge-complete"
            : "",
      };
    });
  const external = model.dependencies
    .filter(
      (d) => visibleIds.has(d.questId) && !visibleIds.has(d.dependsOnQuestId),
    )
    .map((d) => model.quests.find((q) => q.id === d.dependsOnQuestId)!)
    .filter(Boolean);
  function togglePin(q: Quest) {
    guard(() => {
      const current = saved.current.model;
      const questId = lastSavedIds.current[q.id] ?? q.id;
      if (!current.quests.some((quest) => quest.id === questId)) return;
      setImmediateModel({
        ...current,
        pins: current.pins.some((p) => p.questId === questId)
          ? current.pins.filter((p) => p.questId !== questId)
          : [...current.pins, { questId, projectId: q.projectId }],
      });
    });
  }
  function movePin(questId: string, direction: number) {
    guard(() => {
      const current = saved.current.model;
      const pins = [...current.pins];
      const index = pins.findIndex((p) => p.questId === questId);
      const sameProject = pins.filter((p) => p.projectId === project?.id);
      const otherId =
        sameProject[
          sameProject.findIndex((p) => p.questId === questId) + direction
        ]?.questId;
      const other = pins.findIndex((p) => p.questId === otherId);
      if (index >= 0 && other >= 0) {
        [pins[index], pins[other]] = [pins[other], pins[index]];
        setImmediateModel({ ...current, pins });
      }
    });
  }
  function movePinTo(questId: string, targetId: string) {
    guard(() => {
      const current = saved.current.model;
      const pins = [...current.pins];
      const from = pins.findIndex((p) => p.questId === questId);
      const to = pins.findIndex((p) => p.questId === targetId);
      if (from >= 0 && to >= 0) {
        const [moved] = pins.splice(from, 1);
        pins.splice(to, 0, moved);
        setImmediateModel({ ...current, pins });
      }
    });
  }
  async function removeTree(tree: Page) {
    try {
      const preview = await loadPageMemberships(tree.id);
      if (saved.current.revisions[tree.projectId] !== preview.revision) {
        setError(t.draftConflict);
        return;
      }
      const base = saved.current.model;
      const quests = new Map(base.quests.map((q) => [q.id, q]));
      preview.quests.forEach((q) => quests.set(q.id, q));
      const appearances = new Map(
        base.appearances.map((a) => [`${a.pageId}:${a.questId}`, a]),
      );
      preview.appearances.forEach((a) =>
        appearances.set(`${a.pageId}:${a.questId}`, a),
      );
      const expanded = {
        ...base,
        quests: [...quests.values()],
        appearances: [...appearances.values()],
      };
      const destinations = expanded.pages.filter(
        (item) => item.projectId === tree.projectId && item.id !== tree.id,
      );
      let destination: string | undefined;
      const orphans = preview.appearances.some(
        (a) =>
          a.pageId === tree.id &&
          !preview.appearances.some(
            (b) => b.questId === a.questId && b.pageId !== tree.id,
          ),
      );
      if (orphans) {
        if (!destinations.length) throw new Error(t.lastTreeError);
        const choice = window.prompt(
          t.moveOrphans(
            destinations
              .map((item, index) => `${index + 1}: ${item.name}`)
              .join(", "),
          ),
          "1",
        );
        if (choice === null) return;
        destination = destinations[Number(choice) - 1]?.id;
        if (!destination) throw new Error(t.invalidTree);
      }
      if (!window.confirm(t.deleteTreeConfirm(tree.name))) return;
      const next = deletePage(expanded, tree.id, destination);
      saved.current = { ...saved.current, model: expanded };
      setBaseline(expanded);
      setImmediateModel(next);
      setEmptyProject(tree.projectId);
      if (pageId === tree.id)
        navigateNow(
          next.pages.find((item) => item.projectId === tree.projectId)?.id ??
            "",
        );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.loadError);
    }
  }
  function closeQuest() {
    const historyState = window.history.state?.miquest;
    if (historyState?.session === historySession && historyState.closeBack) {
      if (closingQuest.current) return;
      closingQuest.current = true;
      window.history.back();
      return;
    }
    if (page) writeRoute({ projectId: page.projectId, pageId }, "replace");
    setSelectedId(null);
    setEditing(false);
    setError("");
  }
  useEffect(() => {
    const onPopState = (event: PopStateEvent) => {
      closingQuest.current = false;
      if (restoringHistory.current) {
        restoringHistory.current = false;
        return;
      }
      const parsed = parseRoute(window.location.hash);
      const requested = parsed
        ? remapRoute(parsed, lastSavedIds.current)
        : parsed;
      const destination =
        requested &&
        (requested.pageId
          ? model.pages.some(
              (item) =>
                item.id === requested.pageId &&
                item.projectId === requested.projectId,
            )
          : model.projects.some((item) => item.id === requested.projectId));
      const target = destination ? requested : undefined;
      const fallback =
        model.pages.find((item) => item.id === initialView.pageId) ??
        model.pages[0];
      const targetPage = target ? (target.pageId ?? "") : (fallback?.id ?? "");
      const state = event.state?.miquest as
        { session?: string; index?: number; closeBack?: boolean } | undefined;
      const targetIndex =
        state?.session === historySession && typeof state?.index === "number"
          ? state.index
          : undefined;
      const restore = () => {
        if (targetIndex !== undefined && targetIndex !== historyIndex.current) {
          restoringHistory.current = true;
          window.history.go(historyIndex.current - targetIndex);
        } else {
          const current = model.pages.find((p) => p.id === pageId);
          const route: Route | undefined = current
            ? {
                projectId: current.projectId,
                pageId,
                ...(selectedId ? { questId: selectedId } : {}),
              }
            : emptyProject
              ? { projectId: emptyProject }
              : undefined;
          window.history.replaceState(
            {
              miquest: {
                session: historySession,
                index: historyIndex.current,
                closeBack: currentCloseBack.current,
              },
            },
            "",
            route ? formatRoute(route) : "#/",
          );
        }
      };
      if (savingRef.current) {
        restore();
        return;
      }
      if (
        (targetPage !== pageId ||
          (!targetPage && target?.projectId !== emptyProject)) &&
        !leaveDraft(target)
      ) {
        if (!allowUnload.current) restore();
        return;
      }
      currentCloseBack.current =
        state?.session === historySession && state?.closeBack === true;
      if (targetIndex !== undefined) historyIndex.current = targetIndex;
      else
        window.history.replaceState(
          {
            miquest: {
              session: historySession,
              index: historyIndex.current,
              closeBack: false,
            },
          },
          "",
          window.location.href,
        );
      if (target && formatRoute(target) !== window.location.hash)
        writeRoute(target, "replace");
      if (target && !target.pageId) setEmptyProject(target.projectId);
      navigateNow(targetPage, "none");
      const validQuest =
        target?.questId &&
        (!loadedPages.has(targetPage) ||
          model.appearances.some(
            (a) => a.pageId === targetPage && a.questId === target.questId,
          ));
      setSelectedId(validQuest ? target.questId! : null);
      if (target?.questId && !validQuest)
        writeRoute(
          { projectId: target.projectId, pageId: targetPage },
          "replace",
        );
      if (!target && fallback)
        writeRoute(
          { projectId: fallback.projectId, pageId: fallback.id },
          "replace",
        );
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  });
  if (needsReload)
    return (
      <main className="connection-state">
        <p role="alert">{error}</p>
        <button
          className="button button-primary"
          onClick={() => window.location.reload()}
        >
          {t.retry}
        </button>
      </main>
    );
  return (
    <Tooltip.Provider delayDuration={180} skipDelayDuration={100}>
      {importing && <ImportProject onClose={() => setImporting(false)} />}
      {saving && (
        <div className="save-status" role="status">
          {t.saving}
        </div>
      )}
      <div
        className={`app-shell ${editMode ? "edit-mode" : ""}`}
        inert={saving}
      >
        {drawer && (
          <button
            className="drawer-scrim"
            aria-label={t.closeNavigation}
            onClick={() => setDrawer(false)}
          />
        )}
        <aside
          id="navigation"
          aria-label={t.navigation}
          className={`sidebar ${drawer ? "is-open" : ""}`}
          onKeyDown={(event) => {
            if (!drawer) return;
            if (event.key === "Escape") {
              setDrawer(false);
              requestAnimationFrame(() =>
                document.querySelector<HTMLElement>(".mobile-menu")?.focus(),
              );
            }
            if (event.key === "Tab") {
              const items = event.currentTarget.querySelectorAll<HTMLElement>(
                "button:not(:disabled), a[href]",
              );
              const first = items[0];
              const last = items[items.length - 1];
              if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last?.focus();
              } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first?.focus();
              }
            }
          }}
        >
          <a className="brand" href="#" onClick={(e) => e.preventDefault()}>
            <span className="brand-symbol">
              <GitBranch size={24} />
            </span>
            miquest<span className="brand-dot">.</span>
          </a>
          <div className="nav-heading">
            {t.progressions.toUpperCase()}
            {editMode && (
              <button
                className="icon-button"
                aria-label={t.manageProgressions}
                onClick={() => {
                  guard(() => {
                    markReturnFocus();
                    if (project)
                      void prepareQuestList(project.id).catch(
                        handleLookupError,
                      );
                    openManagement();
                  });
                }}
              >
                <Plus size={15} />
              </button>
            )}
          </div>
          <nav aria-label={t.progressions}>
            {model.projects.map((p) => (
              <div className="nav-project" key={p.id}>
                <button
                  className={`project-button ${p.id === project?.id ? "current" : ""}`}
                  onClick={() => {
                    if (collapsed.includes(p.id))
                      setCollapsed(collapsed.filter((id) => id !== p.id));
                    else setCollapsed([...collapsed, p.id]);
                    if (!model.pages.some((page) => page.projectId === p.id)) {
                      navigate("", p.id);
                    }
                  }}
                >
                  <span className="project-symbol">
                    <Layers size={16} />
                  </span>
                  <span>{p.name}</span>
                  {collapsed.includes(p.id) ? (
                    <ChevronRight size={14} />
                  ) : (
                    <ChevronDown size={14} />
                  )}
                </button>
                {!collapsed.includes(p.id) && (
                  <div className="tree-list">
                    {model.pages
                      .filter((tree) => tree.projectId === p.id)
                      .map((tree) => (
                        <button
                          className={pageId === tree.id ? "active" : ""}
                          key={tree.id}
                          onClick={() => navigate(tree.id)}
                        >
                          <GitBranch size={14} />
                          <span>{tree.name}</span>
                          {pageId === tree.id && (
                            <span className="active-dot" />
                          )}
                        </button>
                      ))}
                    {editMode && (
                      <button
                        className="new-tree"
                        onClick={() => {
                          guard(() => {
                            setEmptyProject(p.id);
                            markReturnFocus();
                            if (project)
                              void prepareQuestList(project.id).catch(
                                handleLookupError,
                              );
                            openManagement(p.id);
                          });
                        }}
                      >
                        <Plus size={13} /> {t.newTree}
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </nav>
          <button
            className="settings-button app-settings-button"
            onClick={() =>
              guard(() => {
                markReturnFocus();
                setAppSettings(true);
              })
            }
          >
            <Settings size={17} /> {t.appSettings}
          </button>
          {editMode && (
            <button
              className="settings-button"
              onClick={() =>
                guard(() => {
                  markReturnFocus();
                  setImporting(true);
                })
              }
            >
              {t.importProject}
            </button>
          )}
          {editMode && (
            <button
              className="settings-button"
              onClick={() => {
                guard(() => {
                  markReturnFocus();
                  if (project)
                    void prepareQuestList(project.id).catch(handleLookupError);
                  openManagement();
                });
              }}
            >
              <Settings size={17} /> {t.settings}
              <MoreHorizontal size={17} />
            </button>
          )}
        </aside>
        <main className="main" inert={drawer || undefined}>
          <header className={`topbar ${dirty ? "has-draft" : ""}`}>
            <button
              className="icon-button mobile-menu"
              aria-label={t.openNavigation}
              aria-expanded={drawer}
              aria-controls="navigation"
              onClick={() => {
                setDrawer(true);
                requestAnimationFrame(() =>
                  document
                    .querySelector<HTMLElement>(".sidebar .brand")
                    ?.focus(),
                );
              }}
            >
              <Menu size={20} />
            </button>
            <div className="breadcrumbs">
              <Layers size={16} />
              <span>{project?.name ?? t.workspace}</span>
              <ChevronRight size={13} />
              <strong>{page?.name ?? t.noTree}</strong>
            </div>
            <div className="top-actions">
              {conflicted && !dirty && (
                <button
                  className="button button-secondary"
                  onClick={() => window.location.reload()}
                >
                  {t.retry}
                </button>
              )}
              {dirty && (
                <>
                  <button
                    className="button button-secondary"
                    onClick={() => discardDraft()}
                  >
                    {t.discardChanges}
                  </button>
                  <button
                    className="button button-primary"
                    disabled={conflicted}
                    onClick={() => void saveDraft()}
                  >
                    {t.saveChanges}
                  </button>
                </>
              )}
              {editMode && (
                <>
                  <select
                    className="layout-select"
                    aria-label={t.layoutLabel}
                    value={page?.layout ?? "branching"}
                    disabled={!page || !loadedPages.has(pageId)}
                    onChange={(event) =>
                      setModel({
                        ...model,
                        pages: model.pages.map((item) =>
                          item.id === pageId
                            ? { ...item, layout: event.target.value as Layout }
                            : item,
                        ),
                      })
                    }
                  >
                    <option value="branching">{t.branching}</option>
                    <option value="radial">{t.radial}</option>
                    <option value="spiral">{t.spiral}</option>
                  </select>
                  <button
                    className="button button-quiet layout-action"
                    onClick={autoLayout}
                    disabled={!nodes.length}
                  >
                    <LayoutGrid size={15} />
                    <span>{t.autoLayout}</span>
                  </button>
                  <button
                    className="button button-secondary"
                    onClick={newQuest}
                    disabled={!page || !loadedPages.has(pageId)}
                  >
                    <Plus size={15} />
                    <span>{t.addQuest}</span>
                  </button>
                  <button
                    className="icon-button"
                    aria-label={t.treeActions}
                    onClick={() => {
                      guard(() => {
                        markReturnFocus();
                        if (project)
                          void prepareQuestList(project.id).catch(
                            handleLookupError,
                          );
                        openManagement();
                      });
                    }}
                  >
                    <MoreHorizontal size={18} />
                  </button>
                </>
              )}
              <button
                type="button"
                role="switch"
                aria-label={t.edit}
                aria-checked={editMode}
                className="edit-switch"
                onClick={() => {
                  if (editMode && !leaveDraft()) return;
                  {
                    setEditMode(!editMode);
                    setEditing(false);
                    setDraft(null);
                    setManagement(false);
                    setShowOverride(false);
                    setError("");
                  }
                }}
              >
                <Pencil size={13} />
                <span>{t.edit}</span>
                <span className="switch-track">
                  <span />
                </span>
              </button>
            </div>
          </header>
          <section className="canvas-section">
            <div className={`pins-panel ${pinsOpen ? "expanded" : ""}`}>
              <button
                className="pins-heading"
                aria-label={t.pinnedQuests}
                onClick={() => setPinsOpen(!pinsOpen)}
                aria-expanded={pinsOpen}
              >
                <Pin size={13} />
                <span className="pins-label">{t.pins}</span>
                <span className="pins-count">{currentPins.length}</span>
                <ChevronDown size={13} />
              </button>
              {pinsOpen && (
                <div className="pins-list">
                  {currentPins.map((pin, index) => {
                    const q = model.quests.find((q) => q.id === pin.questId);
                    return (
                      q && (
                        <div
                          className="pin-row"
                          key={q.id}
                          data-quest-id={q.id}
                          draggable
                          onDragStart={(event) => {
                            setDraggedPin(q.id);
                            event.dataTransfer.setData("text/plain", q.id);
                            event.dataTransfer.effectAllowed = "move";
                          }}
                          onDragOver={(event) => {
                            if (draggedPin) event.preventDefault();
                          }}
                          onDragEnd={() => setDraggedPin(null)}
                          onDrop={(event) => {
                            event.preventDefault();
                            if (!draggedPin || draggedPin === q.id) return;
                            movePinTo(draggedPin, q.id);
                            setDraggedPin(null);
                          }}
                        >
                          <GripVertical
                            size={12}
                            className="pin-grip"
                            aria-hidden="true"
                          />
                          <button onClick={() => goHome(q)}>
                            <span>{q.title}</span>
                            <ArrowUpRight size={13} />
                          </button>
                          <div className="pin-order">
                            <button
                              aria-label={t.movePinUp(q.title)}
                              disabled={index === 0}
                              onClick={() => movePin(q.id, -1)}
                            >
                              <ArrowUp size={12} />
                            </button>
                            <button
                              aria-label={t.movePinDown(q.title)}
                              disabled={index === currentPins.length - 1}
                              onClick={() => movePin(q.id, 1)}
                            >
                              <ArrowDown size={12} />
                            </button>
                          </div>
                        </div>
                      )
                    );
                  })}
                  {!currentPins.length && (
                    <p className="muted">{t.emptyPins}</p>
                  )}
                </div>
              )}
            </div>
            {error && !selected && !draft && !management && (
              <div className="canvas-error" role="alert">
                {error}
                <button
                  className="icon-button"
                  onClick={() => setError("")}
                  aria-label={t.dismissError}
                >
                  <X size={14} />
                </button>
              </div>
            )}
            {pageId && !loadedPages.has(pageId) ? (
              <div className="empty-state" role="status">
                <p>{graphError || t.loadingGraph}</p>
                {graphError && (
                  <button
                    className="button button-secondary"
                    onClick={() => {
                      setGraphError("");
                      setGraphAttempt((n) => n + 1);
                    }}
                  >
                    {t.retry}
                  </button>
                )}
              </div>
            ) : nodes.length ? (
              <ReactFlow<QuestNode>
                colorMode="dark"
                key={pageId}
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                nodesDraggable={editMode}
                nodesConnectable={editMode}
                elementsSelectable={editMode}
                connectionMode={ConnectionMode.Loose}
                onInit={(instance) => {
                  flow.current = instance;
                  const saved = viewports[pageId];
                  const bounds = document
                    .querySelector(".canvas-section")
                    ?.getBoundingClientRect();
                  if (saved && bounds)
                    void instance.setViewport(
                      restoreViewport(saved, bounds.width, bounds.height),
                    );
                }}
                defaultViewport={viewports[pageId]}
                fitView={!viewports[pageId]}
                fitViewOptions={{ padding: 0.25, minZoom: 0.5, maxZoom: 1.3 }}
                minZoom={0.2}
                maxZoom={2}
                onMoveEnd={(_, viewport) => saveView(pageId, viewport)}
                onNodesChange={(changes) => {
                  const dimensions = changes.filter(
                    (change) =>
                      change.type === "dimensions" && change.dimensions,
                  );
                  if (dimensions.length)
                    setMeasurements((previous) => {
                      const next = { ...previous };
                      let changed = false;
                      for (const change of dimensions) {
                        if (change.type !== "dimensions" || !change.dimensions)
                          continue;
                        const old = previous[change.id];
                        if (
                          old?.width !== change.dimensions.width ||
                          old?.height !== change.dimensions.height
                        ) {
                          next[change.id] = change.dimensions;
                          changed = true;
                        }
                      }
                      return changed ? next : previous;
                    });
                  const moves = changes.filter(
                    (change) => change.type === "position",
                  );
                  if (editMode && moves.length)
                    setLocalModel((current) => ({
                      ...current,
                      appearances: current.appearances.map((a) => {
                        const move = moves.find(
                          (change) => change.id === a.questId,
                        );
                        return a.pageId === pageId &&
                          move?.type === "position" &&
                          move.position
                          ? { ...a, x: move.position.x, y: move.position.y }
                          : a;
                      }),
                    }));
                }}
                onNodeDragStop={(_, node) => {
                  const next = {
                    ...model,
                    appearances: model.appearances.map((a) =>
                      a.pageId === pageId && a.questId === node.id
                        ? { ...a, x: node.position.x, y: node.position.y }
                        : a,
                    ),
                  };
                  setModel(next);
                }}
                onConnect={(connection) =>
                  editMode &&
                  attempt(() =>
                    setModel(
                      addDependency(
                        model,
                        connection.target,
                        connection.source,
                      ),
                    ),
                  )
                }
                onEdgeClick={(_, edge) => {
                  if (editMode && window.confirm(t.removeDependency))
                    setModel({
                      ...model,
                      dependencies: model.dependencies.filter(
                        (d) => `${d.dependsOnQuestId}-${d.questId}` !== edge.id,
                      ),
                    });
                }}
                onPaneContextMenu={(event) => {
                  if (editMode) {
                    event.preventDefault();
                    newQuest();
                  }
                }}
                deleteKeyCode={null}
                nodesFocusable={false}
                edgesFocusable={false}
              >
                <Background
                  variant={BackgroundVariant.Lines}
                  gap={20}
                  color="var(--canvas-grid)"
                />
                <Controls showInteractive={false} />
              </ReactFlow>
            ) : (
              <div className="empty-state">
                <span className="empty-icon">
                  <GitBranch size={36} />
                </span>
                <h2>{page ? t.emptyTreeTitle : t.emptyWorkspaceTitle}</h2>
                <p>{page ? t.emptyTreeText : t.emptyWorkspaceText}</p>
                <button
                  className="button button-primary"
                  onClick={
                    !editMode
                      ? () => setEditMode(true)
                      : page
                        ? newQuest
                        : () => {
                            markReturnFocus();
                            openManagement();
                          }
                  }
                >
                  <Plus size={16} />
                  {!editMode
                    ? t.enterEdit
                    : page
                      ? t.addFirstQuest
                      : t.openSettings}
                </button>
              </div>
            )}
            {external.length > 0 && (
              <div className="cross-tree">
                <span>{t.fromOtherTrees}</span>
                {[...new Map(external.map((q) => [q.id, q])).values()].map(
                  (q) => (
                    <button key={q.id} onClick={() => goHome(q)}>
                      <QuestIcon name={q.icon} size={13} />
                      {q.title}
                      <ArrowUpRight size={13} />
                    </button>
                  ),
                )}
              </div>
            )}
          </section>
        </main>
        {selected && (
          <Modal
            title={selected.title}
            icon={selected.icon}
            onClose={closeQuest}
            actions={
              <button
                className={`icon-button ${model.pins.some((p) => p.questId === selected.id) ? "is-pinned" : ""}`}
                aria-label={
                  model.pins.some((p) => p.questId === selected.id)
                    ? t.unpinQuest
                    : t.pinQuest
                }
                onClick={() => togglePin(selected)}
              >
                <Pin size={16} />
              </button>
            }
          >
            {editMode && editing ? (
              <QuestEditor
                model={model}
                quest={selected}
                onCancel={() => setEditing(false)}
                onSave={(next) => {
                  setModel(next);
                  setEditing(false);
                }}
              />
            ) : (
              <>
                <div className="relations-grid">
                  {(["prerequisites", "next"] as const).map((direction) => {
                    const related = model.dependencies
                      .filter((d) =>
                        direction === "prerequisites"
                          ? d.questId === selected.id
                          : d.dependsOnQuestId === selected.id,
                      )
                      .map((d) =>
                        model.quests.find(
                          (q) =>
                            q.id ===
                            (direction === "prerequisites"
                              ? d.dependsOnQuestId
                              : d.questId),
                        )!,
                      );
                    return (
                      <section className="relation-section" key={direction}>
                        <h2>
                          {direction === "prerequisites"
                            ? t.prerequisites
                            : t.whatsNext}
                        </h2>
                        <div className="relation-icons">
                          {related.length ? (
                            related.map((q) => (
                              <QuestButton
                                key={q.id}
                                quest={q}
                                status={statusForLoadedQuest(
                                  model,
                                  q.id,
                                  visibleIds,
                                )}
                                externalTree={
                                  !visibleIds.has(q.id)
                                    ? model.pages.find(
                                        (p) => p.id === q.homePageId,
                                      )?.name
                                    : undefined
                                }
                                onClick={() =>
                                  visibleIds.has(q.id)
                                    ? openQuest(q.id)
                                    : goHome(q)
                                }
                              />
                            ))
                          ) : (
                            <span className="relation-empty">{t.none}</span>
                          )}
                        </div>
                      </section>
                    );
                  })}
                </div>
                <div className="journal-intro">
                  <span
                    className={`status-label ${statusForQuest(model, selected.id)}`}
                  >
                    {
                      t.status[
                        statusForQuest(
                          model,
                          selected.id,
                        ) as keyof typeof t.status
                      ]
                    }
                  </span>
                  <span className="muted">
                    {
                      model.pages.find((p) => p.id === selected.homePageId)
                        ?.name
                    }
                  </span>
                  {editMode && !reviewActive && (
                    <button
                      className="button button-secondary"
                      onClick={() => {
                        void prepareQuestList(selected.projectId)
                          .then(() => setEditing(true))
                          .catch(handleLookupError);
                      }}
                    >
                      <Pencil size={13} />
                      {t.editQuest}
                    </button>
                  )}
                </div>
                {selected.completionState !== "none" &&
                  statusForQuest(model, selected.id) === "locked" && (
                    <div className="notice">
                      <ShieldCheck size={18} />
                      <span>
                        {t.previously}{" "}
                        {
                          t.status[
                            selected.completionState as keyof typeof t.status
                          ]
                        }
                        . {t.previouslyLocked}
                      </span>
                    </div>
                  )}
                <section className="quest-description">
                  <p className="description">
                    {selected.description || t.noDescription}
                  </p>
                </section>
                <section className="criteria-box">
                  <div className="eyebrow">{t.criteria}</div>
                  <p>{selected.acceptanceCriteria || t.noCriteria}</p>
                </section>
                {baseline.quests.some((q) => q.id === selected.id) && (
                  <QuestVerification
                    key={selected.id}
                    questId={selected.id}
                    disabled={dirty}
                    completed={selected.completionState !== "none"}
                    onActiveChange={setReviewActive}
                    onComplete={refreshAfterReview}
                  />
                )}
                <details className="history">
                  <summary>
                    <ShieldCheck size={17} /> {t.evidenceHistory}
                    <span>
                      {
                        model.verifications.filter(
                          (v) => v.questId === selected.id,
                        ).length
                      }{" "}
                      {t.records}
                    </span>
                    <ChevronDown size={16} />
                  </summary>
                  {!histories.has(selected.id) &&
                  baseline.quests.some((q) => q.id === selected.id) ? (
                    <p className="muted">
                      {historyError || t.loadingHistory}{" "}
                      {historyError && (
                        <button
                          onClick={() => {
                            setHistoryError("");
                            setHistoryAttempt((n) => n + 1);
                          }}
                        >
                          {t.retry}
                        </button>
                      )}
                    </p>
                  ) : model.verifications.filter(
                      (v) => v.questId === selected.id,
                    ).length ? (
                    model.verifications
                      .filter((v) => v.questId === selected.id)
                      .map((v) => (
                        <article key={v.id}>
                          <div>
                            <strong>
                              {v.verdict === "override"
                                ? t.humanOverride
                                : v.verdict === "pass"
                                  ? t.agentVerification
                                  : v.verdict}
                            </strong>
                            <time>{v.createdAt}</time>
                          </div>
                          <p>{v.reasoning}</p>
                          <small>{v.evidence}</small>
                        </article>
                      ))
                  ) : (
                    <p className="muted">{t.noHistory}</p>
                  )}
                </details>
                {editMode && !reviewActive && (
                  <div className="journal-actions">
                    <button
                      className="button button-quiet"
                      disabled={!histories.has(selected.id)}
                      onClick={() =>
                        guard(() => setShowOverride(!showOverride))
                      }
                    >
                      <ShieldCheck size={14} />
                      {t.overrideReopen}
                    </button>
                    <button
                      className="button button-quiet"
                      onClick={() =>
                        attempt(() => {
                          setModel(
                            removeAppearance(model, pageId, selected.id),
                          );
                          closeQuest();
                        })
                      }
                    >
                      {t.removeFromTree}
                    </button>
                    <button
                      className="icon-button danger"
                      aria-label={t.deleteQuest}
                      onClick={() => {
                        if (
                          window.confirm(t.deleteQuestConfirm(selected.title))
                        ) {
                          setModel(deleteQuest(model, selected.id));
                          closeQuest();
                        }
                      }}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                )}{" "}
                {editMode && !reviewActive && showOverride && (
                  <form
                    className="override-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (!overrideReason.trim()) return;
                      if (!window.confirm(t.overrideConfirm)) return;
                      setImmediateModel({
                        ...model,
                        quests: model.quests.map((q) =>
                          q.id === selected.id
                            ? { ...q, completionState: "overridden" }
                            : q,
                        ),
                        verifications: [
                          ...model.verifications,
                          {
                            id: uid(),
                            questId: selected.id,
                            verdict: "override",
                            actor: "human",
                            reasoning: overrideReason.trim(),
                            evidence: t.overrideEvidence,
                            createdAt: new Date().toISOString(),
                          },
                        ],
                      });
                      setShowOverride(false);
                      setOverrideReason("");
                    }}
                  >
                    <p className="muted">{t.overrideHelp}</p>
                    <label className="field">
                      {t.reason}
                      <textarea
                        required
                        value={overrideReason}
                        onChange={(e) => setOverrideReason(e.target.value)}
                      />
                    </label>
                    <div className="form-actions">
                      <button
                        className="button button-secondary"
                        type="button"
                        disabled={!overrideReason.trim()}
                        onClick={() => {
                          if (!window.confirm(t.reopenConfirm)) return;
                          setImmediateModel({
                            ...model,
                            quests: model.quests.map((q) =>
                              q.id === selected.id
                                ? {
                                    ...q,
                                    completionState: "none",
                                    workState: "not_started",
                                  }
                                : q,
                            ),
                            verifications: [
                              ...model.verifications,
                              {
                                id: uid(),
                                questId: selected.id,
                                verdict: "reopen",
                                actor: "human",
                                reasoning: overrideReason.trim(),
                                evidence: t.reopenEvidence,
                                createdAt: new Date().toISOString(),
                              },
                            ],
                          });
                          setShowOverride(false);
                        }}
                      >
                        {t.reopenQuest}
                      </button>
                      <button className="button button-primary">
                        {t.confirmOverride}
                      </button>
                    </div>
                  </form>
                )}
                {error && (
                  <p role="alert" className="error">
                    {error}
                    {conflicted && !dirty && (
                      <button
                        className="button button-secondary"
                        onClick={() => window.location.reload()}
                      >
                        {t.retry}
                      </button>
                    )}
                  </p>
                )}
              </>
            )}
          </Modal>
        )}
        {editMode && draft && (
          <Modal title={t.createQuest} onClose={() => setDraft(null)}>
            <QuestEditor
              model={model}
              quest={draft}
              onCancel={() => setDraft(null)}
              onSave={(next) => {
                setModel(next);
                setDraft(null);
              }}
            />
          </Modal>
        )}
        {appSettings && (
          <Modal title={t.appSettings} onClose={() => setAppSettings(false)}>
            <label className="field">
              {t.language}
              <select
                aria-label={t.language}
                value={getLocale()}
                onChange={(event) => setLocale(event.target.value as Locale)}
              >
                <option value="en">English</option>
                <option value="pl">Polski</option>
              </select>
            </label>
            <VerificationSettings />
          </Modal>
        )}
        {editMode && management && (
          <Modal
            title={t.workspaceSettings}
            onClose={() => {
              setManagement(false);
              setError("");
            }}
          >
            <p className="muted">{t.settingsIntro}</p>
            <section className="journal-section">
              <h2>{t.progressions}</h2>
              {model.projects.map((p) => (
                <div className="manage-project" key={p.id}>
                  <div className="manage-row">
                    <button
                      className="manage-project-toggle"
                      aria-expanded={managementExpanded.includes(p.id)}
                      onClick={() =>
                        setManagementExpanded((current) =>
                          current.includes(p.id)
                            ? current.filter((id) => id !== p.id)
                            : [...current, p.id],
                        )
                      }
                    >
                      {managementExpanded.includes(p.id) ? (
                        <ChevronDown size={14} />
                      ) : (
                        <ChevronRight size={14} />
                      )}
                      <Layers size={17} /> <strong>{p.name}</strong>
                    </button>
                    <button
                      className="icon-button"
                      aria-label={t.renameProgression(p.name)}
                      onClick={() => {
                        const name = window
                          .prompt(t.progressionName, p.name)
                          ?.trim();
                        if (name)
                          setImmediateModel({
                            ...model,
                            projects: model.projects.map((item) =>
                              item.id === p.id ? { ...item, name } : item,
                            ),
                          });
                      }}
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      className="icon-button danger"
                      aria-label={t.deleteProgression(p.name)}
                      onClick={() => {
                        if (!window.confirm(t.deleteProgressionConfirm(p.name)))
                          return;
                        let next = model;
                        model.quests
                          .filter((q) => q.projectId === p.id)
                          .forEach((q) => {
                            next = deleteQuest(next, q.id);
                          });
                        next = {
                          ...next,
                          projects: next.projects.filter(
                            (item) => item.id !== p.id,
                          ),
                          pages: next.pages.filter(
                            (item) => item.projectId !== p.id,
                          ),
                        };
                        setImmediateModel(next);
                        if (project?.id === p.id) {
                          setEmptyProject(next.projects[0]?.id ?? "");
                          navigate(next.pages[0]?.id ?? "");
                        }
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  {managementExpanded.includes(p.id) && (
                    <div className="manage-trees">
                      {model.pages
                        .filter((tree) => tree.projectId === p.id)
                        .map((tree) => (
                          <div className="manage-row" key={tree.id}>
                            <GitBranch size={17} />
                            <span>
                              <strong>{tree.name}</strong>
                            </span>
                            <button
                              className="icon-button"
                              aria-label={t.renameTree(tree.name)}
                              onClick={() => {
                                const name = window
                                  .prompt(t.treeName, tree.name)
                                  ?.trim();
                                if (name)
                                  setImmediateModel({
                                    ...model,
                                    pages: model.pages.map((item) =>
                                      item.id === tree.id
                                        ? { ...item, name }
                                        : item,
                                    ),
                                  });
                              }}
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              className="icon-button danger"
                              aria-label={t.deleteTree(tree.name)}
                              onClick={() => {
                                void removeTree(tree);
                              }}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        ))}
                      <form
                        className="inline-form"
                        aria-label={t.newTreeForProject(p.name)}
                        onSubmit={(e) => {
                          e.preventDefault();
                          const data = new FormData(e.currentTarget);
                          const name = String(data.get("name")).trim();
                          const projectId = p.id;
                          if (!name) return;
                          const id = uid();
                          setImmediateModel({
                            ...model,
                            pages: [...model.pages, { id, name, projectId }],
                          });
                          navigate(id, projectId);
                          e.currentTarget.reset();
                        }}
                      >
                        <input
                          name="name"
                          aria-label={t.newTreeName}
                          placeholder={t.newTreeName}
                          required
                        />
                        <button className="button button-secondary">
                          <Plus size={14} />
                          {t.create}
                        </button>
                      </form>
                    </div>
                  )}
                </div>
              ))}
              <form
                className="inline-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  const form = new FormData(e.currentTarget);
                  const name = String(form.get("name")).trim();
                  if (!name) return;
                  const id = uid();
                  setImmediateModel({
                    ...model,
                    projects: [
                      ...model.projects,
                      {
                        id,
                        name,
                        description: t.newProgressionDescription,
                      },
                    ],
                  });
                  setManagementExpanded([id]);
                  setEmptyProject(id);
                  navigate("", id);
                  e.currentTarget.reset();
                }}
              >
                <input
                  name="name"
                  aria-label={t.newProgressionName}
                  placeholder={t.newProgressionName}
                  required
                />
                <button className="button button-secondary">
                  <Plus size={14} />
                  {t.create}
                </button>
              </form>
            </section>
            <section className="journal-section">
              <h2>{t.connectQuests}</h2>
              <p className="muted">{t.connectHelp}</p>
              <form
                className="inline-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  const data = new FormData(e.currentTarget);
                  attempt(() => {
                    setModel(
                      addDependency(
                        model,
                        String(data.get("dependent")),
                        dependencySource,
                      ),
                    );
                    setManagement(false);
                  });
                }}
              >
                <select
                  aria-label={t.prerequisiteQuest}
                  value={dependencySource}
                  onChange={(e) => setDependencySource(e.target.value)}
                  required
                >
                  <option value="">{t.prerequisites}…</option>
                  {projectQuests.map((q) => (
                    <option key={q.id} value={q.id}>
                      {q.title}
                    </option>
                  ))}
                </select>
                <ArrowRight size={16} />
                <select aria-label={t.dependentQuest} name="dependent" required>
                  <option value="">{t.dependent}</option>
                  {projectQuests.map((q) => (
                    <option key={q.id} value={q.id}>
                      {q.title}
                    </option>
                  ))}
                </select>
                <button className="button button-secondary">{t.connect}</button>
              </form>
            </section>
            {error && (
              <p className="error" role="alert">
                {error}
                {conflicted && !dirty && (
                  <button
                    className="button button-secondary"
                    onClick={() => window.location.reload()}
                  >
                    {t.retry}
                  </button>
                )}
              </p>
            )}
            <div className="notice">
              <Settings size={17} />
              <span>{t.savedView}</span>
            </div>
          </Modal>
        )}
      </div>
      {pendingAction && (
        <Modal title={t.unsavedChanges} onClose={() => setPendingAction(null)}>
          <p>{t.unsavedPrompt}</p>
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <div className="form-actions">
            <button
              className="button button-quiet"
              onClick={() => setPendingAction(null)}
            >
              {t.cancel}
            </button>
            <button
              className="button button-secondary"
              onClick={() => {
                if (discardDraft()) {
                  const action = pendingAction;
                  setPendingAction(null);
                  action();
                }
              }}
            >
              {t.discardChanges}
            </button>
            <button
              className="button button-primary"
              disabled={saving || conflicted}
              onClick={() => {
                void saveDraft().then((ok) => {
                  if (ok) {
                    const action = pendingAction;
                    setPendingAction(null);
                    action();
                  }
                });
              }}
            >
              {t.saveChanges}
            </button>
          </div>
        </Modal>
      )}
    </Tooltip.Provider>
  );
}
