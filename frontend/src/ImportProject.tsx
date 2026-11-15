import { useState } from "react";
import Modal from "./Modal";
import { createImport, previewImport, type ImportPreview } from "./api";
import { useI18n } from "./i18n";

export default function ImportProject({ onClose }: { onClose: () => void }) {
  const t = useI18n();
  const [document, setDocument] = useState<object | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return <Modal title={t.importProject} onClose={onClose}>
    <div className="editor-form">
    <label className="field">{t.importFile}
      <input type="file" accept=".json,application/json" disabled={busy} onChange={async (event) => {
        setDocument(null); setPreview(null); setError("");
        const file = event.currentTarget.files?.[0];
        if (!file) return;
        setBusy(true);
        try {
          const value: unknown = JSON.parse(await file.text());
          if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
          const result = await previewImport(value);
          setDocument(value); setPreview(result);
        } catch (reason) { setError(reason instanceof Error && reason.message ? `${t.importInvalid} ${reason.message}` : t.importInvalid); }
        finally { setBusy(false); }
      }} />
    </label>
    {error && <p role="alert">{error}</p>}
    {preview && <div className="field">
      <p>{preview.project}</p><p>{preview.pages.join(", ")}</p>
      <p>{t.importSummary(preview.quests, preview.dependencies)}</p>
      <div className="form-actions"><button className="button button-primary" disabled={busy} onClick={async () => {
        if (!document) return;
        setBusy(true); setError("");
        try { await createImport(document); window.location.reload(); }
        catch (reason) { setError(reason instanceof Error && reason.message ? `${t.importInvalid} ${reason.message}` : t.importInvalid); setBusy(false); }
      }}>{t.importConfirm}</button></div>
    </div>}
    </div>
  </Modal>;
}
