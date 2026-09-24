import { useState } from "react";
import type { FormEvent } from "react";
import { Check, ShieldCheck } from "lucide-react";
import { api } from "./api";
import { Badge, Modal } from "./components";
import type { Config, Item } from "./types";

export default function ReviewItem({
  item,
  config,
  onClose,
  onSaved,
}: {
  item: Item;
  config: Config;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [reviewer, setReviewer] = useState(""),
    [verdict, setVerdict] = useState("UNCERTAIN"),
    [note, setNote] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api(`/items/${item.id}/reviews`, {
        method: "POST",
        body: JSON.stringify({ reviewer, verdict, note }),
      });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={`${config.languages[item.language]} · sentence ${item.sourceIndex + 1}`}
      onClose={onClose}
      wide
    >
      <div className="review-content">
        <div className="review-meta">
          <Badge value={item.decision} />
          <span>
            <ShieldCheck size={15} />
            {item.independentCheck
              ? "Fresh-context check completed"
              : "No independent check"}
          </span>
          {item.auditSample && <span>Random audit sample</span>}
        </div>
        <div className="translation-compare">
          <div>
            <span className="eyebrow">ENGLISH SOURCE</span>
            <p>{item.sourceText}</p>
          </div>
          <div>
            <span className="eyebrow">
              {config.languages[item.language].toUpperCase()} CANDIDATE
            </span>
            <p dir="auto" lang={item.language}>
              {item.translation || "No translation generated"}
            </p>
          </div>
        </div>
        <h3>
          Evidence & findings{" "}
          <span className="muted">({item.findings.length})</span>
        </h3>
        {item.findings.length ? (
          item.findings.map((f, i) => (
            <div className="finding" key={i}>
              <div>
                <strong>{f.category.replaceAll("_", " ")}</strong>
                <span className="eyebrow">
                  {f.severity} · {f.origin}
                </span>
              </div>
              <p>{f.explanation}</p>
              {(f.sourceSpan || f.targetSpan) && (
                <div className="evidence">
                  <code>{f.sourceSpan || "∅"}</code>
                  <span>→</span>
                  <code>{f.targetSpan || "∅"}</code>
                </div>
              )}
            </div>
          ))
        ) : (
          <p className="callout">
            No error was detected. This is not a guarantee of correctness.
          </p>
        )}
        {item.reviews.length > 0 && (
          <section className="review-history">
            <h3>Human review history</h3>
            {item.reviews.map((r, i) => (
              <div key={i}>
                <Badge value={r.verdict} />
                <strong>{r.reviewer}</strong>
                <small>{new Date(r.createdAt).toLocaleString()}</small>
                <p>{r.note || "No note provided."}</p>
              </div>
            ))}
          </section>
        )}
        <form onSubmit={submit}>
          <h3>Record a human assessment</h3>
          <p className="hint">
            Record your own bilingual assessment. The original automated
            decision stays visible for auditing.
          </p>
          <div className="form-grid">
            <label>
              Reviewer name
              <input
                required
                maxLength={100}
                value={reviewer}
                onChange={(e) => setReviewer(e.target.value)}
                placeholder="Your name"
              />
            </label>
            <label>
              Assessment
              <select
                value={verdict}
                onChange={(e) => setVerdict(e.target.value)}
              >
                <option value="UNCERTAIN">Uncertain</option>
                <option value="CORRECT">Correct translation</option>
                <option value="INCORRECT">Incorrect translation</option>
              </select>
            </label>
          </div>
          <label>
            Review note
            <textarea
              rows={3}
              maxLength={2000}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Explain the error or why the translation is acceptable"
            />
          </label>
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
          <footer>
            <span className="hint">Review records are append-only.</span>
            <button
              className="primary"
              disabled={busy || item.decision === "PENDING"}
            >
              {busy ? "Saving…" : "Save assessment"}
              <Check size={16} />
            </button>
          </footer>
        </form>
      </div>
    </Modal>
  );
}
