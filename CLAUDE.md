# CLAUDE.md

## Important Constraints

- **NEVER start the server.** Do not run `make dev`, `make start`, `make api-run`, `make up`, or any long-running process unless explicitly instructed. Assume the server is already running.
- **No local .NET SDK exists on this machine.** All C# build/test/run goes through Docker — always use the `make api-*` targets, never raw `dotnet` commands.
- The root `Makefile` is the primary interface for everything; prefer `make` targets over raw npm/docker commands.
- `web/src/data/alerts.json` is generated output — never hand-edit it; change `web/scripts/generate-alerts.mts` and run `make data` (output is deterministic, seed 42, fixed reference date).
- Commit messages: Conventional Commits, no AI attribution / Co-Authored-By lines.

## Common Commands

All commands run from the repo root.

### Tests
```bash
make test          # ALL tests: TypeScript (vitest) + C# xunit (dockerized SDK)
make test-web      # TypeScript tests only (auto-falls back to the Docker build image if Node is absent)
make api-test      # xunit integration tests only
make test-watch    # vitest watch mode
cd web && npx vitest run src/lib/__tests__/staleness.test.ts   # single file
```

### Linting & Formatting
```bash
make lint          # eslint (flat config)
make lint-fix      # eslint --fix
make format        # prettier --write .
make format-check  # prettier --check .
make typecheck     # tsc --noEmit
make check         # full gate: lint + format-check + typecheck + ALL tests (incl. C# in Docker)
```

### Build & Data
```bash
make build         # build both Docker containers (web + api)
make web-build     # next build only (local production bundle)
make data          # regenerate web/src/data/alerts.json (deterministic)
make clean         # remove .next, node_modules, api bin/obj
# no install target: every frontend target depends on web/node_modules and
# auto-runs `npm ci` (lockfile-exact) when missing or stale

```

### Docker
```bash
make setup         # ground-up setup, only Docker required (compose build + SDK pull + npm ci if Node exists)
make up            # docker compose: builds + starts web (:3000) and api (:5080)
make down          # stop and remove compose services
make logs          # tail compose logs
make api-build     # docker build the API image only
make api-smoke     # build + run + curl health/200/400/404 paths + stop (re-runnable)
```

## Architecture

Take-home exercise: "Alert Triage Mini-View" — a SOC-analyst triage UI over ~200 mock security alerts, plus a standalone C# endpoint showing the real-system backing for status updates.

- `web/` — Next.js 15.5 (App Router, `src/` dir, `@/*` → `src/*`), React 19, TypeScript 5, Tailwind CSS v4 (CSS-first config in `globals.css` via `@theme`; custom tokens: canvas/panel/edge/fore/faint/dim/accent). `next.config.ts` sets `output: 'standalone'` for the Docker image (`web/Dockerfile`, node:22-alpine multi-stage, runs as `node` user on :3000) — don't remove it.
- `api/` — .NET 8 LTS minimal API, hand-written `.csproj` (no scaffolding), built/tested/run exclusively via Docker (multi-stage `sdk:8.0` → `aspnet:8.0`, non-root `USER app`).
- No database, no shared state between frontend and API — frontend is fully in-memory by design; `api/sql/schema.sql` is a design artifact (Postgres schema + optimistic-concurrency walkthrough), not executed anywhere.

### Frontend layering (strict)
- `web/src/lib/` — **pure functions only** (no React, no Date.now, no mutation): `types.ts` (Alert contract + const vocab arrays), `alert-query.ts` (filter/search/sort + `applyQuery` pipeline), `triage-reducer.ts` (all state transitions), `staleness.ts` (SLA thresholds + age formatting). This purity is load-bearing: the fast-check property suites in `web/src/lib/__tests__/` test these directly.
- `web/src/components/` — thin client components over the lib: `TriageView.tsx` (owns `useReducer` + the single window keydown handler for keyboard triage), `AlertTable`, `FilterBar`, `DetailDrawer`, `SeverityBadge`/`StatusBadge`.
- `web/src/app/page.tsx` — thin server component; imports `alerts.json`, renders `<TriageView>`. Keep logic out of server components (they can't be unit-tested in vitest).

### Keyboard triage invariants (TriageView keydown handler)
- Bail when `metaKey || ctrlKey || altKey` (browser shortcuts must never trigger hotkeys).
- All hotkeys except Escape no-op while an input/textarea/select/button has focus.
- Status hotkeys (`a`/`r`/`f`/`o`) only act when the selected alert is visible or the drawer is open.
- Escape is staged: first press blurs an editable, second press closes the drawer.
- `now` is `null` until mount (hydration safety), then refreshed by a 30s interval.

### C# API (`api/AlertsApi/Program.cs`, single file)
- `ConcurrentDictionary` store seeded AL-0001..AL-0010; atomic updates via `TryUpdate` retry loop on immutable records.
- All error responses are RFC 7807 ProblemDetails (400 ValidationProblem, 404 Problem).
- Ends with `public partial class Program {}` for `WebApplicationFactory<Program>` tests in `api/AlertsApi.Tests/`.

## Testing

- **Frontend**: vitest 3 + jsdom + @testing-library/react 16 + fast-check 4. Config in `web/vitest.config.ts` (manual `@` alias — vitest ignores tsconfig paths; `globals: false`, so import `describe/it/expect` from `vitest` and call `afterEach(cleanup)` explicitly in any new RTL test file).
- Property suites live in `web/src/lib/__tests__/` with shared arbitraries in `arbitraries.ts` (use `uniqueAlertsArb` for reducer states). New search/filter/sort properties should assert both soundness (hits match) and completeness (excluded items don't match) — the suite was explicitly hardened against under-matching mutants; don't weaken it.
- RTL interaction tests: `web/src/components/__tests__/TriageView.test.tsx`. `scrollIntoView` doesn't exist in jsdom — keep the guarded call pattern (`el?.scrollIntoView?.()`).
- **API**: 6 xunit integration tests via `WebApplicationFactory`; tests share one factory, so mutation tests must each use a distinct alert id (AL-0002+ are taken).
- Run a single TS test file: `cd web && npx vitest run <path>`.

## Code Style

- Prettier: `singleQuote: true`, otherwise defaults (`web/.prettierrc`); `web/.prettierignore` excludes `.next/`, `alerts.json`, lockfile.
- ESLint 9 flat config (`web/eslint.config.mjs`): `next/core-web-vitals` + `next/typescript` via FlatCompat, with `eslint-config-prettier` appended last. Do not add `eslint-plugin-prettier`; do not upgrade `eslint` past v9 (eslint-config-next peer range).
- Next.js is intentionally pinned to 15.5.x (not 16) for tooling compatibility — don't bump majors casually.
- TypeScript strict; vocabulary unions (`Severity`/`Status`/`Source`) derive from `as const` arrays in `types.ts` — extend those arrays, never widen to `string`.

## Plan

- At the end of each plan, give me a list of unresolved questions to answer, if any. Make the questions extremely concise. Sacrifice grammar for the sake of concision.
