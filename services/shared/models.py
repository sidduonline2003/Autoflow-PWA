"""
Shared Pydantic Models - Common response schemas and utilities
Used across all microservices for consistent API responses
"""

from datetime import datetime, timezone
from typing import Any, Generic, List, Optional, TypeVar
from pydantic import BaseModel, Field
from uuid import uuid4

T = TypeVar('T')


class BaseResponse(BaseModel):
    """Standard API response wrapper"""
    success: bool = True
    message: Optional[str] = None
    data: Optional[Any] = None
    
    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }


class PaginatedResponse(BaseModel, Generic[T]):
    """Paginated list response"""
    items: List[T]
    total: int
    page: int = 1
    page_size: int = 20
    has_more: bool = False
    
    @classmethod
    def create(cls, items: List[T], total: int, page: int = 1, page_size: int = 20):
        return cls(
            items=items,
            total=total,
            page=page,
            page_size=page_size,
            has_more=(page * page_size) < total
        )


class ErrorResponse(BaseModel):
    """Standard error response"""
    success: bool = False
    error: str
    detail: Optional[str] = None
    code: Optional[str] = None


class SuccessResponse(BaseModel):
    """Simple success response"""
    success: bool = True
    message: str = "Operation completed successfully"
    id: Optional[str] = None


# === Common Field Definitions ===

class TimestampMixin(BaseModel):
    """Mixin for models with timestamp fields"""
    createdAt: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updatedAt: Optional[datetime] = None


class AuditMixin(TimestampMixin):
    """Mixin for models with audit trail"""
    createdBy: Optional[str] = None
    updatedBy: Optional[str] = None


# === Utility Functions ===

def generate_id(prefix: str = "") -> str:
    """Generate a unique ID with optional prefix"""
    unique_id = uuid4().hex[:12]
    return f"{prefix}_{unique_id}" if prefix else unique_id


def utc_now() -> datetime:
    """Get current UTC datetime"""
    return datetime.now(timezone.utc)


def to_firestore_timestamp(dt: datetime) -> datetime:
    """Ensure datetime is timezone-aware for Firestore"""
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


# === Common Request/Response Models ===

class IdRequest(BaseModel):
    """Request with just an ID"""
    id: str


class StatusUpdate(BaseModel):
    """Generic status update request"""
    status: str
    notes: Optional[str] = None


class BulkDeleteRequest(BaseModel):
    """Request for bulk deletion"""
    ids: List[str]


class BulkDeleteResponse(BaseModel):
    """Response for bulk deletion"""
    success: bool = True
    deleted: int
    failed: int = 0
    errors: Optional[List[str]] = None


# === Date/Time Helpers ===

class DateRange(BaseModel):
    """Date range filter"""
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    
    def to_datetime_range(self) -> tuple:
        """Convert to datetime objects"""
        start = datetime.fromisoformat(self.start_date.replace('Z', '+00:00')) if self.start_date else None
        end = datetime.fromisoformat(self.end_date.replace('Z', '+00:00')) if self.end_date else None
        return start, end


# === Pagination Helpers ===

class PaginationParams(BaseModel):
    """Common pagination parameters"""
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=20, ge=1, le=100)
    
    @property
    def offset(self) -> int:
        return (self.page - 1) * self.page_size
    
    @property
    def limit(self) -> int:
        return self.page_size
