using System.Net;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc.Testing;
using Xunit;

namespace AlertsApi.Tests;

public class EndpointTests : IClassFixture<WebApplicationFactory<Program>>
{
    private static readonly JsonSerializerOptions JsonOptions =
        new(JsonSerializerDefaults.Web);

    private readonly HttpClient _client;

    public EndpointTests(WebApplicationFactory<Program> factory)
    {
        _client = factory.CreateClient();
    }

    private sealed record AlertDto(
        string Id,
        string Title,
        string Severity,
        string Status,
        string Source,
        DateTimeOffset CreatedAt,
        string? Assignee);

    [Fact]
    public async Task Healthz_Returns200()
    {
        var response = await _client.GetAsync("/healthz");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
    }

    [Fact]
    public async Task GetAlerts_ReturnsExactlyTenOrderedById()
    {
        var response = await _client.GetAsync("/api/alerts");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var alerts = await response.Content.ReadFromJsonAsync<List<AlertDto>>(JsonOptions);
        Assert.NotNull(alerts);
        Assert.Equal(10, alerts!.Count);
        Assert.Equal("AL-0001", alerts[0].Id);
    }

    [Fact]
    public async Task PatchStatus_HappyPath_UpdatesAlert()
    {
        // Use AL-0002 so this mutation does not interfere with other tests.
        var response = await _client.PatchAsJsonAsync(
            "/api/alerts/AL-0002/status",
            new { status = "resolved" });

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        var updated = await response.Content.ReadFromJsonAsync<AlertDto>(JsonOptions);
        Assert.NotNull(updated);
        Assert.Equal("AL-0002", updated!.Id);
        Assert.Equal("resolved", updated.Status);

        // The change must be visible in a follow-up GET.
        var alerts = await _client.GetFromJsonAsync<List<AlertDto>>("/api/alerts", JsonOptions);
        Assert.NotNull(alerts);
        var alert = Assert.Single(alerts!, a => a.Id == "AL-0002");
        Assert.Equal("resolved", alert.Status);
    }

    [Fact]
    public async Task PatchStatus_InvalidStatusValue_Returns400()
    {
        var response = await _client.PatchAsJsonAsync(
            "/api/alerts/AL-0003/status",
            new { status = "escalated_to_mars" });

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }

    [Fact]
    public async Task PatchStatus_UnknownId_Returns404()
    {
        var response = await _client.PatchAsJsonAsync(
            "/api/alerts/AL-9999/status",
            new { status = "acknowledged" });

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        Assert.Equal("application/problem+json", response.Content.Headers.ContentType?.MediaType);
    }

    [Fact]
    public async Task PatchStatus_MissingBody_Returns400()
    {
        using var emptyBody = new StringContent(string.Empty, Encoding.UTF8, "application/json");
        var response = await _client.PatchAsync("/api/alerts/AL-0004/status", emptyBody);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
    }
}
