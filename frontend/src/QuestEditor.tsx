import { useState, type FormEvent } from "react";
import {
  addDependency,
  type Model,
  type Quest,
  type QuestState,
} from "./model";
import { QuestIcon } from "./icons";
import { emojiIcons, iconNames } from "./iconNames";
import { useI18n } from "./i18n";

type Props = {
  model: Model;
  quest: Quest;
  onSave: (model: Model) => void;
  onCancel: () => void;
};

export default function QuestEditor({ model, quest, onSave, onCancel }: Props) {
  const t = useI18n();
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
    if (!draft.title.trim()) return setError(t.enterQuestTitle);
    if (!selectedPages.length) return setError(t.chooseOneTree);
    if (!selectedPages.some((page) => page.id === draft.homePageId))
      return setError(t.chooseHomeTree);
    if (
      selectedPages.some(
        (page) =>
          !positions[page.id].x.trim() ||
          !positions[page.id].y.trim() ||
          !Number.isFinite(Number(positions[page.id].x)) ||
          !Number.isFinite(Number(positions[page.id].y)),
      )
    )
      return setError(t.validPosition);
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
        cause instanceof Error ? cause.message : t.dependencySaveError,
      );
    }
    onSave(result);
  }

  return (
    <form className="editor-form" onSubmit={save}>
      <label className="field">
        {t.title}
        <input
          value={draft.title}
          onChange={(event) =>
            setDraft({ ...draft, title: event.target.value })
          }
        />
      </label>
      <label className="field">
        {t.description}
        <textarea
          value={draft.description}
          onChange={(event) =>
            setDraft({ ...draft, description: event.target.value })
          }
        />
      </label>
      <label className="field">
        {t.criteria}
        <textarea
          value={draft.acceptanceCriteria}
          onChange={(event) =>
            setDraft({ ...draft, acceptanceCriteria: event.target.value })
          }
        />
      </label>
      <label className="field">
        {t.workState}
        <select
          value={draft.workState}
          onChange={(event) =>
            setDraft({ ...draft, workState: event.target.value as QuestState })
          }
        >
          <option value="not_started">{t.status.not_started}</option>
          <option value="in_progress">{t.status.in_progress}</option>
          <option value="blocked">{t.status.blocked}</option>
        </select>
      </label>
      <label className="field-check">
        <input
          type="checkbox"
          checked={draft.milestone}
          onChange={(event) =>
            setDraft({ ...draft, milestone: event.target.checked })
          }
        />
        {t.milestone}
      </label>
      <label className="field">
        {t.searchIcons}
        <input
          value={iconSearch}
          onChange={(event) => setIconSearch(event.target.value)}
        />
      </label>
      <label className="field">
        {t.icon}
        <select
          value={draft.icon}
          onChange={(event) => setDraft({ ...draft, icon: event.target.value })}
        >
          {!iconNames.includes(draft.icon) &&
            !emojiIcons.includes(draft.icon) && (
              <option value={draft.icon}>{draft.icon}</option>
            )}
          {[...iconNames, ...emojiIcons]
            .filter(
              (name) =>
                name.toLowerCase().includes(iconSearch.toLowerCase()) ||
                name === draft.icon,
            )
            .map((name) => (
              <option key={name} value={name}>
                {name.startsWith("emoji:") ? name.slice(6) : name}
              </option>
            ))}
        </select>
      </label>
      <span aria-hidden="true">
        <QuestIcon name={draft.icon} size={20} />
      </span>
      <fieldset>
        <legend>{t.trees}</legend>
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
        {t.homeTree}
        <select
          value={draft.homePageId}
          onChange={(event) =>
            setDraft({ ...draft, homePageId: event.target.value })
          }
        >
          <option value="" disabled>
            {t.chooseTree}
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
          <legend>
            {page.name} {t.position}
          </legend>
          <label className="field">
            {t.x}
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
            {t.y}
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
        <legend>{t.prerequisites}</legend>
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
          {t.saveQuest}
        </button>{" "}
        <button
          className="button button-quiet"
          type="button"
          onClick={onCancel}
        >
          {t.cancel}
        </button>
      </div>
    </form>
  );
}
