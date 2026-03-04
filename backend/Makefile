run-api:
	uv run --env-file .env.local uvicorn app.main:app --reload --port 8000

run-worker:
	OBJC_DISABLE_INITIALIZE_FORK_SAFETY=YES PYTHONPATH=src uv run --env-file .env.local python -m app.workers.runner

run-scheduler:
	PYTHONPATH=src uv run --env-file .env.local python -m app.workers.scheduler

start-local:
	$(MAKE) run-api & $(MAKE) run-worker & $(MAKE) run-scheduler
