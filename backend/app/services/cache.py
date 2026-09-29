"""
HeatShield – Simple TTL in-memory cache
-----------------------------------------
Avoids hammering the weather API when multiple requests arrive for the
same location within a short window (default: 5 minutes).

Thread-safety: asyncio single-threaded model makes dict operations safe.
This is intentionally simple — a hackathon-friendly solution.
For production, replace with Redis or similar.
"""

from __future__ import annotations

import time
from typing import Any, Optional

from app.config import CACHE_TTL_SECONDS


# cache store: key → (value, expiry_epoch_seconds)
_store: dict[str, tuple[Any, float]] = {}


def _make_key(*parts: object) -> str:
    return "|".join(str(p) for p in parts)


def cache_get(key: str) -> Optional[Any]:
    """Return cached value if present and not expired, else None."""
    entry = _store.get(key)
    if entry is None:
        return None
    value, expiry = entry
    if time.monotonic() > expiry:
        del _store[key]
        return None
    return value


def cache_set(key: str, value: Any, ttl: int = CACHE_TTL_SECONDS) -> None:
    """Store *value* under *key* with the given TTL (seconds)."""
    _store[key] = (value, time.monotonic() + ttl)


def cache_clear() -> None:
    """Clear all cached entries (useful in tests)."""
    _store.clear()


def weather_key(lat: float, lon: float) -> str:
    # Round to 2 d.p. so nearby coordinates share a cache slot
    return _make_key("weather", round(lat, 2), round(lon, 2))


def trend_key(lat: float, lon: float, hours: int) -> str:
    return _make_key("trend", round(lat, 2), round(lon, 2), hours)


def geocode_key(city: str) -> str:
    return _make_key("geocode", city.strip().lower())
