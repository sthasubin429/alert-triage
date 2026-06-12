.DEFAULT_GOAL := help
.PHONY: help setup dev build web-build start test test-web test-web-local test-watch lint lint-fix format format-check typecheck data check \
        api-build api-run api-test api-smoke up down logs clean

## ---------- Setup ----------

setup: ## Ground-up setup on a fresh machine — only Docker required
	docker compose build
	docker pull mcr.microsoft.com/dotnet/sdk:8.0
	@if command -v node >/dev/null 2>&1; then \
		$(MAKE) web/node_modules; \
	else \
		echo "node not found — skipped local npm ci (make up / make api-test still work; install Node 20+ for make dev/test-web/check)"; \
	fi
	@echo "setup complete — next: 'make up' (run the stack) or 'make test' (run all tests)"

## ---------- Frontend (web/) ----------

# Reproducible, lockfile-exact install; runs automatically when node_modules
# is missing or the lockfile changed.
web/node_modules: web/package.json web/package-lock.json
	cd web && npm ci
	@touch web/node_modules

dev: web/node_modules ## Run BOTH: API in Docker (:5080) + Next.js dev server with hot reload (:3000)
	docker compose up -d --build api
	@echo "api running on http://localhost:5080 — 'make down' stops it"
	cd web && npm run dev

build: ## Build both Docker containers (web + api)
	docker compose build

web-build: web/node_modules ## Production build of the frontend only
	cd web && npm run build

start: web/node_modules ## Serve the production build
	cd web && npm run start

test: test-web api-test ## Run ALL tests: TypeScript + C# xunit (in Docker)

test-web: ## TypeScript unit + property-based tests (falls back to Docker without Node)
	@if command -v node >/dev/null 2>&1; then \
		$(MAKE) test-web-local; \
	else \
		echo "node not found — running TypeScript tests inside the web build image"; \
		docker build --target build -t alerts-web-build ./web; \
		docker run --rm alerts-web-build npm run test; \
	fi

test-web-local: web/node_modules
	cd web && npm run test

test-watch: web/node_modules ## Run tests in watch mode
	cd web && npm run test:watch

lint: web/node_modules ## Lint the frontend
	cd web && npm run lint

lint-fix: web/node_modules ## Lint and auto-fix
	cd web && npm run lint:fix

format: web/node_modules ## Format all frontend files with Prettier
	cd web && npm run format

format-check: web/node_modules ## Check formatting without writing
	cd web && npm run format:check

typecheck: web/node_modules ## TypeScript type check (no emit)
	cd web && npm run typecheck

data: web/node_modules ## Regenerate the seeded mock alerts JSON (deterministic)
	cd web && npm run data

check: lint format-check typecheck test ## Full quality gate: lint + format + types + all tests

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
