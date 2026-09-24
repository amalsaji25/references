# Lingua Audit

A runnable translation-assurance application with a **Java 17 / Spring Boot backend** and **React / TypeScript frontend**. Generate translations, run deterministic checks and fresh-context validation, inspect evidence, record human assessments, and account for tokens and USD cost per model call.

The default is an **offline demo** with fixed sample translations and deliberately injected errors. Demo usage is simulated and clearly labeled. Live mode uses the OpenAI Responses API; no real API calls are made unless you configure live mode.

## Start the application

### Ready-built application

If you received the standalone `lingua-audit.jar`, Java 17 or later is the only requirement:

```bash
java -jar lingua-audit.jar
```

Open **http://localhost:8080**. The React UI is inside the JAR. A persistent H2 database is created under `./data` relative to the launch directory. The first demo launch seeds one sample run with 18 candidates across six languages. Three intentionally flawed candidates exercise the validation pipeline.

### Build from source

Requirements: Java 17+, Maven 3.9+, Node.js 24+, pnpm 11.19.0. Use `npm install --global pnpm@11.19.0` if pnpm is unavailable.

```bash
bash scripts/build.sh
bash scripts/run.sh
```

The build runs Java and React tests, compiles the frontend, embeds it in Spring Boot, and produces `backend/target/lingua-audit-1.0.0.jar`.

For separate development servers:

```bash
bash scripts/dev.sh
```

React runs on http://localhost:5173 and proxies `/api` to Java on port 8080. `Ctrl+C` stops the development process. For environments where Maven child processes persist, run the backend and frontend in separate terminals.

### Docker with PostgreSQL

```bash
cp .env.example .env
# Adjust the development database password in .env.
docker compose up --build
```

Open http://localhost:8080. PostgreSQL has a persistent volume and is not published on a host port. The application is bound to the host loopback interface. Run **one application replica** with this worker implementation. Docker/PostgreSQL configuration is supplied; local verification used H2 because no Docker daemon was available.

## Live translation

Keep secrets on the server. Local Java reads exported environment variables; Docker Compose reads `.env`.

```bash
export LLM_PROVIDER=openai
export OPENAI_API_KEY='your-provider-key'
export APP_ACCESS_TOKEN='a-random-secret-at-least-24-characters-long'
export SEED_DEMO=false
java -jar lingua-audit.jar
```

The UI asks for `APP_ACCESS_TOKEN`, **not** your OpenAI key. The application token stays in browser memory and must be re-entered after reload. Live mode refuses to start without a provider key and a sufficiently long application token. An actual provider response has not been tested with your account; the adapter is tested against a local HTTP stub for success and failure responses.

Models are pinned to `gpt-4.1-2025-04-14` for generation and `gpt-4.1-mini-2025-04-14` for validation. These are an implemented, priced same-family pair, not a claim of optimal translation quality. Benchmark your content and languages before relying on automatic acceptance. To add another model, extend the explicit price registry and verify its Responses API compatibility.

## What is implemented

- Up to **10,000 source sentences × 30 target languages** per run. Limits are enforced by the backend. This is a functional capacity limit, not a throughput benchmark.
- One English sentence × up to five languages per generation call, with bounded structured output.
- Full fresh-context validation, or selective validation of flagged translations plus reproducible random audits.
- Exact placeholder multiplicity checks; conservative numeric and glossary checks.
- Source/target evidence spans, error categories, severity and explicit uncertainty.
- A review workbench with original text, translation, evidence, and append-only human assessment history.
- Labeled benchmark runs, per-language false accepts/rejects, and reviewed accepted-item error proportions.
- Persistent runs, cancellation between calls, crash recovery without automatic paid-call replay, and a five-run queue limit.
- Provider-reported input, cached input, output and reasoning tokens; per-call pricing snapshots; decimal USD calculations; unknown-usage reservations.
- Search, pagination, language summaries, CSV export with spreadsheet-formula escaping, mobile layouts, and an interactive architecture screen.
- Flyway migrations, H2 locally, PostgreSQL configuration, a multi-stage Dockerfile, and tests.

## Validation semantics

