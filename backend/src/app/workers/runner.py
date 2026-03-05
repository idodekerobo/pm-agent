"""
RQ Worker entrypoint. Run this in a separate terminal/process:
  python -m backend.src.app.workers.runner
"""
import logging
import sys
from rq import Worker
from rq.logutils import setup_loghandlers
from app.workers.queue import get_redis_connection, get_queue
from app.errors import log_error_sync

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s',
    stream=sys.stdout,
    force=True
)
logger = logging.getLogger(__name__)

rq_logger = logging.getLogger('rq.worker')
rq_logger.setLevel(logging.DEBUG)

def custom_exc_handler(job, exc_type, exc_value, tb):
    """Custom exception handler that logs failures prominently and persists to DB."""
    logger.error(f"❌ JOB FAILED: {job.func_name} | {exc_type.__name__}: {exc_value} | job_id={job.id}")
    # All task functions receive user_id as their first positional argument.
    user_id = job.args[0] if job.args else None
    log_error_sync(user_id, "worker", exc_value, context={
        "job_id": job.id,
        "job_func": job.func_name,
    })
    return False

def main():
    redis_conn = get_redis_connection()
    high_queue = get_queue("high")
    default_queue = get_queue("default")

    logger.info(f"Starting RQ worker on queues: high, default")
    logger.info(f"Redis connection: {redis_conn.connection_pool.connection_kwargs.get('host', 'localhost')}")

    try:
        redis_conn.ping()
        logger.info("Redis connection verified")
    except Exception as e:
        logger.error(f"Failed to connect to Redis: {e}")
        raise

    worker = Worker(
        [high_queue, default_queue],
        connection=redis_conn,
        exception_handlers=[custom_exc_handler]
    )

    setup_loghandlers(logging.DEBUG)

    logger.info("Worker starting, waiting for jobs...")
    logger.info("Will log all job failures prominently")
    worker.work()

if __name__ == "__main__":
    main()
