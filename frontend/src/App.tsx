import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Coins,
  ExternalLink,
  FlaskConical,
  Globe2,
  Layers3,
  LayoutDashboard,
  LockKeyhole,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Square,
  Wallet,
  Workflow,
  X,
} from "lucide-react";
import {
  active,
  api,
  ApiError,
  benchmarkMetrics,
  download,
  money,
  number,
  setToken,
} from "./api";
import { Badge, Empty, labels, Modal } from "./components";
import type { Call, Config, Item, Run } from "./types";
import NewRun from "./NewRun";
import ReviewItem from "./ReviewItem";
import Architecture from "./Architecture";

type Tab = "overview" | "review" | "usage" | "benchmarks" | "architecture";
const nav = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "review", label: "Translation review", icon: ScanIcon },
  { id: "usage", label: "Usage & cost", icon: Wallet },
  { id: "benchmarks", label: "Benchmarks", icon: FlaskConical },
  { id: "architecture", label: "Architecture", icon: Workflow },
] as const;
function ScanIcon({ size = 18 }: { size?: number }) {
  return <ShieldCheck size={size} />;
}
const titles: Record<Tab, string> = {
  overview: "Translation overview",
  review: "Translation review",
  usage: "Usage & cost",
  benchmarks: "Validator benchmarks",
  architecture: "System architecture",
};
export default function App() {
  const [config, setConfig] = useState<Config | null>(null),
    [runs, setRuns] = useState<Run[]>([]),
    [run, setRun] = useState<Run | null>(null),
    [runId, setRunId] = useState("");
  const [tab, setTab] = useState<Tab>("overview"),
    [filter, setFilter] = useState(""),
    [search, setSearch] = useState(""),
    [debounced, setDebounced] = useState(""),
    [page, setPage] = useState(0),
    [items, setItems] = useState<Item[]>([]),
    [total, setTotal] = useState(0);
  const [calls, setCalls] = useState<Call[]>([]),
    [callPage, setCallPage] = useState(0),
    [callTotal, setCallTotal] = useState(0),
    [call, setCall] = useState<Call | null>(null);
  const [newRun, setNewRun] = useState(false),
    [selectedItem, setSelectedItem] = useState<Item | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [needsAuth, setNeedsAuth] = useState(false),
    [tokenInput, setTokenInput] = useState(""),
    [connected, setConnected] = useState(false),
    [revision, setRevision] = useState(0),
    [settings, setSettings] = useState(false);
  const refresh = () => setRevision((r) => r + 1);
  const handleError = useCallback((e: unknown) => {
    if ((e as Error).name === "AbortError") return;
    if (e instanceof ApiError && e.status === 401) {
      setNeedsAuth(true);
      setConnected(false);
    } else setError((e as Error).message);
  }, []);
  useEffect(() => {
    const timeout = setTimeout(() => {
      setDebounced(search);
      setPage(0);
    }, 250);
    return () => clearTimeout(timeout);
  }, [search]);
  useEffect(() => {
    const ctrl = new AbortController();
    api<Config>("/config", { signal: ctrl.signal })
      .then((c) => {
        setConfig(c);
        setConnected(true);
        setNeedsAuth(false);
        setError("");
      })
      .catch(handleError);
    return () => ctrl.abort();
  }, [revision, handleError]);
  useEffect(() => {
    if (!config || needsAuth) return;
    const ctrl = new AbortController();
    let fetching = false;
    async function load() {
      if (fetching) return;
      fetching = true;
      try {
        const list = await api<Run[]>("/runs", { signal: ctrl.signal });
        if (ctrl.signal.aborted) return;
        setRuns(list);
        const id = runId || list[0]?.id;
        if (!id) {
          setConnected(true);
          return;
        }
        const [detail, data] = await Promise.all([
          api<Run>(`/runs/${id}`, { signal: ctrl.signal }),
          api<{ items: Item[]; total: number }>(
            `/runs/${id}/items?page=${page}&size=12&decision=${encodeURIComponent(filter)}&search=${encodeURIComponent(debounced)}`,
            { signal: ctrl.signal },
          ),
        ]);
        if (ctrl.signal.aborted) return;
        setRun(detail);
        setItems(data.items);
        setTotal(data.total);
        setConnected(true);
        setError("");
        if (tab === "usage") {
          const ledger = await api<{ calls: Call[]; total: number }>(
            `/runs/${id}/calls?page=${callPage}&size=15`,
            { signal: ctrl.signal },
          );
          if (!ctrl.signal.aborted) {
            setCalls(ledger.calls);
            setCallTotal(ledger.total);
          }
        }
      } catch (e) {
        handleError(e);
        if (!ctrl.signal.aborted) setConnected(false);
      } finally {
        fetching = false;
      }
    }
    void load();
    const timer = setInterval(load, 2500);
    return () => {
      ctrl.abort();
      clearInterval(timer);
    };
  }, [
    config,
    needsAuth,
    runId,
    page,
    filter,
    debounced,
    tab,
    callPage,
    revision,
    handleError,
  ]);
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 5000);
    return () => clearTimeout(t);
  }, [notice]);
  function switchRun(id: string) {
    setRunId(id);
    setRun(null);
    setItems([]);
    setPage(0);
    setCallPage(0);
    setFilter("");
    setSearch("");
  }
  function switchTab(t: Tab) {
    setTab(t);
    setPage(0);
    setFilter(t === "review" ? "FLAGGED" : "");
    setSearch("");
  }
  async function exportRun() {
    if (!run) return;
    try {
      await download(run.id);
      setNotice("Translation report exported.");
    } catch (e) {
      handleError(e);
    }
  }
  const sum = run?.summary,
    counts = Object.fromEntries(
      sum?.decisions.map((d) => [d.decision, d.count]) || [],
    );
  const flagged = (counts.REVIEW || 0) + (counts.REJECT || 0),
    independent = sum?.languages.reduce((n, l) => n + l.accepted, 0) || 0;
  const budget = run?.config.budgetUsd || 1;
  function created(id: string) {
    setNewRun(false);
    switchRun(id);
    setTab("overview");
    refresh();
    setNotice("Run queued. Progress and usage will update automatically.");
  }
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            switchTab("overview");
          }}
          aria-label="Lingua Audit home"
        >
          <span className="brand-mark">
            L<span />
          </span>
          <span>
            lingua<span className="brand-sub">AUDIT</span>
          </span>
        </a>
        <div className="workspace-switch">
          <div className="workspace-avatar">T</div>
          <div>
            <strong>Translation workspace</strong>
            <small>Quality operations</small>
          </div>
          <ChevronDown size={15} />
        </div>
        <span className="nav-caption">WORKSPACE</span>
        <nav>
          {nav.map((n) => (
            <button
              key={n.id}
              className={tab === n.id ? "active" : ""}
              onClick={() => switchTab(n.id)}
            >
              <n.icon size={18} />
              {n.label}
              {n.id === "review" && flagged > 0 && (
                <span className="nav-count">{flagged}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <div className="small-spark">
            <Sparkles size={18} />
          </div>
          <strong>Trust, with evidence.</strong>
          <p>Make translation quality measurable, one decision at a time.</p>
          <button onClick={() => switchTab("architecture")}>
            Explore the pipeline <ArrowRight size={14} />
          </button>
        </div>
        <button className="settings-nav" onClick={() => setSettings(true)}>
          <Settings2 size={17} /> Configuration
        </button>
        <div className="sidebar-footer">
          <span className={`dot ${connected ? "" : "offline"}`} />
          <div>
            <strong>
              {connected ? "Backend connected" : "Connecting to backend"}
            </strong>
            <small>Java API · persistent storage</small>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div>
            <span className="crumb">Workspace</span>
            <span className="slash">/</span>
            <strong>{titles[tab]}</strong>
          </div>
          <div className="topbar-right">
            <span
              className={`environment ${config?.provider === "demo" ? "demo" : "live"}`}
            >
              <span className="dot" />
              {config?.provider === "demo"
                ? "Demo environment"
                : config
                  ? "Live environment"
                  : "Connecting"}
            </span>
            <button
              className="icon-button"
              aria-label="Refresh data"
              onClick={refresh}
            >
              <RefreshCw size={16} />
            </button>
            <span className="avatar">LA</span>
          </div>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <span className="eyebrow">TRANSLATION ASSURANCE</span>
              <h1>{titles[tab]}</h1>
              <p>
                {tab === "overview"
                  ? "Translate at scale. See the quality. Know the cost."
                  : tab === "review"
                    ? "Inspect the evidence and record your own assessment."
                    : tab === "usage"
                      ? "A transparent ledger for every model call."
                      : tab === "benchmarks"
                        ? "Measure what your validator catches—and what it misses."
                        : "A clear path from source text to reviewed translations."}
              </p>
            </div>
            <button
              className="primary"
              disabled={!config}
              onClick={() => setNewRun(true)}
            >
              <Plus size={17} />
              {tab === "benchmarks" ? "New benchmark" : "New translation"}
            </button>
          </div>
          {config?.provider === "demo" && (
            <div className="demo-banner">
              <Sparkles size={16} />
              <span>
                <strong>You’re exploring the demo.</strong> Sample translations
                and token usage are simulated. No API charges.
              </span>
              <button onClick={() => setSettings(true)}>
                Connect a provider <ArrowRight size={14} />
              </button>
            </div>
          )}
          {error && (
            <div className="error" role="alert">
              {error}
              <button onClick={refresh}>Retry</button>
            </div>
          )}
          {tab === "architecture" && config ? (
            <Architecture config={config} />
          ) : (
            <>
              <div className="run-toolbar">
                <div className="run-select">
                  <Layers3 size={17} />
                  <select
                    aria-label="Select run"
                    value={run?.id || runId}
                    onChange={(e) => switchRun(e.target.value)}
                  >
                    {!runs.length && <option>No runs yet</option>}
                    {runs.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                        {r.kind === "BENCHMARK" ? " · benchmark" : ""}
                      </option>
                    ))}
                  </select>
                  {run && <Badge value={run.status} />}
                </div>
                <div className="toolbar-actions">
                  {run && (
                    <span className="muted run-date">
                      {new Date(run.createdAt).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>
                  )}
                  <button
                    className="secondary"
                    disabled={!run}
                    onClick={exportRun}
                  >
                    <ArrowDownToLine size={15} /> Export CSV
                  </button>
                </div>
              </div>
              {!run ? (
                <Empty
                  title={
                    runs.length
                      ? "Loading your run…"
                      : "Your first run starts here"
                  }
                  description="Add English sentences and target languages to see translations, validation evidence and call costs."
                />
              ) : (
                <>
                  {active(run.status) && (
                    <div className="progress-strip">
                      <Activity size={17} />
                      <div>
                        <strong>
                          {run.cancelRequested
                            ? "Finishing the current call before cancelling…"
                            : `${number(run.processed)} of ${number(run.totalItems)} candidates processed`}
                        </strong>
                        <div className="progress-track">
                          <span
                            style={{
                              width: `${(100 * run.processed) / Math.max(1, run.totalItems)}%`,
                            }}
                          />
                        </div>
                      </div>
                      <button
                        className="text-button"
                        disabled={run.cancelRequested}
                        onClick={async () => {
                          try {
                            await api(`/runs/${run.id}/cancel`, {
                              method: "POST",
                            });
                            refresh();
                          } catch (e) {
                            handleError(e);
                          }
                        }}
                      >
                        <Square size={13} /> Cancel run
                      </button>
                    </div>
                  )}
                  {!active(run.status) && run.status !== "COMPLETED" && (
                    <div className="callout warning">{run.message}</div>
                  )}
                  <div className="stats-grid">
                    <Stat
                      label="Translation candidates"
                      value={number(run.totalItems)}
                      subtitle={`${number(run.processed)} processed · ${sum?.languages.length || run.config.languages?.length || 0} languages`}
                      icon={<Globe2 size={19} />}
                    />
                    <Stat
                      label="Independently accepted"
                      value={number(independent)}
                      subtitle={`${number(flagged)} flagged · ${number(counts.SELF_CHECKED || 0)} self-checked`}
                      icon={<ShieldCheck size={19} />}
                    />
                    <Stat
                      label={
                        run.provider === "demo"
                          ? "Simulated tokens"
                          : "Reported tokens"
                      }
                      value={number(
                        (sum?.inputTokens || 0) + (sum?.outputTokens || 0),
                      )}
                      subtitle={`${number(sum?.callCount)} model calls · ${number(sum?.cachedTokens)} cached input`}
                      icon={<Layers3 size={19} />}
                    />
                    <Stat
                      label={
                        run.provider === "demo"
                          ? "Simulated cost · USD"
                          : "Calculated cost · USD"
                      }
                      value={money(sum?.costUsd)}
                      subtitle={
                        sum?.unknownCalls
                          ? `${sum.unknownCalls} calls have unknown billing`
                          : `of ${money(budget)} run budget`
                      }
                      icon={<Coins size={19} />}
                      highlight
                    />
                  </div>
                  {sum && tab === "overview" && (
                    <>
                      <div className="overview-grid">
                        <section className="panel quality-panel">
                          <div className="panel-heading">
                            <div>
                              <span className="eyebrow">
                                QUALITY AT A GLANCE
                              </span>
                              <h2>Every decision, accounted for.</h2>
                            </div>
                            <ShieldCheck size={20} />
                          </div>
                          <div className="quality-content">
                            <QualityRing
                              counts={counts}
                              processed={run.processed}
                            />
                            <div className="quality-legend">
                              {[
                                "ACCEPT",
                                "SELF_CHECKED",
                                "REVIEW",
                                "REJECT",
                                "PENDING",
                              ].map((d) => (
                                <button
                                  key={d}
                                  onClick={() => {
                                    setFilter(d);
                                    setTab("review");
                                    setPage(0);
                                  }}
                                >
                                  <span
                                    className={`legend-dot ${d.toLowerCase()}`}
                                  />
                                  <span>{labels[d]}</span>
                                  <strong>{number(counts[d] || 0)}</strong>
                                  <ChevronRight size={13} />
                                </button>
                              ))}
                            </div>
                          </div>
                          <div className="panel-footnote">
                            Acceptance means no material error detected. Human
                            audits remain essential.
                          </div>
                        </section>
                        <section className="panel spend-panel">
                          <div className="panel-heading">
                            <div>
                              <span className="eyebrow">TOKEN ECONOMICS</span>
                              <h2>Where your usage goes</h2>
                            </div>
                            <button
                              className="icon-button"
                              aria-label="View usage ledger"
                              onClick={() => switchTab("usage")}
                            >
                              <ExternalLink size={16} />
                            </button>
                          </div>
                          <div className="spend-bars">
                            {["TRANSLATE", "VALIDATE"].map((stage, i) => {
                              const s = sum.stages.find(
                                (s) => s.stage === stage,
                              );
                              return (
                                <div key={stage}>
                                  <div className="bar-heading">
                                    <span>
                                      <i className={i ? "sage" : "green"} />
                                      {i
                                        ? "Independent validation"
                                        : "Translation & self-check"}
                                    </span>
                                    <strong>
                                      {number(
                                        (s?.inputTokens || 0) +
                                          (s?.outputTokens || 0),
                                      )}
                                      <small> tokens</small>
                                    </strong>
                                  </div>
                                  <div className="bar-track">
                                    <span
                                      className={i ? "sage" : "green"}
                                      style={{
                                        width: `${(100 * ((s?.inputTokens || 0) + (s?.outputTokens || 0))) / Math.max(1, sum.inputTokens + sum.outputTokens)}%`,
                                      }}
                                    />
                                  </div>
                                  <small>
                                    {money(s?.costUsd || 0)} ·{" "}
                                    {s?.callCount || 0} calls
                                  </small>
                                </div>
                              );
                            })}
                          </div>
                          <div className="spend-footer">
                            <span>Application checks</span>
                            <strong>
                              <Check size={14} /> 0 tokens
                            </strong>
                          </div>
                        </section>
                      </div>
                      <div className="pipeline-strip">
                        <span>
                          <Workflow size={16} /> VALIDATION PIPELINE
                        </span>
                        {[
                          "Translate",
                          "Rule checks",
                          run.mode === "FULL"
                            ? "Review all"
                            : "Sample & review",
                          "Human audit",
                        ].map((s, i) => (
                          <div key={s}>
                            {i > 0 && <ArrowRight size={13} />}
                            <span>
                              <i>{i + 1}</i>
                              {s}
                            </span>
                          </div>
                        ))}
                        <button
                          className="text-button"
                          onClick={() => switchTab("architecture")}
                        >
                          View flow
                          <ArrowRight size={13} />
                        </button>
                      </div>
                    </>
                  )}
                  {sum && tab === "usage" && (
                    <>
                      <section className="panel budget-panel">
                        <div>
                          <span className="eyebrow">BUDGET GUARD</span>
                          <h2>
                            {money(sum.costUsd)}{" "}
                            <span className="muted">/ {money(budget)}</span>
                          </h2>
                          <p>
                            {money(sum.unresolvedReserveUsd)} reserved or
                            unresolved · {sum.unknownCalls} unknown calls
                          </p>
                        </div>
                        <div>
                          <div className="budget-track">
                            <span
                              style={{
                                width: `${Math.min(100, (100 * (Number(sum.costUsd) + Number(sum.unresolvedReserveUsd))) / budget)}%`,
                              }}
                            />
                          </div>
                          <p className="hint">
                            Reported cost plus unresolved reservations. Calls
                            stop before exceeding their estimated allowance;
                            reconcile against provider billing.
                          </p>
                        </div>
                      </section>
                      <div className="token-split">
                        {[
                          [
                            "Input tokens",
                            sum.inputTokens,
                            "Includes cached input",
                          ],
                          [
                            "Cached input",
                            sum.cachedTokens,
                            "Subset of input, discounted",
                          ],
                          [
                            "Output tokens",
                            sum.outputTokens,
                            "Includes reasoning",
                          ],
                          [
                            "Reasoning tokens",
                            sum.reasoningTokens,
                            "Subset of output",
                          ],
                        ].map(([l, v, h]) => (
                          <div key={l}>
                            <span>{l}</span>
                            <strong>{number(v as number)}</strong>
                            <small>{h}</small>
                          </div>
                        ))}
                      </div>
                      <section className="panel ledger-panel">
                        <div className="panel-heading">
                          <div>
                            <h2>Model call ledger</h2>
                            <p>
                              Click a call to inspect rates, request IDs and
                              accounting details.
                            </p>
                          </div>
                          <span className="count-pill">{callTotal} calls</span>
                        </div>
                        <div className="table-scroll">
                          <table>
                            <thead>
                              <tr>
                                <th>Stage / model</th>
                                <th>Usage source</th>
                                <th>Input</th>
                                <th>Cached</th>
                                <th>Output</th>
                                <th>Cost · USD</th>
                                <th>Latency</th>
                                <th />
                              </tr>
                            </thead>
                            <tbody>
                              {calls.map((c) => (
                                <tr key={c.id}>
                                  <td>
                                    <strong>
                                      {c.stage === "TRANSLATE"
                                        ? "Translation"
                                        : "Validation"}
                                    </strong>
                                    <small>{c.model}</small>
                                  </td>
                                  <td>
                                    <Badge value={c.status} />
                                  </td>
                                  <td>{number(c.inputTokens)}</td>
                                  <td>{number(c.cachedTokens)}</td>
                                  <td>{number(c.outputTokens)}</td>
                                  <td className="mono">{money(c.costUsd)}</td>
                                  <td>{(c.durationMs / 1000).toFixed(2)}s</td>
                                  <td>
                                    <button
                                      className="icon-button"
                                      aria-label={`Inspect ${c.stage.toLowerCase()} call ${c.id}`}
                                      onClick={() => setCall(c)}
                                    >
                                      <ChevronRight size={16} />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        {!calls.length && (
                          <Empty
                            title="No model calls yet"
                            description="Calls appear here as the worker processes this run."
                          />
                        )}
                        <Pagination
                          page={callPage}
                          size={15}
                          total={callTotal}
                          onChange={setCallPage}
                        />
                      </section>
                      <p className="hint">
                        Calculated cost uses the price stored with each call. It
                        is not an invoice. All demo ledger rows are simulated.
                      </p>
                    </>
                  )}
                  {sum && tab === "benchmarks" && (
                    <BenchmarkPanel
                      run={run}
                      config={config}
                      onNew={() => setNewRun(true)}
                    />
                  )}
                  {(tab === "overview" || tab === "review") && (
                    <section className="panel results-panel">
                      <div className="panel-heading">
                        <div>
                          <h2>
                            {tab === "overview"
                              ? "Translation results"
                              : "Review workbench"}{" "}
                            <span className="count-pill">{number(total)}</span>
                          </h2>
                          <p>
                            Source, candidate and supporting evidence in one
                            place.
                          </p>
                        </div>
                        <div className="table-tools">
                          <div className="search-box">
                            <Search size={15} />
                            <input
                              aria-label="Search translations"
                              placeholder="Search translations…"
                              value={search}
                              onChange={(e) => setSearch(e.target.value)}
                            />
                          </div>
                          <select
                            aria-label="Filter by decision"
                            value={filter}
                            onChange={(e) => {
                              setFilter(e.target.value);
                              setPage(0);
                            }}
                          >
                            <option value="">All decisions</option>
                            <option value="FLAGGED">All flagged</option>
                            {[
                              "ACCEPT",
                              "SELF_CHECKED",
                              "REVIEW",
                              "REJECT",
                              "PENDING",
                            ].map((d) => (
                              <option key={d} value={d}>
                                {labels[d]}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div className="table-scroll">
                        <table className="results-table">
                          <thead>
                            <tr>
                              <th>Language</th>
                              <th>Source → translation</th>
                              <th>Validation</th>
                              <th>Evidence</th>
                              <th />
                            </tr>
                          </thead>
                          <tbody>
                            {items.map((item) => (
                              <tr key={item.id}>
                                <td>
                                  <div className="language-cell">
                                    <span className="locale-square">
                                      {item.language.slice(0, 2).toUpperCase()}
                                    </span>
                                    <div>
                                      <strong>
                                        {config?.languages[item.language]}
                                      </strong>
                                      <small>
                                        Sentence {item.sourceIndex + 1}
                                      </small>
                                    </div>
                                  </div>
                                </td>
                                <td className="translation-cell">
                                  <span>{item.sourceText}</span>
                                  <strong dir="auto" lang={item.language}>
                                    {item.translation ||
                                      "No translation available"}
                                  </strong>
                                </td>
                                <td>
                                  <Badge value={item.decision} />
                                  <small>
                                    {item.reviews.length
                                      ? "Human assessment recorded"
                                      : item.auditSample
                                        ? "Random audit sample"
                                        : item.independentCheck
                                          ? "Fresh-context check"
                                          : "Generator self-check"}
                                  </small>
                                </td>
                                <td>
                                  <span
                                    className={
                                      item.findings.length
                                        ? "finding-count"
                                        : "muted"
                                    }
                                  >
                                    {item.findings.length
                                      ? `${item.findings.length} finding${item.findings.length > 1 ? "s" : ""}`
                                      : "No findings"}
                                  </span>
                                </td>
                                <td>
                                  <button
                                    className="icon-button"
                                    aria-label={`Review ${config?.languages[item.language]} sentence ${item.sourceIndex + 1}`}
                                    onClick={() => setSelectedItem(item)}
                                  >
                                    <ChevronRight size={16} />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {!items.length && (
                        <Empty
                          title={
                            active(run.status)
                              ? "Translations are on their way"
                              : "No matching translations"
                          }
                          description={
                            active(run.status)
                              ? "The worker is processing the next batch. This view updates automatically."
                              : "Try a different decision filter or search term."
                          }
                        />
                      )}
                      <Pagination
                        page={page}
                        size={12}
                        total={total}
                        onChange={setPage}
                      />
                    </section>
                  )}
                </>
              )}
            </>
          )}
          <footer className="page-footer">
            <span>
              <span className="tiny-brand">L</span> Lingua Audit
            </span>
            <span>
              Evidence before confidence. <span className="footer-dot">·</span>{" "}
              All costs in USD
            </span>
          </footer>
        </main>
      </div>
      {notice && (
        <div className="toast" role="status">
          <Check size={16} />
          {notice}
          <button
            className="icon-button"
            onClick={() => setNotice("")}
            aria-label="Dismiss notification"
          >
            <X size={15} />
          </button>
        </div>
      )}
      {newRun && config && (
        <NewRun
          config={config}
          initialBenchmark={tab === "benchmarks"}
          onClose={() => setNewRun(false)}
          onCreated={created}
        />
      )}
      {selectedItem && config && (
        <ReviewItem
          item={selectedItem}
          config={config}
          onClose={() => setSelectedItem(null)}
          onSaved={() => {
            setSelectedItem(null);
            refresh();
            setNotice("Human assessment saved.");
          }}
        />
      )}
      {call && (
        <Modal title="Call accounting details" onClose={() => setCall(null)}>
          <div className="call-detail">
            <Badge value={call.status} />
            <h3>{call.model}</h3>
            <dl>
              {[
                ["Stage", call.stage],
                [
                  "Input / cached / output",
                  `${number(call.inputTokens)} / ${number(call.cachedTokens)} / ${number(call.outputTokens)}`,
                ],
                [
                  "Reasoning (included in output)",
                  number(call.reasoningTokens),
                ],
                ["Calculated cost", money(call.costUsd)],
                ["Original reservation", money(call.reservedUsd)],
                [
                  "Rates per 1M (input / cached / output)",
                  `${money(call.inputRate)} / ${money(call.cachedRate)} / ${money(call.outputRate)}`,
                ],
                ["Price snapshot", call.priceVersion],
                ["Provider response ID", call.responseId || "Unavailable"],
                ["Provider request ID", call.requestId || "Unavailable"],
                ["Created", new Date(call.createdAt).toLocaleString()],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
            {call.error && <div className="error">{call.error}</div>}
            <p className="hint">
              A failed or malformed response can still incur charges. Unknown
              usage retains its reservation until reconciled externally.
            </p>
          </div>
        </Modal>
      )}
      {settings && (
        <Modal
          title="Provider configuration"
          onClose={() => setSettings(false)}
        >
          <div className="settings-content">
            <div className="callout">
              <LockKeyhole size={20} />
              API keys are configured on the Java server and never sent to this
              browser.
            </div>
            <h3>
              {config?.provider === "demo"
                ? "Demo mode is active"
                : "OpenAI is connected"}
            </h3>
            <p>
              To enable live translation, set the server environment and
              restart:
            </p>
            <pre>
              LLM_PROVIDER=openai{"\n"}OPENAI_API_KEY=your-api-key{"\n"}
              APP_ACCESS_TOKEN=your-24-character-or-longer-token{"\n"}
              SEED_DEMO=false
            </pre>
            <p>
              The app will ask for the application access token. It stays in
              browser memory until the page closes or reloads.
            </p>
            <h3>Configured prices · USD / 1M tokens</h3>
            {config &&
              Object.entries(config.prices).map(([model, r]) => (
                <div className="price-row" key={model}>
                  <strong>{model}</strong>
                  <span>
                    Input ${r.input} · cached ${r.cached} · output ${r.output}
                  </span>
                </div>
              ))}
            <p className="hint">
              Prices are versioned in Pricing.java. Model availability and
              production translation quality must be verified for your account
              and language mix.
            </p>
            <button
              className="secondary"
              onClick={() => {
                setSettings(false);
                setNeedsAuth(true);
              }}
            >
              Enter application access token
            </button>
          </div>
        </Modal>
      )}
      {needsAuth && (
        <Modal
          title="Connect to your workspace"
          onClose={() => setNeedsAuth(false)}
        >
          <form
            className="auth-form"
            onSubmit={(e) => {
              e.preventDefault();
              setToken(tokenInput);
              setTokenInput("");
              setNeedsAuth(false);
              refresh();
            }}
          >
            <p>
              Enter the server’s APP_ACCESS_TOKEN. Your OpenAI API key belongs
              only on the server.
            </p>
            <label>
              Application access token
              <input
                type="password"
                required
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                autoComplete="off"
              />
            </label>
            <button className="primary">
              Connect
              <ArrowRight size={16} />
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}
function Stat({
  label,
  value,
  subtitle,
  icon,
  highlight = false,
}: {
  label: string;
  value: string;
  subtitle: string;
  icon: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <section className={`stat ${highlight ? "highlight" : ""}`}>
      <div>
        <span>{label}</span>
        {icon}
      </div>
      <strong>{value}</strong>
      <p>{subtitle}</p>
    </section>
  );
}
function QualityRing({
  counts,
  processed,
}: {
  counts: Record<string, number>;
  processed: number;
}) {
  const colors: Record<string, string> = {
    ACCEPT: "#367c66",
    SELF_CHECKED: "#a9cba5",
    REVIEW: "#d3ae59",
    REJECT: "#b97567",
    PENDING: "#e7eae7",
  };
  const total = Object.values(counts).reduce((a, b) => a + b, 0) || 1;
  let cursor = 0;
  const stops = Object.entries(colors).map(([key, color]) => {
    const start = cursor;
    cursor += (100 * (counts[key] || 0)) / total;
    return `${color} ${start}% ${cursor}%`;
  });
  return (
    <div
      className="quality-ring"
      role="img"
      aria-label={`${processed} processed candidates, ${counts.ACCEPT || 0} accepted, ${counts.REJECT || 0} rejected`}
      style={{
        background: processed
          ? `conic-gradient(${stops.join(",")})`
          : "#e7eae7",
      }}
    >
      <div>
        <strong>{number(processed)}</strong>
        <span>processed</span>
      </div>
    </div>
  );
}
function Pagination({
  page,
  size,
  total,
  onChange,
}: {
  page: number;
  size: number;
  total: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="pagination">
      <span>
        {total
          ? `${number(page * size + 1)}–${number(Math.min((page + 1) * size, total))} of ${number(total)}`
          : "0 results"}
      </span>
      <div>
        <button
          className="icon-button"
          disabled={!page}
          onClick={() => onChange(page - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft size={17} />
        </button>
        <span>Page {page + 1}</span>
        <button
          className="icon-button"
          disabled={(page + 1) * size >= total}
          onClick={() => onChange(page + 1)}
          aria-label="Next page"
        >
          <ChevronRight size={17} />
        </button>
      </div>
    </div>
  );
}
function BenchmarkPanel({
  run,
  config,
  onNew,
}: {
  run: Run;
  config: Config | null;
  onNew: () => void;
}) {
  const rows = run.summary.benchmark,
    m = benchmarkMetrics(rows),
    languages = [...new Set(rows.map((r) => r.language))];
  const reviewed = run.summary.humanAudit,
    acceptedAudit = reviewed.filter(
      (r) => r.decision === "ACCEPT" && r.verdict !== "UNCERTAIN",
    ),
    acceptedCount = acceptedAudit.reduce((n, r) => n + r.count, 0),
    missed = acceptedAudit
      .filter((r) => r.verdict === "INCORRECT")
      .reduce((n, r) => n + r.count, 0);
  return (
    <>
      <section className="panel benchmark-panel">
        <div className="panel-heading">
          <div>
            <h2>Known-answer evaluation</h2>
            <p>
              False-accept rate = accepted bad candidates / all evaluated bad
              candidates.
            </p>
          </div>
          <button className="secondary" onClick={onNew}>
            <Plus size={15} /> Benchmark
          </button>
        </div>
        {rows.length ? (
          <>
            <div className="benchmark-metrics">
              <div>
                <span>Bad candidates evaluated</span>
                <strong>{m.bad}</strong>
              </div>
              <div>
                <span>False accepts</span>
                <strong>
                  {m.falseAccepts} <small>/ {m.bad}</small>
                </strong>
              </div>
              <div>
                <span>False-accept rate</span>
                <strong>
                  {m.falseAcceptRate === null
                    ? "N/A"
                    : `${(m.falseAcceptRate * 100).toFixed(1)}%`}
                </strong>
              </div>
              <div>
                <span>Good candidates flagged</span>
                <strong>
                  {m.flaggedGood} <small>/ {m.good}</small>
                </strong>
              </div>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Language</th>
                    <th>Good / bad cases</th>
                    <th>False accepts</th>
                    <th>False rejects</th>
                    <th>Unnecessary flags</th>
                  </tr>
                </thead>
                <tbody>
                  {languages.map((l) => {
                    const x = benchmarkMetrics(
                      rows.filter((r) => r.language === l),
                    );
                    return (
                      <tr key={l}>
                        <td>{config?.languages[l] || l}</td>
                        <td>
                          {x.good} / {x.bad}
                        </td>
                        <td>
                          {x.falseAccepts} / {x.bad}
                        </td>
                        <td>
                          {x.falseRejects} / {x.good}
                        </td>
                        <td>
                          {x.flaggedGood} / {x.good}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="panel-footnote">
              Pending items are excluded. Small or unrepresentative datasets do
              not establish production reliability. Demo results test fixtures
              only.
            </div>
          </>
        ) : (
          <Empty
            title="Test the judge against known answers"
            description="Create a benchmark with verified correct translations and deliberately introduced errors to measure the complete validation pipeline."
          >
            <button className="primary" onClick={onNew}>
              <FlaskConical size={16} /> Create benchmark
            </button>
          </Empty>
        )}
      </section>
      <section className="panel audit-panel">
        <h2>Human assessment of accepted translations</h2>
        <p>
          <strong>
            {missed} incorrect / {acceptedCount} assessed
          </strong>{" "}
          ·{" "}
          {acceptedCount
            ? `${((100 * missed) / acceptedCount).toFixed(1)}%`
            : "No rate yet"}
        </p>
        <p className="hint">
          Latest definitive human verdict per item. Uncertain verdicts are
          excluded. This observed proportion describes your reviewed subset; it
          estimates production quality only with representative sampling.
        </p>
      </section>
    </>
  );
}
