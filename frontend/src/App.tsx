import { useState, useRef } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  MarkerType,
  type Node,
  type NodeProps,
  type ReactFlowInstance,
  type Viewport,
} from "@xyflow/react";
import dagre from "@dagrejs/dagre";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronRight,
  Circle,
  Flag,
  Focus,
  GitBranch,
  Layers,
  LayoutGrid,
  Menu,
  MoreHorizontal,
  Pin,
  Plus,
  Settings,
  ShieldCheck,
  Sparkles,
  X,
  LockKeyhole,
  ArrowUp,
  ArrowDown,
  Pencil,
  Trash2,
} from "lucide-react";
import {
  createFixture,
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
import { readView } from "./view";

type QuestNodeData = {
  quest: Quest;
  status: string;
  prerequisites: number;
  satisfied: number;
  ping: boolean;
  open: () => void;
};
type QuestNode = Node<QuestNodeData, "quest">;
const statusNames: Record<string, string> = {
  locked: "Locked",
  available: "Ready to begin",
  in_progress: "In progress",
  verified: "Verified",
  overridden: "Human override",
  blocked: "Blocked",
};
function QuestCard({ data }: NodeProps<QuestNode>) {
  return (
    <>
      <Handle type="target" position={Position.Left} />
      <button
        className={`quest-card ${data.status} ${data.ping ? "ping" : ""}`}
        onClick={data.open}
      >
        <span className="quest-card-top">
          <span className="quest-icon">
            <QuestIcon name={data.quest.icon} size={23} />
          </span>
          <span className={`status-mark ${data.status}`}>
            {data.status === "verified" ? (
              <Check size={13} />
            ) : data.status === "locked" ? (
              <LockKeyhole size={12} />
            ) : data.status === "in_progress" ? (
              <Circle size={11} fill="currentColor" />
            ) : data.status === "overridden" ? (
              <ShieldCheck size={13} />
            ) : (
              <Circle size={12} />
            )}
          </span>
        </span>
        <span className="quest-title">{data.quest.title}</span>
        <span className="quest-meta">
          {statusNames[data.status]}
          {data.prerequisites > 0 && (
            <span>
              {data.satisfied}/{data.prerequisites}
            </span>
          )}
        </span>
        {data.quest.completionState !== "none" && data.status === "locked" && (
          <span className="history-badge">
            <ShieldCheck size={11} /> Previously {data.quest.completionState}
          </span>
        )}
      </button>
      <Handle type="source" position={Position.Right} />
    </>
  );
}
const nodeTypes = { quest: QuestCard };
const fixture = createFixture();
const initialView = readView(fixture);
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
  const [model, setModel] = useState<Model>(fixture);
  const [measurements, setMeasurements] = useState<
    Record<string, { width: number; height: number }>
  >({});
  const [pageId, setPageId] = useState(initialView.pageId);
  const [emptyProject, setEmptyProject] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
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
  const [viewports, setViewports] = useState<Record<string, Viewport>>(
    initialView.viewports,
  );
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
  const completed = pageQuests.filter(
    (q) => q.completionState !== "none",
  ).length;
  const currentPins = model.pins.filter((p) => p.projectId === project?.id);
  function saveView(id: string, viewport?: Viewport) {
    const nextViewports = viewport
      ? { ...viewports, [id]: viewport }
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
    if (!page || !project) return;
    markReturnFocus();
    setDraft({
      id: uid(),
      projectId: project.id,
      title: "",
      description: "",
      acceptanceCriteria: "",
      icon: "compass",
      homePageId: page.id,
      workState: "not_started",
      completionState: "none",
    });
    setError("");
  }
  function autoLayout() {
    const graph = new dagre.graphlib.Graph()
      .setGraph({ rankdir: "LR", nodesep: 70, ranksep: 85 })
      .setDefaultEdgeLabel(() => ({}));
    pageQuests.forEach((q) => graph.setNode(q.id, { width: 200, height: 145 }));
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
              x: graph.node(a.questId).x - 100,
              y: graph.node(a.questId).y - 72,
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
    const prerequisites = model.dependencies.filter((d) => d.questId === q.id);
    return [
      {
        id: q.id,
        type: "quest",
        position: { x: a.x, y: a.y },
        measured: measurements[q.id],
        data: {
          quest: q,
          status: statusForQuest(model, q.id),
          prerequisites: prerequisites.length,
          satisfied: prerequisites.filter((d) =>
            model.quests.some(
              (q) =>
                q.id === d.dependsOnQuestId && q.completionState !== "none",
            ),
          ).length,
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
    .map((d) => ({
      id: `${d.dependsOnQuestId}-${d.questId}`,
      source: d.dependsOnQuestId,
      target: d.questId,
      type: "smoothstep",
      markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
      className:
        model.quests.find((q) => q.id === d.dependsOnQuestId)
          ?.completionState !== "none"
          ? "edge-complete"
          : "",
    }));
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
  return (
    <div className="app-shell">
      {drawer && (
        <button
          className="drawer-scrim"
          aria-label="Close navigation"
          onClick={() => setDrawer(false)}
        />
      )}
      <aside
        id="navigation"
        aria-label="Workspace navigation"
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
        <div className="workspace-label">
          YOUR WORKSPACE<span>LOCAL</span>
        </div>
        <div className="nav-heading">
          PROGRESSIONS
          <button
            className="icon-button"
            aria-label="Manage progressions"
            onClick={() => {
              markReturnFocus();
              setManagement(true);
            }}
          >
            <Plus size={15} />
          </button>
        </div>
        <nav aria-label="Progressions">
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
                        {pageId === tree.id && <span className="active-dot" />}
                      </button>
                    ))}
                  <button
                    className="new-tree"
                    onClick={() => {
                      setEmptyProject(p.id);
                      markReturnFocus();
                      setManagement(true);
                    }}
                  >
                    <Plus size={13} /> New tree
                  </button>
                </div>
              )}
            </div>
          ))}
        </nav>
        <div className="sidebar-note">
          <span className="tiny-orbit">
            <Flag size={17} />
          </span>
          <p>
            Small steps.
            <br />
            <strong>Meaningful progress.</strong>
          </p>
        </div>
        <button
          className="settings-button"
          onClick={() => {
            markReturnFocus();
            setManagement(true);
          }}
        >
          <Settings size={17} /> Workspace settings
          <MoreHorizontal size={17} />
        </button>
        <div className="sidebar-foot">
          <span className="live-dot" /> Local prototype<span>v0.1</span>
        </div>
      </aside>
      <main className="main" inert={drawer || undefined}>
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            aria-label="Open navigation"
            aria-expanded={drawer}
            aria-controls="navigation"
            onClick={() => {
              setDrawer(true);
              requestAnimationFrame(() =>
                document.querySelector<HTMLElement>(".sidebar .brand")?.focus(),
              );
            }}
          >
            <Menu size={20} />
          </button>
          <div className="breadcrumbs">
            <Layers size={16} />
            <span>{project?.name ?? "Workspace"}</span>
            <ChevronRight size={13} />
            <strong>{page?.name ?? "No tree yet"}</strong>
          </div>
          <div className="top-actions">
            <button
              className="button button-quiet layout-action"
              onClick={autoLayout}
              disabled={!nodes.length}
            >
              <LayoutGrid size={15} />
              <span>Auto layout</span>
            </button>
            <button
              className="icon-button"
              title="Fit tree to view"
              aria-label="Fit tree to view"
              onClick={() =>
                flow.current?.fitView({ padding: 0.2, duration: 400 })
              }
            >
              <Focus size={18} />
            </button>
            <span className="toolbar-divider" />
            <button
              className="button button-primary"
              onClick={newQuest}
              disabled={!page}
            >
              <Plus size={16} />
              <span>Add quest</span>
            </button>
            <button
              className="icon-button"
              aria-label="Tree actions"
              onClick={() => {
                markReturnFocus();
                setManagement(true);
              }}
            >
              <MoreHorizontal size={20} />
            </button>
          </div>
        </header>
        <section className="canvas-section">
          <div className="tree-heading">
            <div className="eyebrow">
              <span className="live-dot" /> YOUR NEXT CHAPTER
            </div>
            <h1>{page?.name ?? "Begin a new progression"}</h1>
            <p>
              {page
                ? page.id === "foundations"
                  ? "Every great idea starts with a few deliberate steps."
                  : project?.description
                : "Create a progression and a tree to start connecting ideas."}
            </p>
            <div className="tree-progress">
              <span className="progress-track">
                <span
                  style={{
                    width: `${pageQuests.length ? (completed / pageQuests.length) * 100 : 0}%`,
                  }}
                />
              </span>
              <span>
                <strong>{completed}</strong> / {pageQuests.length} quests
                complete
              </span>
            </div>
          </div>
          <div className={`pins-panel ${pinsOpen ? "expanded" : ""}`}>
            <button
              className="pins-heading"
              onClick={() => setPinsOpen(!pinsOpen)}
              aria-expanded={pinsOpen}
            >
              <Pin size={13} />
              <span>PINNED QUESTS</span>
              <span className="pins-count">{currentPins.length}</span>
              <ChevronDown size={13} />
            </button>
            <div className="pins-list">
              {currentPins.map((pin, index) => {
                const q = model.quests.find((q) => q.id === pin.questId);
                return (
                  q && (
                    <div className="pin-row" key={q.id}>
                      <button onClick={() => goHome(q)}>
                        <span className="pin-number">0{index + 1}</span>
                        <span>{q.title}</span>
                        <ArrowUpRight size={13} />
                      </button>
                      <div className="pin-order">
                        <button
                          aria-label={`Move ${q.title} up`}
                          disabled={index === 0}
                          onClick={() => movePin(q.id, -1)}
                        >
                          <ArrowUp size={12} />
                        </button>
                        <button
                          aria-label={`Move ${q.title} down`}
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
                <p className="muted">Pin a quest from its journal.</p>
              )}
            </div>
          </div>
          {error && !selected && !draft && !management && (
            <div className="canvas-error" role="alert">
              {error}
              <button
                className="icon-button"
                onClick={() => setError("")}
                aria-label="Dismiss error"
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
              onInit={(instance) => {
                flow.current = instance;
              }}
              defaultViewport={viewports[pageId]}
              fitView={!viewports[pageId]}
              fitViewOptions={{ padding: 0.22, minZoom: 0.5, maxZoom: 0.95 }}
              minZoom={0.2}
              maxZoom={2}
              onMoveEnd={(_, viewport) => saveView(pageId, viewport)}
              onNodesChange={(changes) => {
                const dimensions = changes.filter(
                  (change) => change.type === "dimensions" && change.dimensions,
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
                if (moves.length)
                  setModel((current) => ({
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
              onConnect={(connection) =>
                attempt(() =>
                  setModel(
                    addDependency(model, connection.target, connection.source),
                  ),
                )
              }
              onEdgeClick={(_, edge) => {
                if (window.confirm("Remove this dependency?"))
                  setModel({
                    ...model,
                    dependencies: model.dependencies.filter(
                      (d) => `${d.dependsOnQuestId}-${d.questId}` !== edge.id,
                    ),
                  });
              }}
              onPaneContextMenu={(event) => {
                event.preventDefault();
                newQuest();
              }}
              deleteKeyCode={null}
              nodesFocusable={false}
              edgesFocusable={false}
            >
              <Background gap={24} size={1} color="var(--canvas-dot)" />
              <Controls showInteractive={false} />
            </ReactFlow>
          ) : (
            <div className="empty-state">
              <span className="empty-icon">
                <GitBranch size={36} />
              </span>
              <h2>
                {page
                  ? "A little space for your next idea"
                  : "Your next chapter starts here"}
              </h2>
              <p>
                {page
                  ? "Add your first quest, then connect the steps ahead."
                  : "Create a progression and a tree in workspace settings."}
              </p>
              <button
                className="button button-primary"
                onClick={
                  page
                    ? newQuest
                    : () => {
                        markReturnFocus();
                        setManagement(true);
                      }
                }
              >
                <Plus size={16} />
                {page ? "Add first quest" : "Open workspace settings"}
              </button>
            </div>
          )}
          {external.length > 0 && (
            <div className="cross-tree">
              <span>FROM OTHER TREES</span>
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
          <div className="canvas-footer">
            <div className="legend">
              <span>
                <i className="legend-dot verified" />
                Verified
              </span>
              <span>
                <i className="legend-dot in_progress" />
                In progress
              </span>
              <span>
                <i className="legend-dot available" />
                Available
              </span>
              <span>
                <LockKeyhole size={11} />
                Locked
              </span>
            </div>
            <span className="canvas-hint">
              Drag to explore<span>·</span>Scroll to zoom
            </span>
          </div>
        </section>
      </main>
      {selected && (
        <Modal title={selected.title} onClose={closeQuest}>
          {editing ? (
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
              <div className="journal-intro">
                <span
                  className={`journal-icon ${statusForQuest(model, selected.id)}`}
                >
                  <QuestIcon name={selected.icon} size={30} />
                </span>
                <div>
                  <span
                    className={`status-label ${statusForQuest(model, selected.id)}`}
                  >
                    {statusNames[statusForQuest(model, selected.id)]}
                  </span>
                  <p className="muted">
                    {
                      model.pages.find((p) => p.id === selected.homePageId)
                        ?.name
                    }{" "}
                    <span> / </span> Quest journal
                  </p>
                </div>
                <button
                  className={`icon-button ${model.pins.some((p) => p.questId === selected.id) ? "is-pinned" : ""}`}
                  aria-label={
                    model.pins.some((p) => p.questId === selected.id)
                      ? "Unpin quest"
                      : "Pin quest"
                  }
                  onClick={() => togglePin(selected)}
                >
                  <Pin size={18} />
                </button>
                <button
                  className="button button-secondary"
                  onClick={() => setEditing(true)}
                >
                  <Pencil size={14} />
                  Edit
                </button>
              </div>
              {selected.completionState !== "none" &&
                statusForQuest(model, selected.id) === "locked" && (
                  <div className="notice">
                    <ShieldCheck size={18} />
                    <span>
                      Previously {selected.completionState}. Prerequisites are
                      currently unsatisfied; the earlier record is preserved.
                    </span>
                  </div>
                )}
              <section className="journal-section">
                <h2>The objective</h2>
                <p className="description">
                  {selected.description || "No description yet."}
                </p>
              </section>
              <section className="criteria-box">
                <div className="eyebrow">
                  <Circle size={13} /> ACCEPTANCE CRITERIA
                </div>
                <p>{selected.acceptanceCriteria || "No criteria yet."}</p>
              </section>
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
                    <section className="journal-section" key={direction}>
                      <h2>
                        {direction === "prerequisites"
                          ? "Prerequisites"
                          : "What comes next"}
                        <span>{related.length}</span>
                      </h2>
                      {related.length ? (
                        related.map((q) => (
                          <button
                            className="relation"
                            key={q.id}
                            onClick={() => goHome(q)}
                          >
                            <span
                              className={`relation-icon ${statusForQuest(model, q.id)}`}
                            >
                              <QuestIcon name={q.icon} size={17} />
                            </span>
                            <span>
                              <strong>{q.title}</strong>
                              <small>
                                {visibleIds.has(q.id)
                                  ? statusNames[statusForQuest(model, q.id)]
                                  : `Open ${model.pages.find((p) => p.id === q.homePageId)?.name}`}
                              </small>
                            </span>
                            {visibleIds.has(q.id) ? (
                              <ArrowRight size={15} />
                            ) : (
                              <ArrowUpRight size={15} />
                            )}
                          </button>
                        ))
                      ) : (
                        <p className="muted">
                          {direction === "prerequisites"
                            ? "An open starting point."
                            : "The path is yours to shape."}
                        </p>
                      )}
                    </section>
                  );
                })}
              </div>
              <details className="history">
                <summary>
                  <ShieldCheck size={17} /> Evidence & history
                  <span>
                    {
                      model.verifications.filter(
                        (v) => v.questId === selected.id,
                      ).length
                    }{" "}
                    records
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
                              ? "Human override"
                              : v.verdict === "pass"
                                ? "Agent verification"
                                : v.verdict}
                          </strong>
                          <time>{v.createdAt}</time>
                        </div>
                        <p>{v.reasoning}</p>
                        <small>{v.evidence}</small>
                      </article>
                    ))
                ) : (
                  <p className="muted">No verification records yet.</p>
                )}
              </details>
              <div className="journal-actions">
                <button
                  className="button button-quiet"
                  onClick={() => setShowOverride(!showOverride)}
                >
                  <ShieldCheck size={14} />
                  Human override / reopen
                </button>
                <button
                  className="button button-quiet"
                  onClick={() =>
                    attempt(() => {
                      setModel(removeAppearance(model, pageId, selected.id));
                      closeQuest();
                    })
                  }
                >
                  Remove from this tree
                </button>
                <button
                  className="icon-button danger"
                  aria-label="Delete quest everywhere"
                  onClick={() => {
                    if (
                      window.confirm(
                        `Delete “${selected.title}” everywhere, including dependencies and history?`,
                      )
                    ) {
                      setModel(deleteQuest(model, selected.id));
                      closeQuest();
                    }
                  }}
                >
                  <Trash2 size={15} />
                </button>
              </div>
              {showOverride && (
                <form
                  className="override-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (!overrideReason.trim()) return;
                    if (
                      !window.confirm(
                        "Record this as an explicit human override?",
                      )
                    )
                      return;
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
                          evidence:
                            "Explicit human override in local prototype.",
                          createdAt: new Date().toISOString(),
                        },
                      ],
                    });
                    setShowOverride(false);
                    setOverrideReason("");
                  }}
                >
                  <p className="muted">
                    Local prototype only. This records a human decision, with
                    its reason.
                  </p>
                  <label className="field">
                    Reason
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
                        if (
                          !window.confirm(
                            "Reopen this quest and retain its history?",
                          )
                        )
                          return;
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
                              evidence: "Reopened in local prototype.",
                              createdAt: new Date().toISOString(),
                            },
                          ],
                        });
                        setShowOverride(false);
                      }}
                    >
                      Reopen quest
                    </button>
                    <button className="button button-primary">
                      Confirm human override
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
      {draft && (
        <Modal title="Create a quest" onClose={() => setDraft(null)}>
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
      {management && (
        <Modal
          title="Workspace settings"
          onClose={() => {
            setManagement(false);
            setError("");
          }}
        >
          <p className="muted">
            Shape your progressions and trees. Changes stay in this session.
          </p>
          <section className="journal-section">
            <h2>Progressions</h2>
            {model.projects.map((p) => (
              <div className="manage-row" key={p.id}>
                <Layers size={17} />
                <strong>{p.name}</strong>
                <button
                  className="icon-button"
                  aria-label={`Rename ${p.name}`}
                  onClick={() => {
                    const name = window
                      .prompt("Progression name", p.name)
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
                  aria-label={`Delete ${p.name}`}
                  onClick={() => {
                    if (
                      !window.confirm(
                        `Delete progression “${p.name}” and all its trees and quests?`,
                      )
                    )
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
                      description: "A new path, one quest at a time.",
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
                aria-label="New progression name"
                placeholder="New progression name"
                required
              />
              <button className="button button-secondary">
                <Plus size={14} />
                Create
              </button>
            </form>
          </section>
          <section className="journal-section">
            <h2>Trees</h2>
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
                  aria-label={`Rename ${p.name}`}
                  onClick={() => {
                    const name = window.prompt("Tree name", p.name)?.trim();
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
                  aria-label={`Delete ${p.name}`}
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
                            (b) => b.questId === a.questId && b.pageId !== p.id,
                          ),
                      );
                      if (orphans) {
                        if (!destinations.length)
                          throw new Error(
                            "Create another tree and move these quests before deleting their last tree.",
                          );
                        const choice = window.prompt(
                          `Move quests that only appear here to a tree. Enter its number: ${destinations.map((item, index) => `${index + 1}: ${item.name}`).join(", ")}`,
                          "1",
                        );
                        if (choice === null) return;
                        destination = destinations[Number(choice) - 1]?.id;
                        if (!destination)
                          throw new Error("Choose a valid destination tree");
                      }
                      if (
                        !window.confirm(
                          `Delete tree “${p.name}”? Quests will be preserved.`,
                        )
                      )
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
                aria-label="Tree progression"
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
                aria-label="New tree name"
                placeholder="New tree name"
                required
              />
              <button
                className="button button-secondary"
                disabled={!model.projects.length}
              >
                <Plus size={14} />
                Create
              </button>
            </form>
          </section>
          <section className="journal-section">
            <h2>Connect quests</h2>
            <p className="muted">
              Draw between handles on the tree, or choose a prerequisite and its
              dependent here. Click an edge to remove it.
            </p>
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
                aria-label="Prerequisite quest"
                value={dependencySource}
                onChange={(e) => setDependencySource(e.target.value)}
                required
              >
                <option value="">Prerequisite…</option>
                {projectQuests.map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.title}
                  </option>
                ))}
              </select>
              <ArrowRight size={16} />
              <select aria-label="Dependent quest" name="dependent" required>
                <option value="">Dependent…</option>
                {projectQuests.map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.title}
                  </option>
                ))}
              </select>
              <button className="button button-secondary">Connect</button>
            </form>
          </section>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div className="notice">
            <Sparkles size={17} />
            <span>
              Phase A · Fixture edits reset on reload. Your last tree and canvas
              view are remembered.
            </span>
          </div>
        </Modal>
      )}
    </div>
  );
}
