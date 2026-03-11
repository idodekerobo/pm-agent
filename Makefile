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

# ── Start everything ─────────────────────────────────────────────────────────

dev:
	$(MAKE) run-api & \
	$(MAKE) run-worker & \
	$(MAKE) run-worker-code-tasks & \
	$(MAKE) run-scheduler & \
	$(MAKE) run-web & \
	$(MAKE) run-landing
