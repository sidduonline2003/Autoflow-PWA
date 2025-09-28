"""Router package initialization.

This module ensures that legacy helpers expected by tests remain
available when importing :mod:`backend.routers.postprod`.
"""

from importlib import import_module

from ..utils.submission_summary import (
    build_submission_summary as _fallback_build_submission_summary,
    iso_timestamp as _fallback_iso_timestamp,
)

_postprod = import_module(".postprod", __name__)

if not hasattr(_postprod, "_build_submission_summary"):
    _postprod._build_submission_summary = _fallback_build_submission_summary

if not hasattr(_postprod, "_iso"):
    _postprod._iso = _fallback_iso_timestamp

__all__ = [
    "_postprod",
]
