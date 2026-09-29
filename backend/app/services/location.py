"""
HeatShield – Location resolution utility
------------------------------------------
Supports:
  1. City name strings  → geocoded via Open-Meteo Geocoding API
  2. "lat,lon" strings  → parsed directly
  3. lat + lon query params passed separately (handled in routes)

Usage
-----
  location = await resolve_location(location="Chennai")
  location = await resolve_location(location="13.0827,80.2707")
  location = await resolve_location(lat=13.0827, lon=80.2707)
"""

from __future__ import annotations

import re
from typing import Optional

from app.models import LocationInfo
from app.services.geocoding import GeocodingError, geocode_city, location_from_coords
from app.services.cache import cache_get, cache_set, geocode_key


_COORD_PATTERN = re.compile(
    r"^(?P<lat>-?\d+(?:\.\d+)?)\s*,\s*(?P<lon>-?\d+(?:\.\d+)?)$"
)


async def resolve_location(
    location: Optional[str] = None,
    lat: Optional[float] = None,
    lon: Optional[float] = None,
) -> LocationInfo:
    """
    Resolve the given input to a LocationInfo.

    Priority order:
      1. lat + lon floats supplied directly
      2. location string that looks like "lat,lon"
      3. location string treated as a city name

    Raises
    ------
    GeocodingError
        If the city cannot be found.
    ValueError
        If coordinates are out of range or input is missing.
    """
    # 1. Raw coordinates
    if lat is not None and lon is not None:
        _validate_coords(lat, lon)
        return location_from_coords(lat, lon)

    if not location:
        raise ValueError(
            "Supply either a 'location' query parameter (city name or 'lat,lon') "
            "or both 'lat' and 'lon' query parameters."
        )

    location = location.strip()

    # 2. Coordinate string
    m = _COORD_PATTERN.match(location)
    if m:
        lat_val = float(m.group("lat"))
        lon_val = float(m.group("lon"))
        _validate_coords(lat_val, lon_val)
        return location_from_coords(lat_val, lon_val)

    # 3. City name (with cache)
    key = geocode_key(location)
    cached = cache_get(key)
    if cached is not None:
        return cached

    result = await geocode_city(location)
    cache_set(key, result)
    return result


def _validate_coords(lat: float, lon: float) -> None:
    if not (-90.0 <= lat <= 90.0):
        raise ValueError(f"Latitude {lat} is out of range [-90, 90].")
    if not (-180.0 <= lon <= 180.0):
        raise ValueError(f"Longitude {lon} is out of range [-180, 180].")
