"""
RQ Worker entrypoint. Run this in a separate terminal/process:
  python -m backend.src.app.workers.runner
"""
import logging
from rq import Worker
from app.workers.queue import get_redis_connection, get_queue

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s'
)
logger = logging.getLogger(__name__)

def main():
    redis_conn = get_redis_connection()
    queue = get_queue("default")
    
    logger.info(f"Starting RQ worker on queue: {queue.name}")
    logger.info(f"Redis URL: {redis_conn.connection_pool.connection_kwargs.get('host', 'localhost')}")
    
    worker = Worker([queue], connection=redis_conn)
    worker.work()

if __name__ == "__main__":
    main()
