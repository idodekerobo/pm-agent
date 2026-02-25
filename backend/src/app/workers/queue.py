import redis
from rq import Queue
from app.config import settings

def get_redis_connection():
    """Get or create Redis connection."""
    return redis.from_url(settings.redis_url)

def get_queue(name: str = "default"):
    """Get or create an RQ queue."""
    redis_conn = get_redis_connection()
    return Queue(name, connection=redis_conn)

queue = get_queue("default")
