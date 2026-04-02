# ── Individual services ──────────────────────────────────────────────────────

run-api:
	cd backend && uv run --env-file .env.local uvicorn app.main:app --reload --port 8000

run-worker:
	cd backend && OBJC_DISABLE_INITIALIZE_FORK_SAFETY=YES PYTHONPATH=src uv run --env-file .env.local python -m app.workers.runner

run-worker-code-tasks:
	cd backend && OBJC_DISABLE_INITIALIZE_FORK_SAFETY=YES PYTHONPATH=src uv run --env-file .env.local python -m app.workers.runner_code_tasks

run-scheduler:
	cd backend && PYTHONPATH=src uv run --env-file .env.local python -m app.workers.scheduler

run-web:
	cd web-app && npm run dev -- --port 3000

run-landing:
	cd landing-page-app && npm run dev -- --port 3001

# Runs at localhost:9181
install-bridge:
	cd bridge && uv sync && uv run --env-file .env.local draft-bridge install

uninstall-bridge:
	cd bridge && uv run --env-file .env.local draft-bridge uninstall

purge-bridge:
	cd bridge && uv run --env-file .env.local draft-bridge uninstall --purge

run-bridge:
	cd bridge && uv run --env-file .env.local draft-bridge start --workspace ..

run-bridge-auth:
	cd bridge && uv run --env-file .env.local draft-bridge auth

# Runs at localhost:9181
run-rq-dashboard:
	cd backend && uv run --env-file .env.local sh -c 'rq-dashboard --redis-url "$$REDIS_URL" --port 9181'

# ── Start everything ─────────────────────────────────────────────────────────

dev:
	trap 'kill 0' SIGINT SIGTERM EXIT; \
	$(MAKE) run-api & \
	$(MAKE) run-worker & \
	$(MAKE) run-worker-code-tasks & \
	$(MAKE) run-scheduler & \
	$(MAKE) run-web & \
	$(MAKE) run-landing; \
	wait

# ── Process management ────────────────────────────────────────────────────────

stop:
	-pkill -f "uvicorn app.main:app" 2>/dev/null || true
	-pkill -f "workers\.runner$$" 2>/dev/null || true
	-pkill -f "workers\.runner_code_tasks" 2>/dev/null || true
	-pkill -f "workers\.scheduler" 2>/dev/null || true
	-lsof -ti:8000 | xargs kill -9 2>/dev/null || true
	-lsof -ti:3000 | xargs kill -9 2>/dev/null || true
	-lsof -ti:3001 | xargs kill -9 2>/dev/null || true
	-lsof -ti:7349 | xargs kill -9 2>/dev/null || true
	@echo "All services stopped."

restart: stop
	@sleep 1
	$(MAKE) dev
