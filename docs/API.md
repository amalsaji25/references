# REST API

Base path: `/api`. JSON requests use `Content-Type: application/json`. In live mode send `Authorization: Bearer <APP_ACCESS_TOKEN>`. No provider key belongs in browser requests. The frontend uses this exact API.

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/config` | Provider mode, models, price table, languages and example inputs |
| GET | `/runs` | Newest 100 runs |
| POST | `/runs` | Queue a translation run; returns HTTP 202 and `{ "id": "..." }` |
| POST | `/benchmarks` | Queue labeled candidate evaluation |
| GET | `/runs/{id}` | Run configuration, progress and quality/usage aggregates |
| POST | `/runs/{id}/cancel` | Request cancellation after the current call |
| GET | `/runs/{id}/items` | Paginated source/candidate results with findings and human reviews |
| GET | `/runs/{id}/calls` | Paginated per-call usage and price snapshots |
| GET | `/runs/{id}/export` | Streaming CSV of results, findings and latest human assessment |
| POST | `/items/{id}/reviews` | Append a human assessment without altering automatic decisions |
| GET | `/actuator/health` | Process/database health, outside the `/api` authentication filter |

## Create a translation run

```bash
curl http://localhost:8080/api/runs \
  -H 'Content-Type: application/json' \
  --data-binary @docs/sample-run.json
```

```json
{
  "name": "Customer portal",
  "sentences": ["Welcome back, {name}."],
  "languages": ["fr", "de"],
  "mode": "SELECTIVE",
  "auditPercent": 20,
  "budgetUsd": 5,
  "glossary": [{"source": "customer", "language": "fr", "target": "client"}],
  "context": "Customer portal messages, professional tone."
}
```

All keys are required; glossary and context can be empty. Source limit: 10,000 sentences, 2,000 characters each. Target limit: 30 unique supported locale codes. Glossary limit: 100 entries. Budget: $0.01–$1,000. Selective audit probability must be 1–100%; full mode ignores the rate for routing but retains the random-audit marker. Requests with known content length greater than 20 MB are rejected. Deploy a reverse-proxy body limit if accepting chunked requests from untrusted networks.

The live adapter uses pinned models and a hard 8,192 output-token cap per call. Application reservations may require substantially more budget than the actual short result consumes. A $0.01 budget intentionally demonstrates a budget stop for the default generator.

## Item pagination

`GET /runs/{id}/items?page=0&size=20&decision=REJECT&search=invoice`

- Pages are zero-based; maximum page size is 200.
- `decision` is optional: ACCEPT, SELF_CHECKED, REVIEW, REJECT, PENDING or FLAGGED (REVIEW + REJECT).
- `search` performs a literal, case-insensitive substring search of source and translation; SQL wildcards are escaped.
- Response: `{ "items": [...], "total": 123, "page": 0, "size": 20 }`.
- Item fields include `sourceIndex` (zero-based), `sourceText`, `language`, `translation`, `decision`, `selfDecision`, `findings`, `auditSample`, `independentCheck`, `expectedLabel` and newest-first `reviews`.

## Benchmark

```json
{
  "name": "French modality challenge",
  "budgetUsd": 5,
  "pairs": [
    {
      "source": "The customer must submit the documents before Friday.",
      "language": "fr",
      "translation": "Le client peut soumettre les documents avant vendredi.",
      "expected": "BAD"
    }
  ]
}
```

POST to `/benchmarks`. Up to 1,000 pairs; `expected` is GOOD or BAD. Ground-truth labels must be independently established. UI JSON import accepts the pairs array; the form supplies the name and budget.

## Human assessment

```json
{"reviewer":"Bilingual reviewer","verdict":"INCORRECT","note":"Obligation was weakened to permission."}
```

POST to `/items/{id}/reviews`. Verdict: CORRECT, INCORRECT or UNCERTAIN. Reviewer and note limits are 100 and 2,000 characters. Pending items cannot receive reviews. Reviewer names are self-reported under the workspace token; verified reviewer identity is not provided.

## Usage ledger

`GET /runs/{id}/calls?page=0&size=50`

Each call includes `stage`, `model`, `provider`, `status`, `inputTokens`, `cachedTokens`, `outputTokens`, `reasoningTokens`, `costUsd`, `reservedUsd`, `inputRate`, `cachedRate`, `outputRate`, `priceVersion`, `durationMs`, `responseId`, `requestId`, and a sanitized `error`.

Null token counts or cost mean unknown, not zero. Dashboard known totals are lower bounds when unresolved calls exist. `unresolvedReserveUsd` is reported separately. All monetary units are USD.

## Errors

Invalid data: 400. Missing run: 404. Missing/wrong live access token: 401. Known oversized request body: 413. Worker/provider failures are reflected in the persisted run and call ledger rather than making a previously accepted create request fail retrospectively.
