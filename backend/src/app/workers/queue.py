import logging
import redis
from redis import ConnectionPool
from rq import Queue
from app.config import settings

logger = logging.getLogger(__name__)

_redis_connection = None
_queue_instance = None

def get_redis_connection():
    """Get or create Redis connection with connection pooling."""
    global _redis_connection
    if _redis_connection is None:
        logger.info(f"Creating new Redis connection to {settings.redis_url}")
        pool = ConnectionPool.from_url(
            settings.redis_url,
            max_connections=10,
            socket_keepalive=True,
            socket_connect_timeout=5,
            retry_on_timeout=True
        )
        _redis_connection = redis.Redis(connection_pool=pool)
        try:
            _redis_connection.ping()
            logger.info("Redis connection established and verified")
        except Exception as e:
            logger.error(f"Failed to ping Redis: {e}")
            raise
    return _redis_connection

def get_queue(name: str = "default"):
    """Get or create an RQ queue with lazy initialization."""
    global _queue_instance
    if _queue_instance is None:
        logger.info(f"Creating new RQ queue: {name}")
        redis_conn = get_redis_connection()
        _queue_instance = Queue(name, connection=redis_conn)
    return _queue_instance

def reset_connection():
    """Reset Redis connection and queue. Useful for testing or reconnection."""
    global _redis_connection, _queue_instance
    logger.info("Resetting Redis connection and queue")
    _redis_connection = None
    _queue_instance = None

class _QueueProxy:
    """Proxy that lazily creates the queue on first access."""
    def __getattr__(self, name):
        logger.debug(f"QueueProxy: accessing attribute '{name}'")
        return getattr(get_queue(), name)

queue = _QueueProxy()
