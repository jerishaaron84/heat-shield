"""
HeatShield – Open-Meteo weather service
-----------------------------------------
Fetches current conditions and recent hourly weather data from Open-Meteo.
No API key is required.

Docs: https://open-meteo.com/en/docs

Variables fetched
-----------------
  temperature_2m          → air temperature at 2 m (°C)
    relative_humidity_2m    → current relative humidity at 2 m (%)
    wind_speed_10m          → current wind speed at 10 m (km/h)
    relativehumidity_2m     → hourly relative humidity at 2 m (%)
    windspeed_10m           → hourly wind speed at 10 m (km/h)
  shortwave_radiation     → downwelling solar radiation (W/m²)
"""

from __future__ import annotations

from datetime import datetime, timezone, timedelta
import math
from typing import Optional

import httpx

from app.config import (
    OPEN_METEO_BASE_URL,
    REQUEST_TIMEOUT_SECONDS,
)
from app.models import EnvironmentData, TrendEntry


# Open-Meteo variable names requested in every call
_HOURLY_VARS = [
    "temperature_2m",
    "relativehumidity_2m",
    "windspeed_10m",
    "shortwave_radiation",
]


class WeatherServiceError(Exception):
    """Raised when weather data cannot be retrieved or parsed."""


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _validated_weather_value(
    value: object, key: str, minimum: float, maximum: float
) -> Optional[float]:
    """Validate a provider value, preserving null when the field is unavailable."""
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise WeatherServiceError(f"Open-Meteo returned an invalid {key} value.")
    try:
        number = float(value)
    except (TypeError, ValueError) as exc:
        raise WeatherServiceError(f"Open-Meteo returned an invalid {key} value.") from exc
    if not math.isfinite(number) or not minimum <= number <= maximum:
        raise WeatherServiceError(f"Open-Meteo returned an out-of-range {key} value.")
    return number


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


async def fetch_current_weather(
    latitude: float, longitude: float
) -> tuple[EnvironmentData, datetime, str]:
    """
    Fetch Open-Meteo's current conditions, not a nearby hourly forecast slot.

    Returns
    -------
    (EnvironmentData, observation_timestamp_utc, observation_local_time)

    ``observation_local_time`` is the provider's wall-clock time at the
    location (ISO, no offset). The risk engine's time-of-day adjustment uses
    the local hour, so it must receive local time, not UTC.

    Raises
    ------
    WeatherServiceError
    """
    params = {
        "latitude": latitude,
        "longitude": longitude,
        "current": "temperature_2m,relative_humidity_2m,wind_speed_10m,shortwave_radiation",
        "timezone": "auto",
    }

    try:
        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT_SECONDS) as client:
            resp = await client.get(OPEN_METEO_BASE_URL, params=params)
            resp.raise_for_status()
    except httpx.TimeoutException as exc:
        raise WeatherServiceError("Open-Meteo API timed out.") from exc
    except httpx.HTTPStatusError as exc:
        raise WeatherServiceError(
            f"Open-Meteo returned HTTP {exc.response.status_code}."
        ) from exc
    except httpx.RequestError as exc:
        raise WeatherServiceError(f"Open-Meteo is unreachable: {exc}") from exc

    try:
        data = resp.json()
        current = data["current"]
        local_time_str = str(current["time"]).replace("Z", "")
        obs_local = datetime.fromisoformat(local_time_str)
        offset_seconds = data.get("utc_offset_seconds", 0) or 0
        obs_time = (obs_local - timedelta(seconds=int(offset_seconds))).replace(
            tzinfo=timezone.utc
        )
    except (AttributeError, KeyError, TypeError, ValueError) as exc:
        raise WeatherServiceError(
            "Unexpected current-conditions response structure from Open-Meteo."
        ) from exc

    if not isinstance(current, dict):
        raise WeatherServiceError("Open-Meteo returned invalid current conditions.")

    env = EnvironmentData(
        temperature=_validated_weather_value(current.get("temperature_2m"), "temperature_2m", -100, 70),
        humidity=_validated_weather_value(current.get("relative_humidity_2m"), "relative_humidity_2m", 0, 100),
        wind_speed=_validated_weather_value(current.get("wind_speed_10m"), "wind_speed_10m", 0, 500),
        solar_radiation=_validated_weather_value(current.get("shortwave_radiation"), "shortwave_radiation", 0, 2000),
    )
    return env, obs_time, local_time_str


async def fetch_trend_data(
    latitude: float, longitude: float, hours: int = 24
) -> list[TrendEntry]:
    """
    Fetch up to *hours* hours of recent + forecast hourly data.

    Strategy:
      • Past hours  → Open-Meteo Archive API (last 5 days available)
      • Future hours → forecast endpoint
    We keep things simple: ask the forecast endpoint for past_days=2
    to get recent actuals, then trim to the requested window.

    Raises
    ------
    WeatherServiceError
    """
    # Clamp to a sane window (max 168 h = 7 days)
    hours = max(1, min(hours, 168))

    params = {
        "latitude": latitude,
        "longitude": longitude,
        "hourly": ",".join(_HOURLY_VARS),
        "past_days": 2,
        "forecast_days": 3,
        "timezone": "UTC",
    }

    try:
        async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT_SECONDS) as client:
            resp = await client.get(OPEN_METEO_BASE_URL, params=params)
            resp.raise_for_status()
    except httpx.TimeoutException as exc:
        raise WeatherServiceError("Open-Meteo API timed out during trend fetch.") from exc
    except httpx.HTTPStatusError as exc:
        raise WeatherServiceError(
            f"Open-Meteo returned HTTP {exc.response.status_code} during trend fetch."
        ) from exc
    except httpx.RequestError as exc:
        raise WeatherServiceError(f"Open-Meteo is unreachable: {exc}") from exc

    try:
        data = resp.json()
        hourly = data["hourly"]
        times: list[str] = hourly["time"]
        if not isinstance(hourly, dict) or not isinstance(times, list):
            raise TypeError("hourly.time must be a list")
    except (KeyError, TypeError, ValueError) as exc:
        raise WeatherServiceError(
            f"Unexpected trend response structure from Open-Meteo: {exc}"
        ) from exc

    now_utc = datetime.now(tz=timezone.utc)
    window_start = now_utc - timedelta(hours=hours)

    entries: list[TrendEntry] = []
    for i, t_str in enumerate(times):
        try:
            slot_dt = datetime.fromisoformat(t_str).replace(tzinfo=timezone.utc)
        except (TypeError, ValueError):
            continue

        # Keep only slots within [window_start, now_utc]
        if slot_dt < window_start or slot_dt > now_utc:
            continue

        def _get(var: str) -> Optional[float]:
            values = hourly.get(var, [])
            value = values[i] if i < len(values) else None
            limits = {
                "temperature_2m": (-100, 70),
                "relativehumidity_2m": (0, 100),
                "windspeed_10m": (0, 500),
                "shortwave_radiation": (0, 2000),
            }
            minimum, maximum = limits[var]
            return _validated_weather_value(value, var, minimum, maximum)

        entries.append(
            TrendEntry(
                timestamp=slot_dt,
                temperature=_get("temperature_2m"),
                humidity=_get("relativehumidity_2m"),
                wind_speed=_get("windspeed_10m"),
                solar_radiation=_get("shortwave_radiation"),
            )
        )

    return entries
