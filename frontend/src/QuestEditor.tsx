import { useState, type FormEvent } from "react";
import {
  addDependency,
  type Model,
  type Quest,
  type QuestState,
} from "./model";
import { QuestIcon } from "./icons";
import { iconNames } from "./iconNames";

type Props = {
  model: Model;
  quest: Quest;
  onSave: (model: Model) => void;
  onCancel: () => void;
};

export default function QuestEditor({ model, quest, onSave, onCancel }: Props) {
  const pages = model.pages.filter(
    (page) => page.projectId === quest.projectId,
  );
  const [draft, setDraft] = useState(quest);
  const [positions, setPositions] = useState<
    Record<string, { x: string; y: string }>
  >(() => {
    const appearances = model.appearances.filter(
      (appearance) => appearance.questId === quest.id,
    );
    return Object.fromEntries(
      (appearances.length
        ? appearances
        : [{ pageId: quest.homePageId, x: 0, y: 0 }]
      ).map((appearance) => [
        appearance.pageId,
        { x: String(appearance.x), y: String(appearance.y) },
      ]),
    );
  });
  const [dependencies, setDependencies] = useState(() =>
    model.dependencies
      .filter((dependency) => dependency.questId === quest.id)
      .map((dependency) => dependency.dependsOnQuestId),
  );
  const [iconSearch, setIconSearch] = useState("");
  const [error, setError] = useState("");
  const selectedPages = pages.filter((page) => page.id in positions);

  function save(event: FormEvent) {
    event.preventDefault();
    if (!draft.title.trim()) return setError("Enter a quest title.");
    if (!selectedPages.length) return setError("Choose at least one tree.");
    if (!selectedPages.some((page) => page.id === draft.homePageId))
      return setError("Choose a home tree containing this quest.");
    if (
      selectedPages.some(
        (page) =>
          !positions[page.id].x.trim() ||
          !positions[page.id].y.trim() ||
          !Number.isFinite(Number(positions[page.id].x)) ||
          !Number.isFinite(Number(positions[page.id].y)),
      )
    )
      return setError("Enter a valid position for each tree.");
    const updatedQuest = { ...draft, title: draft.title.trim() };
    let result: Model = {
      ...model,
      quests: model.quests.some((item) => item.id === quest.id)
        ? model.quests.map((item) =>
            item.id === quest.id ? updatedQuest : item,
          )
        : [...model.quests, updatedQuest],
      appearances: [
        ...model.appearances.filter(
          (appearance) => appearance.questId !== quest.id,
        ),
        ...selectedPages.map((page) => ({
          pageId: page.id,
          questId: quest.id,
          x: Number(positions[page.id].x),
          y: Number(positions[page.id].y),
        })),
      ],
      dependencies: model.dependencies.filter(
        (dependency) => dependency.questId !== quest.id,
      ),
    };
    try {
      for (const dependency of dependencies)
        result = addDependency(result, quest.id, dependency);
    } catch (cause) {
      return setError(
        cause instanceof Error ? cause.message : "Unable to save dependencies.",
      );
    }
    onSave(result);
  }

  return (
    <form className="editor-form" onSubmit={save}>
      <label className="field">
        Title
        <input
          value={draft.title}
          onChange={(event) =>
            setDraft({ ...draft, title: event.target.value })
          }
        />
      </label>
      <label className="field">
        Description
        <textarea
          value={draft.description}
          onChange={(event) =>
            setDraft({ ...draft, description: event.target.value })
          }
        />
      </label>
      <label className="field">
        Acceptance criteria
        <textarea
          value={draft.acceptanceCriteria}
          onChange={(event) =>
            setDraft({ ...draft, acceptanceCriteria: event.target.value })
          }
        />
      </label>
      <label className="field">
        Work state
        <select
          value={draft.workState}
          onChange={(event) =>
            setDraft({ ...draft, workState: event.target.value as QuestState })
          }
        >
          <option value="not_started">Not started</option>
          <option value="in_progress">In progress</option>
          <option value="blocked">Blocked</option>
        </select>
      </label>
      <label className="field">
        Search icons
        <input
          value={iconSearch}
          onChange={(event) => setIconSearch(event.target.value)}
        />
      </label>
      <label className="field">
        Icon
        <select
          value={draft.icon}
          onChange={(event) => setDraft({ ...draft, icon: event.target.value })}
        >
          {iconNames
            .filter(
              (name) =>
                name.toLowerCase().includes(iconSearch.toLowerCase()) ||
                name === draft.icon,
            )
            .map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
        </select>
      </label>
      <span aria-hidden="true">
        <QuestIcon name={draft.icon} size={20} />
      </span>
      <fieldset>
        <legend>Trees</legend>
        {pages.map((page) => (
          <label className="field-check" key={page.id}>
            <input
              type="checkbox"
              checked={page.id in positions}
              onChange={(event) => {
                if (event.target.checked)
                  setPositions({ ...positions, [page.id]: { x: "0", y: "0" } });
                else {
                  const next = { ...positions };
                  delete next[page.id];
                  setPositions(next);
                  if (draft.homePageId === page.id)
                    setDraft({
                      ...draft,
                      homePageId: Object.keys(next)[0] ?? "",
                    });
                }
              }}
            />
            {page.name}
          </label>
        ))}
      </fieldset>
      <label className="field">
        Home tree
        <select
          value={draft.homePageId}
          onChange={(event) =>
            setDraft({ ...draft, homePageId: event.target.value })
          }
        >
          <option value="" disabled>
            Choose a tree
          </option>
          {selectedPages.map((page) => (
            <option key={page.id} value={page.id}>
              {page.name}
            </option>
          ))}
        </select>
      </label>
      {selectedPages.map((page) => (
        <fieldset className="form-grid" key={page.id}>
          <legend>{page.name} position</legend>
          <label className="field">
            X
            <input
              type="number"
              value={positions[page.id].x}
              onChange={(event) =>
                setPositions({
                  ...positions,
                  [page.id]: { ...positions[page.id], x: event.target.value },
                })
              }
            />
          </label>
          <label className="field">
            Y
            <input
              type="number"
              value={positions[page.id].y}
              onChange={(event) =>
                setPositions({
                  ...positions,
                  [page.id]: { ...positions[page.id], y: event.target.value },
                })
              }
            />
          </label>
        </fieldset>
      ))}
      <fieldset>
        <legend>Prerequisites</legend>
        {model.quests
          .filter(
            (item) =>
              item.projectId === quest.projectId && item.id !== quest.id,
          )
          .map((item) => (
            <label className="field-check" key={item.id}>
              <input
                type="checkbox"
                checked={dependencies.includes(item.id)}
                onChange={(event) =>
                  setDependencies(
                    event.target.checked
                      ? [...dependencies, item.id]
                      : dependencies.filter((id) => id !== item.id),
                  )
                }
              />
              {item.title}
            </label>
          ))}
      </fieldset>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div>
        <button className="button button-primary" type="submit">
          Save quest
        </button>{" "}
        <button
          className="button button-quiet"
          type="button"
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
