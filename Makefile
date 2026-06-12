.DEFAULT_GOAL := help
.PHONY: help install dev build start test test-watch lint lint-fix format format-check typecheck data check \
        api-build api-run api-test api-smoke up down logs clean

## ---------- Frontend (web/) ----------

install: ## Install frontend dependencies
	cd web && npm install

dev: ## Run Next.js dev server (http://localhost:3000)
	cd web && npm run dev

build: ## Production build of the frontend
	cd web && npm run build

start: ## Serve the production build
	cd web && npm run start

test: ## Run TypeScript unit + property-based tests once
	cd web && npm run test

test-watch: ## Run tests in watch mode
	cd web && npm run test:watch

lint: ## Lint the frontend
	cd web && npm run lint

lint-fix: ## Lint and auto-fix
	cd web && npm run lint:fix

format: ## Format all frontend files with Prettier
	cd web && npm run format

format-check: ## Check formatting without writing
	cd web && npm run format:check

typecheck: ## TypeScript type check (no emit)
	cd web && npm run typecheck

data: ## Regenerate the seeded mock alerts JSON (deterministic)
	cd web && npm run data

check: lint format-check typecheck test ## Full local quality gate

## ---------- C# API (api/, Docker only — no local dotnet needed) ----------

api-build: ## Build the API Docker image
	docker build -t alerts-api ./api

api-run: api-build ## Run the API in the foreground on http://localhost:5080
	docker run --rm -p 5080:8080 --name alerts-api alerts-api

api-test: ## Run xunit integration tests inside the .NET SDK container
	docker run --rm --user $$(id -u):$$(id -g) -e DOTNET_CLI_HOME=/tmp -e XDG_DATA_HOME=/tmp -e NUGET_PACKAGES=/tmp/nuget -v "$(CURDIR)/api:/src" -w /src mcr.microsoft.com/dotnet/sdk:8.0 dotnet test AlertsApi.Tests/AlertsApi.Tests.csproj

api-smoke: api-build ## Build, start, curl health + status-update happy/sad paths, stop
	-docker rm -f alerts-api-smoke 2>/dev/null || true
	docker run --rm -d -p 5080:8080 --name alerts-api-smoke alerts-api
	curl -fsS --retry 10 --retry-connrefused --retry-all-errors --retry-delay 1 http://localhost:5080/healthz
	curl -fsS -X PATCH http://localhost:5080/api/alerts/AL-0001/status \
		-H 'Content-Type: application/json' -d '{"status":"acknowledged"}'
	test "$$(curl -s -o /dev/null -w '%{http_code}' -X PATCH http://localhost:5080/api/alerts/AL-0001/status \
		-H 'Content-Type: application/json' -d '{"status":"bogus"}')" = "400"
	test "$$(curl -s -o /dev/null -w '%{http_code}' -X PATCH http://localhost:5080/api/alerts/NOPE/status \
		-H 'Content-Type: application/json' -d '{"status":"resolved"}')" = "404"
	docker stop alerts-api-smoke
	@echo "\nsmoke: OK"

## ---------- Docker compose ----------

up: ## Build and start frontend (:3000) + API (:5080) via docker compose
	docker compose up -d --build

down: ## Stop and remove compose services
	docker compose down

logs: ## Tail compose logs
	docker compose logs -f

## ---------- Misc ----------

clean: ## Remove build artifacts and node_modules
	rm -rf web/.next web/node_modules api/AlertsApi/bin api/AlertsApi/obj api/AlertsApi.Tests/bin api/AlertsApi.Tests/obj

help: ## Show this help
	@grep -hE '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-14s\033[0m %s\n", $$1, $$2}'
