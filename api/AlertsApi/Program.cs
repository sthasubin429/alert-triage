using System.Collections.Concurrent;
using System.Text.Json;

var builder = WebApplication.CreateBuilder(args);
var app = builder.Build();

// Allowed vocabularies — kept in sync with the frontend (web/src/lib/types.ts).
string[] allowedStatuses = ["open", "acknowledged", "resolved", "false_positive"];

// In-memory store seeded with 10 realistic security alerts.
var alerts = new ConcurrentDictionary<string, Alert>(StringComparer.Ordinal);
foreach (var alert in SeedAlerts())
{
    alerts[alert.Id] = alert;
}

app.MapGet("/healthz", () => Results.Ok(new { status = "ok" }));

app.MapGet("/api/alerts", () =>
    Results.Ok(alerts.Values.OrderBy(a => a.Id, StringComparer.Ordinal)));

// PRODUCTION: in a real system this endpoint would change in several ways:
//  - Persistence: alerts live in Postgres (see api/sql/schema.sql), not a process-local dictionary.
//  - AuthN/AuthZ: require a bearer token (OIDC/JWT) and check the caller may modify this alert.
//  - Optimistic concurrency: client sends If-Match / row_version; a stale version returns 409 Conflict
//    (UPDATE ... WHERE id = $1 AND row_version = $3 affecting 0 rows).
//  - Audit trail: every transition is recorded in alert_status_history with the acting principal.
//  - Idempotency: accept an Idempotency-Key header so retried PATCHes are safe.
//  - State machine: validate allowed transitions (e.g. resolved -> open requires a reopen action),
//    not just membership in the allowed set.
//  - Observability: OpenTelemetry traces/metrics and structured logs around the update.
//  - Rate limiting: per-principal limits to protect against abusive or runaway clients.
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
            return Results.NotFound();
        }

        var updated = existing with { Status = normalized };
        if (alerts.TryUpdate(id, updated, existing))
        {
            return Results.Ok(updated);
        }
        // Lost the race — loop and try again against the latest value.
    }
});

app.Run();

static IEnumerable<Alert> SeedAlerts() =>
[
    new("AL-0001", "Credential dumping via LSASS memory access on WS-1042", "critical", "open", "CrowdStrike EDR", DateTimeOffset.Parse("2026-06-10T08:14:00Z"), null),
    new("AL-0002", "Impossible travel sign-in: Berlin and Singapore within 30 minutes", "high", "open", "Okta", DateTimeOffset.Parse("2026-06-10T09:02:00Z"), "maria.chen"),
    new("AL-0003", "EC2 instance communicating with known cryptomining pool", "high", "acknowledged", "AWS GuardDuty", DateTimeOffset.Parse("2026-06-10T11:47:00Z"), "deshawn.wright"),
    new("AL-0004", "Outbound C2 beaconing pattern detected on VLAN 30", "critical", "acknowledged", "Suricata IDS", DateTimeOffset.Parse("2026-06-10T13:21:00Z"), "maria.chen"),
    new("AL-0005", "Phishing campaign: spoofed invoice with macro-enabled attachment", "medium", "open", "Email Gateway", DateTimeOffset.Parse("2026-06-11T07:35:00Z"), null),
    new("AL-0006", "MFA fatigue: 14 push notifications denied by user j.alvarez", "medium", "resolved", "Okta", DateTimeOffset.Parse("2026-06-11T10:12:00Z"), "priya.nair"),
    new("AL-0007", "S3 bucket policy changed to allow public read access", "high", "resolved", "AWS GuardDuty", DateTimeOffset.Parse("2026-06-11T12:58:00Z"), "deshawn.wright"),
    new("AL-0008", "Suspicious PowerShell with encoded command on SRV-EXCH01", "critical", "open", "CrowdStrike EDR", DateTimeOffset.Parse("2026-06-11T16:40:00Z"), null),
    new("AL-0009", "Port scan from internal host 10.20.4.117 across DMZ range", "low", "false_positive", "Suricata IDS", DateTimeOffset.Parse("2026-06-12T06:05:00Z"), "priya.nair"),
    new("AL-0010", "Newly registered look-alike domain mailing employees", "low", "open", "Email Gateway", DateTimeOffset.Parse("2026-06-12T07:48:00Z"), null),
];

record Alert(string Id, string Title, string Severity, string Status, string Source, DateTimeOffset CreatedAt, string? Assignee);

record UpdateStatusRequest(string? Status);

// Required so WebApplicationFactory<Program> can locate the entry point in tests.
public partial class Program { }
