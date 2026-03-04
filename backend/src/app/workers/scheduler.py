"""
rq-scheduler entrypoint.

Registers all cron schedules and starts the scheduler process. Run via:
    PYTHONPATH=src python -m app.workers.scheduler
or the Makefile target:
    make run-scheduler

On Render/Railway, add a separate service pointing to this entrypoint.
It only needs the REDIS_URL env var — no open ports required.

The scheduler persists schedules in Redis using stable job IDs, so restarting
this process will NOT create duplicate cron entries.
"""
from rq_scheduler import Scheduler

from app.workers.cron_tasks import enqueue_stale_session_summaries
from app.workers.queue import get_redis_connection


def main():
    conn = get_redis_connection()
    scheduler = Scheduler(connection=conn)

    # Register the stale-session summarization cron.
    # Runs at the top of every hour. The stable `id` prevents duplicates if the scheduler is restarted.
    scheduler.cron(
        "0 * * * *",
        func=enqueue_stale_session_summaries,
        id="summarize_stale_sessions",
        use_local_timezone=False,
    )

    print("[scheduler] registered cron: summarize_stale_sessions (every hour)", flush=True)
    scheduler.run()


if __name__ == "__main__":
    main()
