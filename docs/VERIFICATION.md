# Verification and operational limits

## Completed verification

- **23 Java tests passed** using Java 17: 7 rule/accounting tests, 9 provider/authentication tests, and 7 persistence/pipeline tests.
- **5 React tests passed** for unknown usage formatting, benchmark denominators, run submission, invalid JSON handling, and separate human assessments.
- TypeScript compilation and Vite production build passed.
- The executable Spring Boot JAR served the embedded React application on localhost.
- The persisted demo completed 18 candidates across six languages, with the three deliberately injected errors rejected.
- The dashboard input-token, output-token and cost totals matched the sum of the 12 corresponding ledger entries.
- A benchmark created through the browser completed all six cases and displayed the correct per-language denominators.
- Browser inspection covered the dashboard at mobile and desktop widths, call details, benchmark results and the architecture view.
- The packaged application restarted successfully and retained its completed runs. The flagged filter returned all three demo issues.

## Provider boundary tests

Tests use a local HTTP server to emulate the Responses API. They verify fresh requests, strict structured-output configuration, usage persistence before parsing, malformed output, missing usage, incomplete responses, HTTP 429, wrong identifiers, unexpected translation rewrites and fabricated evidence spans. Authentication tests verify that live mode requires an application token and rejects unauthorized API access.

**No paid live API request was made.** A real request still requires the operator's server-side provider key and account access to the pinned models. Stubbed transport tests do not establish real translation quality or confirm model availability for an account.

## Deployment boundary

H2 persistence was exercised locally. Docker/PostgreSQL configuration is included but was not run because no Docker daemon was available. No throughput/load claim is made for 300,000 candidates. No claim of enterprise production readiness is made: the implementation has one worker and a shared workspace token, with no distributed leases, OIDC identities, tenant authorization, automated billing reconciliation or representative multilingual gold set. See [Architecture](ARCHITECTURE.md) for the scaling path and failure behavior.

## Reproduce checks

```bash
# Java 17+ and Maven
cd backend
mvn test

# Node.js 24+ and pnpm 11.19.0, from the repository root
cd frontend
pnpm install --frozen-lockfile
pnpm test
pnpm build
```

The GitHub workflow runs the Java tests and React checks on pushes and pull requests. Neither those tests nor the build require an OpenAI key.