| Status | Meaning |
| --- | --- |
| Accepted | A fresh judge and application checks detected no material error. This is not a correctness guarantee. |
| Self-checked | Generation self-check passed, but no fresh validation was performed. It is never counted as accepted. |
| Needs review | Uncertainty, numeric/terminology discrepancy or unverifiable evidence needs human assessment. |
| Rejected | A major/critical finding or a protected-content violation was detected. |
| Pending | Work is incomplete, including candidates retained after a budget stop or failed validation call. |

Human judgments are stored separately. Recording “Correct” for an automated rejection does not erase the rejection; that disagreement is important evaluation data. The latest definitive human verdict is used for audit summaries. An uncertain latest verdict excludes the item from the definitive-assessment denominator.

In demo mode, only the three sample sentences and six sample languages have fixed translation fixtures. Other inputs are flagged; they are not presented as real translations. The sample benchmark is illustrative, not an independently certified multilingual gold set.

## Token and cost accounting

Each model call has its own ledger row. Currency calculations use Java `BigDecimal` and database decimal columns.

```text
cost USD = ((input − cached) × input_price
            + cached × cached_price
            + output × output_price) / 1,000,000
```

`cached` is a subset of input; reasoning is a subset of output. Neither is added to the total a second time. The dashboard’s total tokens are input + output. A 1,000-input / 200-cached / 100-output GPT-4.1 call costs $0.0025 at the configured standard rates, even if 40 of the output tokens were reasoning.

| Model | Input / 1M | Cached / 1M | Output / 1M |
| --- | ---: | ---: | ---: |
| GPT-4.1 | $2.00 | $0.50 | $8.00 |
| GPT-4.1 mini | $0.40 | $0.10 | $1.60 |

Pricing snapshot: `2026-09-23-standard`. Rates are copied into each call row, so changing future configuration does not reprice historical calls. Cost is a calculation using provider-reported counters and configured rates, **not an invoice**. Taxes, account discounts and non-text tools are not modeled.

A pre-call guard reserves a conservative input allowance (serialized UTF-8 request bytes + framing allowance) and the entire output cap, without assuming cache hits. The next call stops if its allowance exceeds the remaining budget. This may stop well before the nominal budget is exhausted. It is a safeguard, not a provider-enforced financial ceiling. Enforce provider project limits as well when operating a production service.

If a timeout, HTTP error or absent usage prevents accounting, usage and cost remain **unknown** and the reservation remains committed. Malformed/refused/incomplete outputs with valid usage retain their reported token cost. There are no automatic retries of ambiguous paid calls. Reconcile unresolved calls against provider logs using captured request/response IDs where available; an automated billing reconciliation workflow is not included.

## Project layout

```text
backend/
  src/main/java/com/lingua/audit/
    Api.java             REST endpoints, validation errors, CSV export
    Pipeline.java        durable queue polling, routing, cancellation
    ModelClient.java     Responses transport, strict schema, usage capture
    Checks.java          deterministic rules and reproducible audit sampling
    Store.java           JDBC persistence and dashboard aggregates
    Pricing.java         explicit model rates and decimal cost formula
    AccessFilter.java    live API bearer-token protection
    DemoFixtures.java    offline examples and deliberate defects
    Domain.java          validated request and result records
  src/main/resources/db/migration/  schema migrations
  src/test/                         backend tests
frontend/src/
  App.tsx                dashboard, result table, ledger and benchmarks
  NewRun.tsx             translation / benchmark creation and file import
  ReviewItem.tsx         evidence viewer and human assessments
  Architecture.tsx       interactive data-flow explanation
  api.ts                 typed HTTP client and accounting helpers
  App.test.tsx           frontend interaction and metric tests
  styles.css             responsive styling
scripts/                 build and run commands
```

Read [architecture and data flow](docs/ARCHITECTURE.md), [API contract](docs/API.md), and [verification and operational limits](docs/VERIFICATION.md).

## Official implementation references

The API adapter uses [`text.format` Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs). Configured standard token rates come from the official [GPT-4.1](https://developers.openai.com/api/docs/models/gpt-4.1) and [GPT-4.1 mini](https://developers.openai.com/api/docs/models/gpt-4.1-mini) model pages. The [token-counting guide](https://developers.openai.com/api/docs/guides/token-counting) explains that reported output usage includes non-visible generated tokens.
