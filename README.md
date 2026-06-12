# Alert Triage Mini-View

A small Next.js + TypeScript page where a SOC analyst can triage ~200 mock security alerts: sort, filter (severity/status/source), free-text search, a detail drawer, and in-memory status changes. A standalone C# (ASP.NET minimal API) endpoint + SQL schema show how the status update would be backed in a real system.

## Quickstart

```bash
make up                      # docker compose: frontend http://localhost:3000 + API http://localhost:5080
make down                    # stop everything
make check                   # lint + format check + typecheck + unit & property tests
make api-test                # xunit integration tests (runs inside a .NET SDK container)
make api-smoke               # build + run API in Docker, curl happy/sad paths
make install && make dev     # local dev server with hot reload (optional)
make help                    # everything else
```

Only Docker is required to run the app — `make up` builds and starts both containers (frontend is a standalone Next.js production build; no local .NET or Node needed).

## Key decisions & trade-offs

- **Pure core, thin components.** Filtering/sorting/search (`web/src/lib/alert-query.ts`) and state transitions (`triage-reducer.ts`) are pure functions; the UI is a thin layer over them. This made property-based testing natural and keeps the triage logic portable.
- **`useReducer` over a store library.** One route, 200 in-memory rows — a pure reducer is simpler than zustand/context and is itself a property-test target.
- **Frontend stays in-memory; the API stands alone** (the brief allows it). Production path: put the PATCH call behind `NEXT_PUBLIC_API_URL` — optimistic update on dispatch, rollback on a failed response.
- **Deterministic mock data.** `web/scripts/generate-alerts.mts` uses a seeded PRNG and fixed reference date; the JSON is committed, so reviewers never need to run it (`make data` regenerates byte-identical output).
- **.NET 8 LTS in Docker.** No local SDK on the dev machine; 8.0 is the long-term-support, zero-surprise image. The `.csproj` files are hand-written (no `dotnet new` available locally).

## UX improvement: keyboard-driven triage

`j`/`k` move the selection, `Enter` opens the drawer, `a`/`r`/`f`/`o` set acknowledged/resolved/false-positive/open, `/` focuses search, `Esc` closes. **Rationale: analysts burn down hundreds of alerts per shift; keeping hands on the keyboard turns a three-click triage into one keystroke.** Bonus: open alerts that breach a severity-based SLA (critical 2h, high 8h, medium 24h, low 72h) are flagged with an `SLA` chip so the oldest critical work is visible at a glance.

## How AI coding agents were used

Built with Claude Code using multi-agent orchestration: one planning agent designed the structure and pinned a known-good dependency set; parallel build agents then implemented independent lanes (C# API + Dockerfile + SQL, the pure TS core, React components, fast-check suites) against a hand-written shared contract (`types.ts` and exact function signatures). I specified the contract, reducer semantics, test invariants, and design direction up front, and reviewed/verified everything through `make check`, `make api-test`, and `make api-smoke`. Overrides: pinned Next 15.5 instead of the agent-default latest 16.x for tooling compatibility, simplified the suggested compose setup to the API service only, and tightened the generated commit grouping.

## What I'd do differently for production

Real persistence (Postgres + the schema in `api/sql/schema.sql`) with optimistic concurrency surfaced as 409s; authn/authz and an audit trail with actor identity; status-transition state machine; wire the frontend to the API with optimistic updates; URL-synced filter state; virtualized table for >10k alerts; pagination on the list endpoint; Playwright e2e + CI (lint/test/build/image scan); OpenTelemetry; non-root container user.
