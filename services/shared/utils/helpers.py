"""
Shared Helper Utilities
Common functions used across all microservices
"""

import math
from datetime import datetime, timezone
from typing import Optional
from uuid import uuid4

try:
    from nanoid import generate as _nanoid_generate
    NANOID_AVAILABLE = True
except ImportError:
    NANOID_AVAILABLE = False


def generate_id(prefix: str = "") -> str:
    """Generate a unique ID with optional prefix using UUID"""
    unique_id = uuid4().hex[:12]
    return f"{prefix}_{unique_id}" if prefix else unique_id


def nanoid_generate(size: int = 18) -> str:
    """Generate a NanoID (shorter, URL-friendly unique ID)"""
    if NANOID_AVAILABLE:
        return _nanoid_generate(size=size)
    else:
        # Fallback to UUID-based ID
        return uuid4().hex[:size]


def generate_asset_id() -> str:
    """Generate unique asset ID for equipment"""
    return f"ASSET_{nanoid_generate(18)}"


def generate_checkout_id() -> str:
    """Generate unique checkout ID"""
    return f"CHK_{nanoid_generate(18)}"


def generate_maintenance_id() -> str:
    """Generate unique maintenance ID"""
    return f"MNT_{nanoid_generate(18)}"


def generate_invoice_id() -> str:
    """Generate unique invoice ID"""
    return f"INV_{nanoid_generate(12)}"


def ensure_timezone_aware(dt: datetime) -> datetime:
    """Ensure datetime is timezone-aware (UTC if naive)"""
    if dt is None:
        return datetime.now(timezone.utc)
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def utc_now() -> datetime:
    """Get current UTC datetime"""
    return datetime.now(timezone.utc)


def format_currency(amount: float, currency: str = "INR") -> str:
    """Format amount as currency string"""
    symbols = {
        "INR": "₹",
        "USD": "$",
        "EUR": "€",
        "GBP": "£",
    }
    symbol = symbols.get(currency.upper(), currency)
    return f"{symbol}{amount:,.2f}"


def round_half_up(value: float, decimals: int = 2) -> float:
    """Round half up to specified decimal places (banker's rounding alternative)"""
    multiplier = 10 ** decimals
    return math.floor(value * multiplier + 0.5) / multiplier


def parse_date(date_str: Optional[str]) -> Optional[datetime]:
    """Parse ISO date string to datetime"""
    if not date_str:
        return None
    try:
        return datetime.fromisoformat(date_str.replace('Z', '+00:00'))
    except (ValueError, AttributeError):
        return None


def date_to_iso(dt: Optional[datetime]) -> Optional[str]:
    """Convert datetime to ISO string"""
    if not dt:
        return None
    return dt.isoformat()


def clamp(value: float, min_val: float, max_val: float) -> float:
    """Clamp value between min and max"""
    return max(min_val, min(value, max_val))


def safe_int(value, default: int = 0) -> int:
    """Safely convert to int with default"""
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def safe_float(value, default: float = 0.0) -> float:
    """Safely convert to float with default"""
    try:
        return float(value)
    except (TypeError, ValueError):
        return default
