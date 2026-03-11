"""
RQ Worker entrypoint for the code_tasks queue.

Long-running coding agent tasks run here, isolated from the default/high
queues so they never block fast integration or context-gathering jobs.

Run this in a separate terminal/process:
  python -m app.workers.runner_code_tasks
"""
import logging
import sys
from rq import Worker
from rq.logutils import setup_loghandlers
from app.workers.queue import get_redis_connection, get_queue
from app.errors import log_error_sync

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    stream=sys.stdout,
    force=True,
)
logger = logging.getLogger(__name__)

rq_logger = logging.getLogger("rq.worker")
rq_logger.setLevel(logging.DEBUG)


def custom_exc_handler(job, exc_type, exc_value, tb):
    """Custom exception handler that logs failures prominently and persists to DB."""
    logger.error(
        f"❌ JOB FAILED: {job.func_name} | {exc_type.__name__}: {exc_value} | job_id={job.id}"
    )
    user_id = job.args[0] if job.args else None
    log_error_sync(user_id, "worker", exc_value, context={
        "job_id": job.id,
        "job_func": job.func_name,
    })
    return False


def main():
    redis_conn = get_redis_connection()
    code_tasks_queue = get_queue("code_tasks")

    logger.info("Starting RQ worker on queue: code_tasks")
    logger.info(f"Redis: {redis_conn.connection_pool.connection_kwargs.get('host', 'localhost')}")

    try:
        redis_conn.ping()
        logger.info("Redis connection verified")
    except Exception as e:
        logger.error(f"Failed to connect to Redis: {e}")
        raise

    worker = Worker(
        [code_tasks_queue],
        connection=redis_conn,
        exception_handlers=[custom_exc_handler],
        job_execution_timeout=60 * 100,  # 100 min — longer than default 180s
    )

    setup_loghandlers(logging.DEBUG)

    logger.info("Code task worker starting, waiting for jobs...")
    worker.work()


if __name__ == "__main__":
    main()
