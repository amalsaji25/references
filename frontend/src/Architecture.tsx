import { useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  Database,
  FileText,
  Languages,
  ListChecks,
  ScanEye,
  ShieldCheck,
  Wallet,
  Workflow,
} from "lucide-react";
import type { Config } from "./types";
const steps = [
  {
    title: "Submit & persist",
    icon: FileText,
    tag: "REACT → JAVA API",
    text: "A run contains English sentences, target languages, a glossary, domain context, audit policy and USD budget. Bean Validation enforces limits. The API saves the request before returning a run ID.",
  },
  {
    title: "Translate & self-check",
    icon: Languages,
    tag: "GENERATOR",
    text: "The single worker takes one sentence and up to five target languages per call. Structured outputs return translations and compact self-checks. Model messages have no conversation history.",
  },
  {
    title: "Check & route",
    icon: ListChecks,
    tag: "APPLICATION RULES",
    text: "Java compares placeholders, numeric forms and glossary terms. Full mode routes every item to a fresh judge. Selective mode routes flagged items and a reproducible random sample. The rest remain SELF_CHECKED.",
  },
  {
    title: "Independent inspection",
    icon: ScanEye,
    tag: "VALIDATOR",
    text: "A new request sees only the original sentence, candidate, context and glossary. It returns explicit errors and evidence spans. The application checks identifiers, spans and severity. Shared-model bias remains possible.",
  },
  {
    title: "Measure & review",
    icon: ShieldCheck,
    tag: "QUALITY CONTROL",
    text: "Items and findings are persisted. Human assessments are recorded separately, preserving automated decisions. Labeled benchmark runs measure false accepts and false rejects by language. They do not prove production accuracy.",
  },
];
export default function Architecture({ config }: { config: Config }) {
  const [selected, setSelected] = useState(0),
    current = steps[selected];
  return (
    <div className="architecture-page">
      <div className="section-title">
        <div>
          <span className="eyebrow">BUILT FOR TRACEABILITY</span>
          <h2>From source to a defensible decision.</h2>
          <p>Every translation has a path. Every model call has a receipt.</p>
        </div>
        <Workflow size={42} strokeWidth={1} />
      </div>
      <section className="panel flow-panel">
        <div className="flow-steps">
          {steps.map((s, i) => (
            <div className="flow-pair" key={s.title}>
              <button
                className={`flow-step ${selected === i ? "current" : ""}`}
                onClick={() => setSelected(i)}
              >
                <span className="step-num">0{i + 1}</span>
                <s.icon size={25} />
                <strong>{s.title}</strong>
                <small>{s.tag}</small>
              </button>
              {i < 4 && <ArrowRight className="flow-arrow" size={18} />}
            </div>
          ))}
        </div>
        <div className="flow-detail">
          <span className="eyebrow">
            STEP 0{selected + 1} · {current.tag}
          </span>
          <h3>{current.title}</h3>
          <p>{current.text}</p>
        </div>
        <div className="data-rail">
          <Database size={20} />
          <div>
            <strong>Persistent relational database</strong>
            <span>runs · items · calls · reviews</span>
          </div>
          <span>H2 locally / PostgreSQL in Docker</span>
        </div>
      </section>
      <div className="two-col">
        <section className="panel architecture-card">
          <Wallet size={24} />
          <h3>Cost follows the call</h3>
          <p>
            A ledger reservation is written before the provider request. Usage
            is committed before parsing the result, so malformed outputs still
            retain their cost.
          </p>
          <code className="formula">
            ((input − cached) × input rate
            <br /> + cached × cached rate
            <br /> + output × output rate) / 1,000,000
          </code>
          <p className="hint">
            Cached tokens are part of input. Reasoning tokens are part of
            output. Neither is counted twice. Prices are USD per million tokens;
            tool charges and taxes are outside this text-only implementation.
          </p>
        </section>
        <section className="panel architecture-card">
          <ShieldCheck size={24} />
          <h3>Acceptance has a precise meaning</h3>
          <p>
            <strong>Accepted:</strong> the fresh judge and application checks
            found no material error.
          </p>
          <p>
            <strong>Self-checked:</strong> no independent judgment was
            performed. This is never shown as accepted.
          </p>
          <p>
            <strong>Review / Rejected:</strong> uncertainty or explicit findings
            require a human decision.
          </p>
          <p className="hint">
            Backtranslation and stronger-model escalation are future extensions.
            This version provides direct judging, deterministic checks, sampling
            and human assessments.
          </p>
        </section>
      </div>
      <section className="panel system-map">
        <div>
          <span className="eyebrow">RUNTIME</span>
          <h3>One deployable application, clear boundaries.</h3>
        </div>
        <div className="system-row">
          <div>
            <strong>React + TypeScript</strong>
            <small>Dashboard · forms · review</small>
          </div>
          <ArrowRight />
          <div>
            <strong>Java 17 + Spring Boot</strong>
            <small>REST · worker · policy · ledger</small>
          </div>
          <ArrowRight />
          <div>
            <strong>OpenAI Responses API</strong>
            <small>
              {config.generator}
              <br />
              {config.validator}
            </small>
          </div>
        </div>
        <div className="system-bottom">
          <ArrowDown size={18} />
          <span>JDBC + Flyway → H2 / PostgreSQL</span>
        </div>
        <p className="hint">
          The provider key stays on the server. Live API access requires an
          application bearer token. This release uses a single worker instance;
          distributed workers need leases, tenant authorization and centralized
          rate limiting.
        </p>
      </section>
    </div>
  );
}
