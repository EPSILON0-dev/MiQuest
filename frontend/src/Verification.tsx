import { useEffect, useRef, useState } from "react";
import { getLocale, useI18n } from "./i18n";

type Settings = {
  configured: boolean;
  keyMask: string | null;
  model: string | null;
  effort: string | null;
};
type Reviewer = {
  id: string;
  name: string;
  contextLength: number;
  efforts: string[];
};
type Attachment = { id: string; name: string; url?: string };
type Run = {
  id: string;
  questId: string;
  status: string;
  createdAt: string;
  message: string;
  model: string;
  effort: string;
  verdict: string | null;
  reasoning: string | null;
  unmetCriteria: string[] | null;
  completionApplied: boolean;
  error: string | null;
  attachments: Attachment[];
  usage: {
    generationId?: string | null;
    totalCost?: number | null;
    inputTokens?: number | null;
    outputTokens?: number | null;
    inputCost?: number | null;
    outputCost?: number | null;
    upstreamInputCost?: number | null;
    upstreamOutputCost?: number | null;
  } | null;
};
const words = {
  en: {
    title: "OpenRouter verification",
    key: "API key",
    keyHelp:
      "The saved key is never shown. Deleting it here does not revoke it at OpenRouter.",
    replace: "Replace key",
    delete: "Delete key",
    model: "Reviewer model",
    effort: "Thinking effort",
    save: "Save verification settings",
    configured: "Saved key",
    missing: "No key saved",
    choose: "Choose a model",
    searchModels: "Search models",
    completed:
      "Reopen this completed quest in edit mode before requesting another review.",
    submit: "Request verification",
    message: "Evidence message",
    files: "Attachments",
    fileHelp:
      "Attachments are optional; a message alone is enough. Up to five text or static image files; 10 MiB each, 25 MiB total. PDFs and animated images are not supported.",
    consent:
      "Submitting sends this quest's context and your message and attachments to OpenRouter and the selected model provider for review.",
    upload: "Uploading…",
    active: "Review in progress",
    elapsed: "Elapsed",
    retry: "Try again",
    empty: "Add a message or attachment.",
    limits:
      "Choose at most five files, each no larger than 10 MiB and 25 MiB total.",
    unavailable:
      "Save an API key and choose a model in settings before requesting verification.",
    failed: "Could not load verification. Try again.",
    modelsFailed:
      "Could not load reviewer models. Saved key settings are still available.",
    disconnected:
      "Could not refresh review status. Retrying automatically; you can also retry now.",
    unmet: "Unmet criteria",
    cost: "Cost (USD)",
    input: "Input tokens",
    output: "Output tokens",
    inputCost: "Input cost (USD)",
    outputCost: "Output cost (USD)",
    generationId: "Generation ID",
    upstreamInputCost: "Upstream provider input cost (USD)",
    upstreamOutputCost: "Upstream provider output cost (USD)",
    unknown: "Unknown",
    notApplied: "The review passed, but completion was not applied.",
    history: "Review attempts",
    refresh: "Refresh quest to see the result",
    stages: {
      waiting: "Waiting for reviewer",
      reviewing: "Reviewing",
      saving: "Saving",
      completed: "Completed",
      error: "Error",
      interrupted: "Interrupted",
    },
  },
  pl: {
    title: "Weryfikacja OpenRouter",
    key: "Klucz API",
    keyHelp:
      "Zapisany klucz nie jest wyświetlany. Usunięcie go tutaj nie unieważnia go w OpenRouter.",
    replace: "Zastąp klucz",
    delete: "Usuń klucz",
    model: "Model weryfikujący",
    effort: "Poziom rozumowania",
    save: "Zapisz ustawienia weryfikacji",
    configured: "Zapisany klucz",
    missing: "Brak zapisanego klucza",
    choose: "Wybierz model",
    searchModels: "Szukaj modeli",
    completed:
      "Otwórz ponownie ukończone zadanie w trybie edycji przed kolejną weryfikacją.",
    submit: "Rozpocznij weryfikację",
    message: "Wiadomość z dowodami",
    files: "Załączniki",
    fileHelp:
      "Załączniki są opcjonalne; wystarczy sama wiadomość. Do pięciu plików tekstowych lub statycznych obrazów; 10 MiB każdy, 25 MiB łącznie. Pliki PDF i animacje nie są obsługiwane.",
    consent:
      "Przesłanie wysyła kontekst zadania, wiadomość i załączniki do OpenRouter oraz dostawcy wybranego modelu w celu weryfikacji.",
    upload: "Przesyłanie…",
    active: "Trwa weryfikacja",
    elapsed: "Czas",
    retry: "Spróbuj ponownie",
    empty: "Dodaj wiadomość lub załącznik.",
    limits:
      "Wybierz najwyżej pięć plików, każdy do 10 MiB i łącznie do 25 MiB.",
    unavailable:
      "Zapisz klucz API i wybierz model w ustawieniach przed weryfikacją.",
    failed: "Nie udało się wczytać weryfikacji. Spróbuj ponownie.",
    modelsFailed:
      "Nie udało się wczytać modeli. Ustawienia zapisanego klucza są nadal dostępne.",
    disconnected:
      "Nie udało się odświeżyć stanu weryfikacji. Ponowimy próbę automatycznie; możesz też spróbować teraz.",
    unmet: "Niespełnione kryteria",
    cost: "Koszt (USD)",
    input: "Tokeny wejściowe",
    output: "Tokeny wyjściowe",
    inputCost: "Koszt wejścia (USD)",
    outputCost: "Koszt wyjścia (USD)",
    generationId: "Identyfikator generowania",
    upstreamInputCost: "Koszt wejścia dostawcy (USD)",
    upstreamOutputCost: "Koszt wyjścia dostawcy (USD)",
    unknown: "Nieznany",
    notApplied:
      "Weryfikacja zakończyła się pozytywnie, ale zadanie nie zostało ukończone.",
    history: "Próby weryfikacji",
    refresh: "Odśwież zadanie, aby zobaczyć wynik",
    stages: {
      waiting: "Oczekiwanie na weryfikatora",
      reviewing: "Weryfikacja",
      saving: "Zapisywanie",
      completed: "Zakończono",
      error: "Błąd",
      interrupted: "Przerwano",
    },
  },
};
function useWords() {
  useI18n();
  return words[getLocale()];
}
async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/v1${path}`, init);
  const body = await response.json();
  if (!response.ok)
    throw new Error(
      body.error?.details?.messages?.join("; ") ||
        body.error?.message ||
        body.detail ||
        `Request failed (${response.status})`,
    );
  return body.data as T;
}
function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function VerificationSettings() {
  const t = useWords();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [models, setModels] = useState<Reviewer[]>([]);
  const [search, setSearch] = useState("");
  const [key, setKey] = useState("");
  const [error, setError] = useState("");
  const [modelsError, setModelsError] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    api<Settings>("/verification-settings")
      .then((s) => {
        if (active) setSettings(s);
      })
      .catch((e: unknown) => {
        if (active) setError(errorMessage(e, t.failed));
      });
    api<Reviewer[]>("/verification-models")
      .then((m) => {
        if (active) {
          setModels(m);
          setModelsError(false);
        }
      })
      .catch(() => {
        if (active) setModelsError(true);
      });
    return () => {
      active = false;
    };
  }, [t.failed]);
  async function save(remove = false) {
    if (!settings) return;
    setBusy(true);
    setError("");
    try {
      const result = await api<Settings>("/verification-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: settings.model ?? "",
          effort: settings.effort ?? "",
          ...(remove ? { key: "" } : key ? { key } : {}),
        }),
      });
      setSettings(result);
      setKey("");
    } catch (e) {
      setError(errorMessage(e, t.failed));
    } finally {
      setBusy(false);
    }
  }
  const selected = models.find((m) => m.id === settings?.model);
  return (
    <section className="journal-section">
      <h2>{t.title}</h2>
      {settings && (
        <div className="editor-form">
          <p className="muted">
            {settings.configured
              ? `${t.configured}: ${settings.keyMask}`
              : t.missing}
          </p>
          <label className="field">
            {settings.configured ? t.replace : t.key}
            <input
              type="password"
              autoComplete="off"
              value={key}
              onChange={(e) => setKey(e.target.value)}
            />
          </label>
          <p className="muted">{t.keyHelp}</p>
          <label className="field">
            {t.searchModels}
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <label className="field">
            {t.model}
            <select
              value={settings.model ?? ""}
              disabled={modelsError}
              onChange={(e) => {
                const model = models.find((m) => m.id === e.target.value);
                setSettings({
                  ...settings,
                  model: e.target.value || null,
                  effort: model?.efforts[0] ?? null,
                });
              }}
            >
              <option value="">{t.choose}</option>
              {modelsError && settings.model && (
                <option value={settings.model}>{settings.model}</option>
              )}
              {models
                .filter(
                  (m) =>
                    m.id === settings.model ||
                    `${m.name} ${m.id}`
                      .toLowerCase()
                      .includes(search.toLowerCase()),
                )
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.id})
                  </option>
                ))}
            </select>
          </label>
          {selected && (
            <label className="field">
              {t.effort}
              <select
                value={settings.effort ?? ""}
                onChange={(e) =>
                  setSettings({ ...settings, effort: e.target.value })
                }
              >
                {selected.efforts.map((effort) => (
                  <option key={effort}>{effort}</option>
                ))}
              </select>
            </label>
          )}
          <div className="form-actions">
            {settings.configured && (
              <button
                className="button button-secondary"
                disabled={busy}
                onClick={() => void save(true)}
              >
                {t.delete}
              </button>
            )}
            <button
              className="button button-primary"
              disabled={busy}
              onClick={() => void save()}
            >
              {t.save}
            </button>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {modelsError && (
        <p role="alert" className="error">
          {t.modelsFailed}
        </p>
      )}
    </section>
  );
}

const activeStatuses = ["waiting", "reviewing", "saving"];
export function QuestVerification({
  questId,
  disabled,
  completed,
  onActiveChange,
  onComplete,
}: {
  questId: string;
  disabled: boolean;
  completed: boolean;
  onActiveChange: (active: boolean) => void;
  onComplete: () => void;
}) {
  const t = useWords();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState("");
  const [uploading, setUploading] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [disconnected, setDisconnected] = useState(false);
  const [retry, setRetry] = useState(0);
  const active = runs.find((r) => activeStatuses.includes(r.status));
  const activeId = active?.id;
  const completeRef = useRef(onComplete);
  useEffect(() => {
    completeRef.current = onComplete;
  }, [onComplete]);
  useEffect(() => {
    let mounted = true;
    Promise.all([
      api<Settings>("/verification-settings"),
      api<Run[]>(`/quests/${questId}/review-runs`),
    ])
      .then(([s, r]) => {
        if (mounted) {
          setSettings(s);
          setRuns(r);
          if (!disabled && !completed && r[0]?.completionApplied)
            completeRef.current();
        }
      })
      .catch((e: unknown) => {
        if (mounted) setError(errorMessage(e, t.failed));
      });
    return () => {
      mounted = false;
    };
  }, [questId, t.failed, disabled, completed]);
  useEffect(() => {
    onActiveChange(Boolean(active) || uploading);
    return () => onActiveChange(false);
  }, [active, uploading, onActiveChange]);
  useEffect(() => {
    if (!activeId) return;
    let mounted = true;
    const update = (run: Run) => {
      if (!mounted) return;
      setDisconnected(false);
      setRuns((previous) =>
        previous.map((item) => (item.id === run.id ? run : item)),
      );
      if (!activeStatuses.includes(run.status)) completeRef.current();
    };
    const events = new EventSource(`/api/v1/review-runs/${activeId}/events`);
    events.onmessage = (event) => {
      try {
        update(JSON.parse(event.data) as Run);
      } catch {
        /* Polling recovers missed events. */
      }
    };
    const poll = () => {
      setNow(Date.now());
      void api<Run>(`/review-runs/${activeId}`)
        .then(update)
        .catch(() => {
          if (mounted) setDisconnected(true);
        });
    };
    if (retry) poll();
    const timer = window.setInterval(poll, 3000);
    return () => {
      mounted = false;
      events.close();
      window.clearInterval(timer);
    };
  }, [activeId, retry]);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (!message.trim() && files.length === 0) {
      setError(t.empty);
      return;
    }
    if (
      files.length > 5 ||
      files.some((file) => file.size > 10 * 1024 * 1024) ||
      files.reduce((total, file) => total + file.size, 0) > 25 * 1024 * 1024
    ) {
      setError(t.limits);
      return;
    }
    setUploading(true);
    try {
      const body = new FormData();
      body.append("message", message);
      files.forEach((file) => body.append("files", file));
      const run = await api<Run>(`/quests/${questId}/review-runs`, {
        method: "POST",
        body,
      });
      setRuns((previous) => [run, ...previous]);
      setMessage("");
      setFiles([]);
    } catch (e) {
      setError(errorMessage(e, t.failed));
    } finally {
      setUploading(false);
    }
  }
  const ready = settings?.configured && settings.model;
  return (
    <section className="journal-section">
      <h2>{t.title}</h2>
      {active ? (
        <div className="notice" role="status">
          <span>
            {t.active}:{" "}
            {t.stages[active.status as keyof typeof t.stages] ?? active.status}{" "}
            · {t.elapsed}:{" "}
            {Math.max(
              0,
              Math.floor((now - Date.parse(active.createdAt)) / 1000),
            )}
            s
          </span>
          {disconnected && (
            <span>
              {t.disconnected}{" "}
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setRetry((value) => value + 1)}
              >
                {t.retry}
              </button>
            </span>
          )}
        </div>
      ) : completed ? (
        <p className="muted">{t.completed}</p>
      ) : (
        <form className="editor-form" onSubmit={(e) => void submit(e)}>
          {!ready && <p className="muted">{t.unavailable}</p>}
          <label className="field">
            {t.message}
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              disabled={uploading}
            />
          </label>
          <label className="field">
            {t.files}
            <input
              type="file"
              multiple
              disabled={uploading}
              onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            />
          </label>
          <p className="muted">{t.fileHelp}</p>
          <p className="muted">{t.consent}</p>
          <div className="form-actions">
            <button
              className="button button-primary"
              disabled={!ready || disabled || uploading}
            >
              {uploading ? t.upload : t.submit}
            </button>
          </div>
        </form>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {runs.length > 0 && (
        <details className="history">
          <summary>
            {t.history}
            <span>{runs.length}</span>
          </summary>
          {runs.map((run) => (
            <article key={run.id}>
              <div>
                <strong>
                  {run.verdict ??
                    t.stages[run.status as keyof typeof t.stages] ??
                    run.status}
                </strong>
                <time>{run.createdAt}</time>
              </div>
              <p>{run.reasoning}</p>
              {run.error && <p role="alert">{run.error}</p>}
              {run.verdict === "pass" && !run.completionApplied && (
                <p>{t.notApplied}</p>
              )}
              {run.unmetCriteria && run.unmetCriteria.length > 0 && (
                <>
                  <strong>{t.unmet}</strong>
                  <ul>
                    {run.unmetCriteria.map((criterion, i) => (
                      <li key={i}>{criterion}</li>
                    ))}
                  </ul>
                </>
              )}
              {run.message && <p>{run.message}</p>}
              {run.attachments?.map((file) => (
                <p key={file.id}>
                  <a href={file.url ?? `/api/v1/review-attachments/${file.id}`}>
                    {file.name}
                  </a>
                </p>
              ))}
              <small>
                {run.model} · {run.effort}
                {run.usage?.generationId && (
                  <>
                    <br />
                    {t.generationId}: {run.usage.generationId}
                  </>
                )}
                <br />
                {t.cost}: {run.usage?.totalCost ?? t.unknown} · {t.input}:{" "}
                {run.usage?.inputTokens ?? t.unknown} · {t.output}:{" "}
                {run.usage?.outputTokens ?? t.unknown}
                <br />
                {t.inputCost}: {run.usage?.inputCost ?? t.unknown} ·{" "}
                {t.outputCost}: {run.usage?.outputCost ?? t.unknown}
                {(run.usage?.upstreamInputCost != null ||
                  run.usage?.upstreamOutputCost != null) && (
                  <>
                    <br />
                    {t.upstreamInputCost}:{" "}
                    {run.usage?.upstreamInputCost ?? t.unknown} ·{" "}
                    {t.upstreamOutputCost}:{" "}
                    {run.usage?.upstreamOutputCost ?? t.unknown}
                  </>
                )}
              </small>
            </article>
          ))}
        </details>
      )}
    </section>
  );
}
