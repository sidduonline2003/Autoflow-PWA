# Shared Module for AutoStudioFlow Microservices
# Provides common utilities, Firebase client, Redis caching, and authentication

from .firebase_client import get_db, Collections
from .redis_client import redis_client, cache
from .auth import get_current_user, get_current_user_basic, require_role
from .models import BaseResponse, PaginatedResponse, ErrorResponse

__all__ = [
    # Firebase
    'get_db',
    'Collections',
    # Redis
    'redis_client',
    'cache',
    # Auth
    'get_current_user',
    'get_current_user_basic',
    'require_role',
    # Models
    'BaseResponse',
    'PaginatedResponse',
    'ErrorResponse',
]
