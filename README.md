# Alert Triage Mini-View

A small Next.js + TypeScript page where a SOC analyst can triage ~200 mock security alerts: saved views as tabs (built-in and analyst-defined, persisted across sessions), sort, multi-select filters (severity/status/source/assignee — e.g. critical + medium at once), free-text search, a detail drawer, keyboard-driven status changes with auto-advance and undo, and manually resizable table columns. A standalone C# (ASP.NET minimal API) endpoint + SQL schema show how the status update would be backed in a real system.

## Quickstart

```bash
make setup                   # ground-up setup on a fresh machine (only Docker required)
make up                      # build + start the full stack: frontend http://localhost:3000 + API http://localhost:5080
make down                    # stop everything
make dev                     # dev mode for BOTH: API in Docker + frontend with hot reload
make test                    # ALL tests: TypeScript unit/property + C# xunit (in Docker)
make check                   # full gate: lint + format check + typecheck + all tests
make build                   # build both Docker containers (web + api)
make api-smoke               # build + run API in Docker, curl happy/sad paths
make help                    # everything else
```

Only Docker is required — `make setup` builds everything from scratch, `make up` runs both containers (the frontend is a standalone Next.js production build), and `make test` runs all tests (TypeScript tests fall back to the Docker build image when Node is absent). Local Node 20+ is only needed for `make dev` hot reload and the lint/format/typecheck targets.

## Key decisions & trade-offs

- Filtering, sorting and search (`web/src/lib/alert-query.ts`) and every state transition (`triage-reducer.ts`) are pure functions; the React components are a thin layer on top. I wanted the triage logic testable without rendering anything, and most of the suite does run against plain functions, including the property-based tests.
- State lives in a single `useReducer`. With one route and 200 in-memory rows, zustand or context would be ceremony, and a pure reducer is itself something fast-check can attack.
- The frontend never calls the API, which the brief allows. Wiring it up would mean putting the PATCH behind `NEXT_PUBLIC_API_URL`, updating optimistically on dispatch and rolling back on a failed response.
- Mock data is deterministic: `web/scripts/generate-alerts.mts` uses a seeded PRNG and a fixed reference date. The JSON is committed so reviewers never have to run it; `make data` regenerates byte-identical output.

## UX improvement: saved views as triage queues

Every analyst works the same alert feed differently, so the tab strip turns any combination of filters, search and sort into a named view that survives reloads. Three come built in: All alerts, Hot queue (critical + high, open, oldest first) and Assigned to me. The `+` tab saves whatever query is currently live as a new tab in `localStorage`, and `1`–`9` jumps between views.

The reasoning: analysts decide where to start before they triage a single alert. If each one can define their own queues ("my criticals", "my shift's backlog"), nobody rebuilds the same filters at the start of every shift.

Smaller things that support the same workflow:

- Keyboard triage: `j`/`k` move the selection, `Enter` opens the drawer, `a`/`r`/`f`/`o` set acknowledged/resolved/false-positive/open, `/` focuses search, `Esc` closes. When you're triaging hundreds of alerts a shift, one keystroke beats three clicks.
- Auto-advance: disposing an alert with a hotkey selects the next visible row, like archiving in Gmail. A whole queue can be cleared without ever touching the mouse.
- Undo: `u` reverts the last status change, and a toast confirms each one. Fast hotkeys make mis-keys inevitable, so undoing has to be free.
- SLA chips: open alerts past a severity-based SLA (critical 2h, high 8h, medium 24h, low 72h) get flagged, which keeps overdue critical work hard to miss.
- Resizable columns: drag the header edges to fit long titles or narrow screens; widths persist locally.

## How AI coding agents were used

Built with Claude Code. A planning agent laid out the structure and pinned a known-good dependency set, then parallel build agents implemented separate lanes (the C# API with its Dockerfile and SQL, the pure TS core, the React components, the fast-check suites) against a contract I wrote by hand: `types.ts` plus exact function signatures. The reducer semantics, test invariants and design direction were mine, specified up front, and I verified everything through `make check`, `make api-test` and `make api-smoke`. I also overrode the agents in a few places: Next stays pinned at 15.5 rather than the default 16.x for tooling compatibility, the suggested compose setup got cut down to just the API service, and I regrouped the generated commits.

## What I'd do differently for production

Persistence first: Postgres with the schema in `api/sql/schema.sql`, optimistic concurrency surfaced as 409s, and an audit trail with actor identity (which would also replace the hardcoded current analyst behind "Assigned to me"). Then authn/authz, a status-transition state machine, and actually wiring the frontend to the API with optimistic updates. On the product side: server-stored saved views shared across devices and teams, an SLA-aware sort key ("closest to breach first"), URL-synced filter state, a virtualized table for >10k alerts, and pagination on the list endpoint. Tooling: Playwright e2e and a CI pipeline (lint/test/build/image scan), OpenTelemetry, non-root container user. And at real alert volumes I'd rethink the top-level view entirely: rank entities (which host or user is in the most trouble right now) instead of listing raw alerts, with alerts grouped under the entities they affect.

PRODUCTION: in a real system this endpoint would change in several ways:
- Persistence: alerts live in Postgres (see api/sql/schema.sql), not a process-local dictionary.
- AuthN/AuthZ: require a bearer token (OIDC/JWT) and check the caller may modify this alert.
- Optimistic concurrency: client sends If-Match / row_version; a stale version returns 409 Conflict  (UPDATE ... WHERE id = $1 AND row_version = $3 affecting 0 rows).
- Audit trail: every transition is recorded in alert_status_history with the acting principal.
- Idempotency: accept an Idempotency-Key header so retried PATCHes are safe.
- State machine: validate allowed transitions (e.g. resolved -> open requires a reopen action), not just membership in the allowed set.
- Observability: OpenTelemetry traces/metrics and structured logs around the update.
- Rate limiting: per-principal limits to protect against abusive or runaway clients.

```c#
app.MapPatch("/api/alerts/{id}/status", async (string id, HttpRequest request) =>
{
    UpdateStatusRequest? body = null;
    try
    {
        body = await request.ReadFromJsonAsync<UpdateStatusRequest>();
    }
    catch (JsonException)
    {
        // fall through: body stays null and we return a 400 ValidationProblem below
    }
    catch (InvalidOperationException)
    {
        // missing/incorrect content type — treat the same as a missing body
    }

    var status = body?.Status;
    if (status is null || !allowedStatuses.Contains(status, StringComparer.OrdinalIgnoreCase))
    {
        return Results.ValidationProblem(new Dictionary<string, string[]>
        {
            ["status"] = [
                $"A JSON body like {{\"status\":\"acknowledged\"}} is required. " +
                $"Allowed values: {string.Join(", ", allowedStatuses)}."
            ]
        });
    }

    // Normalize to the canonical lowercase form used by the frontend vocabulary.
    var normalized = allowedStatuses.First(s => s.Equals(status, StringComparison.OrdinalIgnoreCase));

    // Atomic update: re-read and retry if another writer swapped the value in between.
    while (true)
    {
        if (!alerts.TryGetValue(id, out var existing))
        {
            return Results.Problem(
                statusCode: StatusCodes.Status404NotFound,
                title: $"Alert '{id}' not found.");
        }

        var updated = existing with { Status = normalized };
        if (alerts.TryUpdate(id, updated, existing))
        {
            return Results.Ok(updated);
        }
        // Lost the race — loop and try again against the latest value.
    }
});
```

