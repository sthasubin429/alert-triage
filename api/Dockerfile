# ---- Build stage ----
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

# Restore first for better layer caching
COPY AlertsApi/AlertsApi.csproj AlertsApi/
RUN dotnet restore AlertsApi/AlertsApi.csproj

COPY AlertsApi/ AlertsApi/
RUN dotnet publish AlertsApi/AlertsApi.csproj -c Release -o /app/publish /p:UseAppHost=false

# ---- Runtime stage ----
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS runtime
WORKDIR /app
COPY --from=build /app/publish .

ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080

ENTRYPOINT ["dotnet", "AlertsApi.dll"]
