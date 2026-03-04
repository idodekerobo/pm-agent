"""
RQ Worker entrypoint. Run this in a separate terminal/process:
  python -m backend.src.app.workers.runner
"""
import logging
import sys
from rq import Worker
from rq.logutils import setup_loghandlers
from app.workers.queue import get_redis_connection, get_queue

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
    """Custom exception handler that logs failures prominently."""
    logger.error("=" * 80)
    logger.error(f"❌ JOB FAILED: {job.func_name}")
    logger.error(f"   Job ID: {job.id}")
    logger.error(f"   Exception: {exc_type.__name__}: {exc_value}")
    logger.error("=" * 80)
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
