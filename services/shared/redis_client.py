"""
Redis Client - Shared caching layer for all microservices
Supports both Upstash (serverless) and Redis (standard)
"""

import os
import json
import logging
from functools import wraps
from typing import Optional, Any, Callable
import hashlib

logger = logging.getLogger(__name__)

# Try to import redis, fallback to in-memory cache if not available
try:
    import redis
    REDIS_AVAILABLE = True
except ImportError:
    REDIS_AVAILABLE = False
    logger.warning("Redis package not installed, using in-memory cache")


class InMemoryCache:
    """Simple in-memory cache fallback when Redis is not available"""
    
    def __init__(self):
        self._cache = {}
        self._ttls = {}
    
    def get(self, key: str) -> Optional[str]:
        import time
        if key in self._cache:
            if key in self._ttls and time.time() > self._ttls[key]:
                del self._cache[key]
                del self._ttls[key]
                return None
            return self._cache[key]
        return None
    
    def set(self, key: str, value: str, ex: int = None):
        import time
        self._cache[key] = value
        if ex:
            self._ttls[key] = time.time() + ex
    
    def delete(self, key: str):
        self._cache.pop(key, None)
        self._ttls.pop(key, None)
    
    def exists(self, key: str) -> bool:
        return key in self._cache
    
    def flushdb(self):
        self._cache.clear()
        self._ttls.clear()


class RedisClient:
    """
    Redis client wrapper with connection pooling and error handling
    """
    
    def __init__(self):
        self._client = None
        self._initialize()
    
    def _initialize(self):
        """Initialize Redis connection"""
        redis_url = os.getenv("REDIS_URL") or os.getenv("UPSTASH_REDIS_URL")
        
        if not redis_url:
            logger.warning("No REDIS_URL configured, using in-memory cache")
            self._client = InMemoryCache()
            return
        
        if not REDIS_AVAILABLE:
            logger.warning("Redis package not available, using in-memory cache")
            self._client = InMemoryCache()
            return
        
        try:
            # Support both standard Redis and Upstash
            if "upstash" in redis_url.lower():
                # Upstash Redis
                self._client = redis.from_url(
                    redis_url,
                    decode_responses=True,
                    socket_timeout=5,
                    socket_connect_timeout=5,
                )
            else:
                # Standard Redis
                self._client = redis.from_url(
                    redis_url,
                    decode_responses=True,
                    socket_timeout=5,
                    socket_connect_timeout=5,
                    max_connections=10,
                )
            
            # Test connection
            self._client.ping()
            logger.info("Redis connection established")
            
        except Exception as e:
            logger.warning(f"Redis connection failed: {e}, using in-memory cache")
            self._client = InMemoryCache()
    
    @property
    def client(self):
        return self._client
    
    def get(self, key: str) -> Optional[str]:
        """Get value from cache"""
        try:
            return self._client.get(key)
        except Exception as e:
            logger.error(f"Redis GET error: {e}")
            return None
    
    def set(self, key: str, value: str, ttl: int = 300) -> bool:
        """Set value in cache with TTL (default 5 minutes)"""
        try:
            self._client.set(key, value, ex=ttl)
            return True
        except Exception as e:
            logger.error(f"Redis SET error: {e}")
            return False
    
    def delete(self, key: str) -> bool:
        """Delete key from cache"""
        try:
            self._client.delete(key)
            return True
        except Exception as e:
            logger.error(f"Redis DELETE error: {e}")
            return False
    
    def get_json(self, key: str) -> Optional[dict]:
        """Get JSON value from cache"""
        value = self.get(key)
        if value:
            try:
                return json.loads(value)
            except json.JSONDecodeError:
                return None
        return None
    
    def set_json(self, key: str, value: dict, ttl: int = 300) -> bool:
        """Set JSON value in cache"""
        try:
            return self.set(key, json.dumps(value), ttl)
        except Exception as e:
            logger.error(f"Redis SET JSON error: {e}")
            return False
    
    def invalidate_pattern(self, pattern: str) -> int:
        """Invalidate all keys matching pattern (use with caution)"""
        try:
            if hasattr(self._client, 'keys'):
                keys = self._client.keys(pattern)
                if keys:
                    return self._client.delete(*keys)
            return 0
        except Exception as e:
            logger.error(f"Redis INVALIDATE error: {e}")
            return 0


# Global Redis client instance
redis_client = RedisClient()


def cache(
    ttl: int = 300,
    key_prefix: str = "",
    key_builder: Callable = None
):
    """
    Caching decorator for async functions
    
    Usage:
        @cache(ttl=600, key_prefix="events")
        async def get_events(org_id: str):
            ...
    
    Args:
        ttl: Time to live in seconds (default 5 minutes)
        key_prefix: Prefix for cache key
        key_builder: Custom function to build cache key
    """
    def decorator(func: Callable):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # Build cache key
            if key_builder:
                cache_key = key_builder(*args, **kwargs)
            else:
                # Default key builder: prefix:func_name:hash(args)
                args_str = json.dumps([str(a) for a in args] + [f"{k}={v}" for k, v in sorted(kwargs.items())])
                args_hash = hashlib.md5(args_str.encode()).hexdigest()[:12]
                prefix = key_prefix or func.__name__
                cache_key = f"{prefix}:{args_hash}"
            
            # Try to get from cache
            cached = redis_client.get_json(cache_key)
            if cached is not None:
                logger.debug(f"Cache HIT: {cache_key}")
                return cached
            
            # Execute function and cache result
            logger.debug(f"Cache MISS: {cache_key}")
            result = await func(*args, **kwargs)
            
            # Cache the result (skip if None)
            if result is not None:
                redis_client.set_json(cache_key, result, ttl)
            
            return result
        
        # Add cache invalidation helper
        wrapper.invalidate = lambda *args, **kwargs: redis_client.delete(
            f"{key_prefix or func.__name__}:*"
        )
        
        return wrapper
    return decorator


def cache_key_org(org_id: str, *args) -> str:
    """Standard cache key builder with org_id"""
    parts = [org_id] + [str(a) for a in args]
    return ":".join(parts)
