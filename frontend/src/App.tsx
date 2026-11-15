import { useEffect, useState, useRef } from "react";
import { ApiError, loadModel, persistModel, type LoadedModel } from "./api";
import { Tooltip } from "radix-ui";
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
import dagre from "@dagrejs/dagre";
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
  type Quest,
} from "./model";
import { QuestIcon } from "./icons";
import Modal from "./Modal";
import QuestEditor from "./QuestEditor";
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
  return crypto.randomUUID();
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

function Workspace({ initial }: { initial: LoadedModel }) {
  const t = useI18n();
  const [initialView] = useState(() => readView(initial.model));
  const [model, setLocalModel] = useState<Model>(initial.model);
  const saved = useRef(initial);
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
  const [pageId, setPageId] = useState(initialView.pageId);
  const [emptyProject, setEmptyProject] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [draggedPin, setDraggedPin] = useState<string | null>(null);
  const [draft, setDraft] = useState<Quest | null>(null);
  const [management, setManagement] = useState(false);
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
  function setModel(next: Model) {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setLocalModel(next);
    void persistModel(saved.current.model, next, saved.current.revisions)
      .then((result) => {
        saved.current = result;
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
        setPageId((id) => result.ids[id] ?? id);
        setEmptyProject((id) => result.ids[id] ?? id);
        setSelectedId((id) => (id ? (result.ids[id] ?? id) : null));
        setError("");
      })
      .catch(async (cause: unknown) => {
        try {
          const latest = await loadModel();
          saved.current = latest;
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
  const project =
    model.projects.find((p) => p.id === (page?.projectId ?? emptyProject)) ??
    model.projects[0];
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
  function navigate(id: string) {
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
    setSelectedId(id);
    setEditing(false);
    setError("");
    setShowOverride(false);
    setOverrideReason("");
  }
  function goHome(q: Quest) {
    navigate(q.homePageId);
    setPing(q.id);
    setPinsOpen(false);
    window.setTimeout(() => {
      flow.current?.fitView({
        nodes: [{ id: q.id }],
        duration: 450,
        maxZoom: 1,
      });
      document
        .querySelector<HTMLElement>(`[data-id="${q.id}"] button`)
        ?.focus();
    }, 100);
    window.setTimeout(() => setPing(""), 3000);
  }
  function attempt(action: () => void) {
    try {
      action();
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    }
  }
  function newQuest() {
    if (!editMode || !page || !project) return;
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
    const graph = new dagre.graphlib.Graph()
      .setGraph({ rankdir: "LR", nodesep: 35, ranksep: 55 })
      .setDefaultEdgeLabel(() => ({}));
    pageQuests.forEach((q) => {
      const size = q.milestone ? 72 : 52;
      graph.setNode(q.id, { width: size, height: size });
    });
    model.dependencies
      .filter(
        (d) =>
          pageQuests.some((q) => q.id === d.questId) &&
          pageQuests.some((q) => q.id === d.dependsOnQuestId),
      )
      .forEach((d) => graph.setEdge(d.dependsOnQuestId, d.questId));
    dagre.layout(graph);
    setModel({
      ...model,
      appearances: model.appearances.map((a) =>
        a.pageId === pageId
          ? {
              ...a,
              x:
                graph.node(a.questId).x -
                (model.quests.find((q) => q.id === a.questId)?.milestone
                  ? 36
                  : 26),
              y:
                graph.node(a.questId).y -
                (model.quests.find((q) => q.id === a.questId)?.milestone
                  ? 36
                  : 26),
            }
          : a,
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
    setModel({
      ...model,
      pins: model.pins.some((p) => p.questId === q.id)
        ? model.pins.filter((p) => p.questId !== q.id)
        : [...model.pins, { questId: q.id, projectId: q.projectId }],
    });
  }
  function movePin(questId: string, direction: number) {
    const pins = [...model.pins];
    const index = pins.findIndex((p) => p.questId === questId);
    const other = pins.findIndex(
      (p) =>
        p.questId ===
        currentPins[
          currentPins.findIndex((p) => p.questId === questId) + direction
        ]?.questId,
    );
    if (other >= 0) {
      [pins[index], pins[other]] = [pins[other], pins[index]];
      setModel({ ...model, pins });
    }
  }
  function closeQuest() {
    setSelectedId(null);
    setEditing(false);
    setError("");
  }
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
                  markReturnFocus();
                  setManagement(true);
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
                      setEmptyProject(p.id);
                      navigate("");
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
                          setEmptyProject(p.id);
                          markReturnFocus();
                          setManagement(true);
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
          <label className="locale-picker">
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
          {editMode && (
            <button
              className="settings-button"
              onClick={() => {
                markReturnFocus();
                setManagement(true);
              }}
            >
              <Settings size={17} /> {t.settings}
              <MoreHorizontal size={17} />
            </button>
          )}
        </aside>
        <main className="main" inert={drawer || undefined}>
          <header className="topbar">
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
              {editMode && (
                <>
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
                    disabled={!page}
                  >
                    <Plus size={15} />
                    <span>{t.addQuest}</span>
                  </button>
                  <button
                    className="icon-button"
                    aria-label={t.treeActions}
                    onClick={() => {
                      markReturnFocus();
                      setManagement(true);
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
                  setEditMode(!editMode);
                  setEditing(false);
                  setDraft(null);
                  setManagement(false);
                  setShowOverride(false);
                  setError("");
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
                            const pins = [...model.pins];
                            const from = pins.findIndex(
                              (p) =>
                                p.questId === draggedPin &&
                                p.projectId === project?.id,
                            );
                            const to = pins.findIndex(
                              (p) =>
                                p.questId === q.id &&
                                p.projectId === project?.id,
                            );
                            if (from >= 0 && to >= 0) {
                              const [moved] = pins.splice(from, 1);
                              pins.splice(to, 0, moved);
                              setModel({ ...model, pins });
                            }
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
            {nodes.length ? (
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
                            setManagement(true);
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
                                status={statusForQuest(model, q.id)}
                                externalTree={
                                  !visibleIds.has(q.id)
                                    ? model.pages.find(
                                        (p) => p.id === q.homePageId,
                                      )?.name
                                    : undefined
                                }
                                onClick={() => goHome(q)}
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
                  {editMode && (
                    <button
                      className="button button-secondary"
                      onClick={() => setEditing(true)}
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
                  {model.verifications.filter((v) => v.questId === selected.id)
                    .length ? (
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
                {editMode && (
                  <div className="journal-actions">
                    <button
                      className="button button-quiet"
                      onClick={() => setShowOverride(!showOverride)}
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
                {editMode && showOverride && (
                  <form
                    className="override-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (!overrideReason.trim()) return;
                      if (!window.confirm(t.overrideConfirm)) return;
                      setModel({
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
                          setModel({
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
                <div className="manage-row" key={p.id}>
                  <Layers size={17} />
                  <strong>{p.name}</strong>
                  <button
                    className="icon-button"
                    aria-label={t.renameProgression(p.name)}
                    onClick={() => {
                      const name = window
                        .prompt(t.progressionName, p.name)
                        ?.trim();
                      if (name)
                        setModel({
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
                      setModel(next);
                      if (project?.id === p.id) {
                        setEmptyProject(next.projects[0]?.id ?? "");
                        navigate(next.pages[0]?.id ?? "");
                      }
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
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
                  setModel({
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
                  setEmptyProject(id);
                  navigate("");
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
              <h2>{t.trees}</h2>
              {model.pages.map((p) => (
                <div className="manage-row" key={p.id}>
                  <GitBranch size={17} />
                  <span>
                    <strong>{p.name}</strong>
                    <small>
                      {
                        model.projects.find(
                          (project) => project.id === p.projectId,
                        )?.name
                      }
                    </small>
                  </span>
                  <button
                    className="icon-button"
                    aria-label={t.renameTree(p.name)}
                    onClick={() => {
                      const name = window.prompt(t.treeName, p.name)?.trim();
                      if (name)
                        setModel({
                          ...model,
                          pages: model.pages.map((item) =>
                            item.id === p.id ? { ...item, name } : item,
                          ),
                        });
                    }}
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    className="icon-button danger"
                    aria-label={t.deleteTree(p.name)}
                    onClick={() =>
                      attempt(() => {
                        const destinations = model.pages.filter(
                          (item) =>
                            item.projectId === p.projectId && item.id !== p.id,
                        );
                        let destination: string | undefined;
                        const orphans = model.appearances.some(
                          (a) =>
                            a.pageId === p.id &&
                            !model.appearances.some(
                              (b) =>
                                b.questId === a.questId && b.pageId !== p.id,
                            ),
                        );
                        if (orphans) {
                          if (!destinations.length)
                            throw new Error(t.lastTreeError);
                          const choice = window.prompt(
                            t.moveOrphans(
                              destinations
                                .map(
                                  (item, index) => `${index + 1}: ${item.name}`,
                                )
                                .join(", "),
                            ),
                            "1",
                          );
                          if (choice === null) return;
                          destination = destinations[Number(choice) - 1]?.id;
                          if (!destination) throw new Error(t.invalidTree);
                        }
                        if (!window.confirm(t.deleteTreeConfirm(p.name)))
                          return;
                        const next = deletePage(model, p.id, destination);
                        setModel(next);
                        setEmptyProject(p.projectId);
                        if (pageId === p.id)
                          navigate(
                            next.pages.find(
                              (item) => item.projectId === p.projectId,
                            )?.id ?? "",
                          );
                      })
                    }
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              <form
                className="inline-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  const data = new FormData(e.currentTarget);
                  const name = String(data.get("name")).trim();
                  const projectId = String(data.get("project"));
                  if (!name || !model.projects.some((p) => p.id === projectId))
                    return;
                  const id = uid();
                  setModel({
                    ...model,
                    pages: [...model.pages, { id, name, projectId }],
                  });
                  navigate(id);
                  e.currentTarget.reset();
                }}
              >
                <select
                  name="project"
                  aria-label={t.treeProgression}
                  key={emptyProject || project?.id}
                  defaultValue={emptyProject || project?.id}
                >
                  {model.projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <input
                  name="name"
                  aria-label={t.newTreeName}
                  placeholder={t.newTreeName}
                  required
                />
                <button
                  className="button button-secondary"
                  disabled={!model.projects.length}
                >
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
                  attempt(() =>
                    setModel(
                      addDependency(
                        model,
                        String(data.get("dependent")),
                        dependencySource,
                      ),
                    ),
                  );
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
              </p>
            )}
            <div className="notice">
              <Settings size={17} />
              <span>{t.savedView}</span>
            </div>
          </Modal>
        )}
      </div>
    </Tooltip.Provider>
  );
}
