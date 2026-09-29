"""
HeatShield – Geocoding service
--------------------------------
Resolves city names → (latitude, longitude, display info) using the
Open-Meteo Geocoding API (no API key required).

Docs: https://open-meteo.com/en/docs/geocoding-api
"""

from __future__ import annotations

import httpx

from app.config import GEOCODING_BASE_URL, REQUEST_TIMEOUT_SECONDS
from app.models import LocationInfo


class GeocodingError(Exception):
    """Raised when the geocoding provider cannot resolve a location."""


class LocationNotFoundError(GeocodingError):
    """Raised when the provider successfully finds no matching location."""


async def geocode_city(city_name: str) -> LocationInfo:
    """
    Resolve a city name to a LocationInfo.

    Raises
    ------
    GeocodingError
        If the city is not found or the API is unreachable.
    """
    params = {
        "name": city_name,
        "count": 1,
        "language": "en",
        "format": "json",
    }

    try:
        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT_SECONDS) as client:
            response = await client.get(GEOCODING_BASE_URL, params=params)
            response.raise_for_status()
    except httpx.TimeoutException as exc:
        raise GeocodingError(
            f"Geocoding API timed out while resolving '{city_name}'"
        ) from exc
    except httpx.HTTPStatusError as exc:
        raise GeocodingError(
            f"Geocoding API returned HTTP {exc.response.status_code} for '{city_name}'"
        ) from exc
    except httpx.RequestError as exc:
        raise GeocodingError(
            f"Geocoding API is unreachable: {exc}"
        ) from exc

    try:
        payload = response.json()
    except ValueError as exc:
        raise GeocodingError("Geocoding API returned invalid JSON.") from exc

    if not isinstance(payload, dict):
        raise GeocodingError("Geocoding API returned an unexpected response.")
    results = payload.get("results")

    if not results:
        raise LocationNotFoundError(
            f"Location not found: '{city_name}'. "
            "Please verify the city name and try again."
        )

    try:
        best = results[0]
        latitude = float(best["latitude"])
        longitude = float(best["longitude"])
        if not (-90 <= latitude <= 90 and -180 <= longitude <= 180):
            raise ValueError("coordinates out of range")
        return LocationInfo(
            name=best.get("name", city_name),
            latitude=latitude,
            longitude=longitude,
            country=best.get("country"),
            admin1=best.get("admin1"),
        )
    except (IndexError, KeyError, TypeError, ValueError) as exc:
        raise GeocodingError("Geocoding API returned invalid location data.") from exc


def location_from_coords(lat: float, lon: float) -> LocationInfo:
    """
    Build a minimal LocationInfo from raw coordinates.
    The display name is a formatted coordinate string.
    """
    return LocationInfo(
        name=f"{lat:.4f},{lon:.4f}",
        latitude=lat,
        longitude=lon,
        country=None,
        admin1=None,
    )
