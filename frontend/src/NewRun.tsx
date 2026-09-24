import { useState } from "react";
import type { FormEvent } from "react";
import {
  ArrowRight,
  FileUp,
  FlaskConical,
  Languages,
  Sparkles,
} from "lucide-react";
import { api } from "./api";
import { Modal } from "./components";
import type { Config } from "./types";

export default function NewRun({
  config,
  onClose,
  onCreated,
  initialBenchmark = false,
}: {
  config: Config;
  onClose: () => void;
  onCreated: (id: string) => void;
  initialBenchmark?: boolean;
}) {
  const [benchmark, setBenchmark] = useState(initialBenchmark),
    [name, setName] = useState("Untitled translation run");
  const [source, setSource] = useState(config.sampleSentences.join("\n")),
    [languages, setLanguages] = useState(config.sampleLanguages);
  const [mode, setMode] = useState("FULL"),
    [audit, setAudit] = useState(20),
    [budget, setBudget] = useState(5),
    [context, setContext] = useState("");
  const [glossary, setGlossary] = useState("[]"),
    [pairs, setPairs] = useState(
      JSON.stringify(config.sampleBenchmark, null, 2),
    );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const sentences = source
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const payload = benchmark
        ? { name, pairs: JSON.parse(pairs), budgetUsd: budget }
        : {
            name,
            sentences,
            languages,
            mode,
            auditPercent: audit,
            budgetUsd: budget,
            context,
            glossary: JSON.parse(glossary),
          };
      const data = await api<{ id: string }>(
        benchmark ? "/benchmarks" : "/runs",
        { method: "POST", body: JSON.stringify(payload) },
      );
      onCreated(data.id);
    } catch (e) {
      setError(
        e instanceof SyntaxError
          ? "The JSON is invalid. Check the glossary or benchmark dataset."
          : (e as Error).message,
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={benchmark ? "Evaluate your validator" : "Create a translation run"}
      onClose={onClose}
      wide
    >
      <form onSubmit={submit} className="run-form">
        <div className="segmented">
          <button
            type="button"
            className={!benchmark ? "selected" : ""}
            onClick={() => setBenchmark(false)}
          >
            <Languages size={16} /> Translation
          </button>
          <button
            type="button"
            className={benchmark ? "selected" : ""}
            onClick={() => setBenchmark(true)}
          >
            <FlaskConical size={16} /> Benchmark
          </button>
        </div>
        <label>
          Run name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={120}
          />
        </label>
        {benchmark ? (
          <>
            <div className="callout">
              Supply labeled source–candidate pairs to measure missed errors.
              The included six examples demonstrate the workflow; qualified
              reviewers must verify your real benchmark.
            </div>
            <label>
              Benchmark pairs · JSON
              <textarea
                className="code-input"
                rows={12}
                value={pairs}
                onChange={(e) => setPairs(e.target.value)}
                required
              />
            </label>
            <label className="upload">
              <FileUp size={16} /> Import JSON
              <input
                type="file"
                accept=".json,application/json"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (f) {
                    if (f.size > 5_000_000) {
                      setError("File limit is 5 MB.");
                      return;
                    }
                    setPairs(await f.text());
                  }
                }}
              />
            </label>
          </>
        ) : (
          <>
            <div className="field-heading">
              <label htmlFor="sources">English source sentences</label>
              <label className="upload">
                <FileUp size={14} /> Import .txt
                <input
                  type="file"
                  accept=".txt,text/plain"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      if (f.size > 15_000_000) {
                        setError("File limit is 15 MB.");
                        return;
                      }
                      setSource(await f.text());
                    }
                  }}
                />
              </label>
            </div>
            <textarea
              id="sources"
              rows={5}
              value={source}
              onChange={(e) => setSource(e.target.value)}
              required
            />
            <p className="hint">
              One sentence per line · {sentences.length.toLocaleString()} /
              10,000 sentences
            </p>
            <div className="field-heading">
              <span>Target languages</span>
              <button
                type="button"
                className="text-button"
                onClick={() =>
                  setLanguages(
                    languages.length === 30
                      ? []
                      : Object.keys(config.languages),
                  )
                }
              >
                {languages.length === 30 ? "Clear selection" : "Select all 30"}
              </button>
            </div>
            <div className="language-picker">
              {Object.entries(config.languages)
                .sort((a, b) => a[1].localeCompare(b[1]))
                .map(([code, label]) => (
                  <label
                    key={code}
                    className={languages.includes(code) ? "checked" : ""}
                  >
                    <input
                      type="checkbox"
                      checked={languages.includes(code)}
                      onChange={() =>
                        setLanguages(
                          languages.includes(code)
                            ? languages.filter((l) => l !== code)
                            : [...languages, code],
                        )
                      }
                    />
                    {label}
                  </label>
                ))}
            </div>
            <div className="mode-options">
              <label className={mode === "FULL" ? "chosen" : ""}>
                <input
                  type="radio"
                  value="FULL"
                  checked={mode === "FULL"}
                  onChange={(e) => setMode(e.target.value)}
                />
                <strong>Full validation</strong>
                <span>Fresh-context review for every translation.</span>
              </label>
              <label className={mode === "SELECTIVE" ? "chosen" : ""}>
                <input
                  type="radio"
                  value="SELECTIVE"
                  checked={mode === "SELECTIVE"}
                  onChange={(e) => setMode(e.target.value)}
                />
                <strong>Selective validation</strong>
                <span>Review flagged items + a random audit sample.</span>
              </label>
            </div>
            {mode === "SELECTIVE" && (
              <label>
                Random audit rate · {audit}%
                <input
                  type="range"
                  min="1"
                  max="100"
                  value={audit}
                  onChange={(e) => setAudit(Number(e.target.value))}
                />
                <span className="hint">
                  Sampling is reproducible per run. Unchecked candidates stay
                  “Self-checked.”
                </span>
              </label>
            )}
            <details>
              <summary>Context & approved terminology</summary>
              <label>
                Domain context
                <textarea
                  rows={2}
                  maxLength={2000}
                  value={context}
                  onChange={(e) => setContext(e.target.value)}
                  placeholder="Audience, domain, tone and locale requirements"
                />
              </label>
              <label>
                Glossary · JSON array
                <textarea
                  className="code-input"
                  rows={3}
                  value={glossary}
                  onChange={(e) => setGlossary(e.target.value)}
                />
                <span className="hint">
                  Example:{" "}
                  {JSON.stringify([
                    { source: "invoice", language: "fr", target: "facture" },
                  ])}
                </span>
              </label>
            </details>
          </>
        )}
        <label>
          Run budget · USD
          <input
            type="number"
            min="0.01"
            max="1000"
            step="0.01"
            value={budget}
            onChange={(e) => setBudget(Number(e.target.value))}
            required
          />
          <span className="hint">
            Each call reserves its full output allowance before starting. A
            small remaining balance can stop the run early. Provider billing is
            authoritative.
          </span>
        </label>
        {config.provider === "demo" && (
          <div className="callout">
            <Sparkles size={17} />
            <span>
              Demo mode uses fixed sample translations and simulated usage. No
              API calls or charges. Custom content remains flagged.
            </span>
          </div>
        )}
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        <footer>
          <span>
            {benchmark
              ? "Validation only"
              : `${(sentences.length * languages.length).toLocaleString()} translation candidates`}
          </span>
          <button
            className="primary"
            type="submit"
            disabled={
              busy ||
              (!benchmark &&
                (!languages.length ||
                  !sentences.length ||
                  sentences.length > 10000))
            }
          >
            {busy
              ? "Creating…"
              : benchmark
                ? "Start benchmark"
                : "Start translation"}
            <ArrowRight size={16} />
          </button>
        </footer>
      </form>
    </Modal>
  );
}
