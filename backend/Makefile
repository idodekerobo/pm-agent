run-api:
	uv run uvicorn app.main:app --reload --port 8000

run-worker:
	PYTHONPATH=src uv run python -m app.workers.runner

start-local:
	$(MAKE) run-api & $(MAKE) run-worker
