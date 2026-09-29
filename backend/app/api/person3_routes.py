"""
HeatShield – Person 3 API Routes
----------------------------------
These routes are owned by Person 3 (Backend + Data).

Endpoints:
  GET /api/health          → service health check
  GET /api/current         → live weather for a location
  POST /api/risk           → heat-risk RiskResult for supplied environment values
  POST /api/risk/batch     → same, for several snapshots (forecast hours)
  GET  /api/risk           → same RiskResult, server fetches live weather itself
  GET /api/trend           → hourly trend data for the past N hours

Query parameters (shared by /current, /risk, /trend):
  location  : str   city name or "lat,lon"  (one of location OR lat+lon required)
  lat       : float latitude
  lon       : float longitude

Additional for /trend:
  hours     : int   window size in hours (default: 24, max: 168)
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, status

from app.config import APP_VERSION, DATA_SOURCE
from app.models import (
    CurrentWeatherResponse,
    HealthResponse,
    RiskBatchRequest,
    RiskRequest,
    TrendResponse,
)
from app.services.cache import (
    cache_get,
    cache_set,
    trend_key,
    weather_key,
)
from app.services.geocoding import GeocodingError, LocationNotFoundError
from app.services.location import resolve_location
from app.services import risk_engine
from app.services.weather import WeatherServiceError, fetch_current_weather, fetch_trend_data

router = APIRouter(prefix="/api", tags=["HeatShield"])


# ---------------------------------------------------------------------------
# Helper: location resolution with uniform error handling
# ---------------------------------------------------------------------------


async def _resolve(
    location: Optional[str], lat: Optional[float], lon: Optional[float]
):
    try:
        return await resolve_location(location=location, lat=lat, lon=lon)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except LocationNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except GeocodingError as exc:
        raise HTTPException(status_code=502, detail=str(exc))


# ---------------------------------------------------------------------------
# Helper: live weather fetch with cache + uniform error handling
# ---------------------------------------------------------------------------


async def _weather(loc_lat: float, loc_lon: float):
    key = weather_key(loc_lat, loc_lon)
    cached = cache_get(key)
    if cached is not None:
        return cached

    try:
        env, ts, local_time = await fetch_current_weather(loc_lat, loc_lon)
    except WeatherServiceError as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    result = (env, ts, local_time)
    cache_set(key, result)
    return result


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@router.get("/health", response_model=HealthResponse, summary="Service health check")
async def health():
    """Returns service status, version, and data source."""
    return HealthResponse(
        status="ok",
        version=APP_VERSION,
        data_source=DATA_SOURCE,
        timestamp=datetime.now(tz=timezone.utc),
    )


@router.get(
    "/current",
    response_model=CurrentWeatherResponse,
    summary="Live current weather for a location",
)
async def current_weather(
    location: Optional[str] = Query(
        None,
        description="City name (e.g. Chennai) or 'lat,lon' string",
        examples={"city": {"value": "Chennai"}, "coords": {"value": "13.08,80.27"}},
    ),
    lat: Optional[float] = Query(None, description="Latitude (decimal degrees)"),
    lon: Optional[float] = Query(None, description="Longitude (decimal degrees)"),
):
    """
    Fetch live weather data from Open-Meteo for the given location.

    Returns temperature, humidity, wind speed, and solar radiation
    sourced directly from the Open-Meteo API — no fabricated values.
    """
    loc = await _resolve(location, lat, lon)
    env, ts, _local_time = await _weather(loc.latitude, loc.longitude)

    return CurrentWeatherResponse(
        location=loc,
        timestamp=ts,
        environment=env,
        data_source=DATA_SOURCE,
    )


def _run_engine(inputs: dict, index: Optional[int] = None) -> dict:
    """Call Person 2's calculate_risk() and map its errors to HTTP codes."""
    prefix = f"items[{index}]: " if index is not None else ""
    try:
        return risk_engine.assess(inputs)
    except risk_engine.ValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"error": "ValidationError", "message": f"{prefix}{exc}"},
        )
    except Exception as exc:  # engine/config failure
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error": "EngineError", "message": str(exc)},
        )


@router.post("/risk", summary="Heat-risk RiskResult from supplied environment values")
async def risk_from_values(payload: RiskRequest):
    """
    Body = Person 2's calculate_risk() input contract. The response is the
    engine's ``RiskResult.to_dict()`` returned unchanged.
    """
    return _run_engine(payload.model_dump(exclude_unset=True))


@router.post("/risk/batch", summary="RiskResult for several snapshots (forecast hours)")
async def risk_batch(payload: RiskBatchRequest):
    """Each item goes through exactly the same calculate_risk() as POST /api/risk."""
    return {
        "results": [
            _run_engine(item.model_dump(exclude_unset=True), index=i)
            for i, item in enumerate(payload.items)
        ]
    }


@router.get("/risk", summary="Heat-risk RiskResult for a location using live weather")
async def risk_for_location(
    location: Optional[str] = Query(None, description="City name or 'lat,lon' string"),
    lat: Optional[float] = Query(None, description="Latitude"),
    lon: Optional[float] = Query(None, description="Longitude"),
):
    """
    Resolve location -> fetch live Open-Meteo weather -> calculate_risk().

    Convenience mode for clients that do not have weather values. The result
    is the same RiskResult schema as POST /api/risk (single source of truth:
    Person 2's calculate_risk()).
    """
    loc = await _resolve(location, lat, lon)
    env, _ts, local_time = await _weather(loc.latitude, loc.longitude)

    if env.temperature is None or env.humidity is None or env.wind_speed is None:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Weather provider returned incomplete data (temperature, "
            "humidity and wind speed are required to calculate heat risk).",
        )

    inputs = risk_engine.build_engine_inputs(
        temperature=env.temperature,
        humidity=env.humidity,
        wind_speed=env.wind_speed,
        solar_radiation=env.solar_radiation,
        location={"name": loc.name, "lat": loc.latitude, "lon": loc.longitude},
        timestamp=local_time,
    )
    return _run_engine(inputs)


@router.get(
    "/trend",
    response_model=TrendResponse,
    summary="Hourly trend data for the past N hours",
)
async def trend(
    location: Optional[str] = Query(
        None,
        description="City name or 'lat,lon' string",
    ),
    lat: Optional[float] = Query(None, description="Latitude"),
    lon: Optional[float] = Query(None, description="Longitude"),
    hours: int = Query(
        24,
        ge=1,
        le=168,
        description="Trend window in hours (1–168). Default: 24.",
    ),
):
    """
    Return an hourly time-series of environmental data for the past *hours* hours.

    Data is fetched from Open-Meteo using the past_days parameter (max 2 days
    of recent actuals are available on the free tier).  Only hours within
    the requested window are included.
    """
    loc = await _resolve(location, lat, lon)

    t_key = trend_key(loc.latitude, loc.longitude, hours)
    cached = cache_get(t_key)
    if cached is not None:
        entries = cached
    else:
        try:
            entries = await fetch_trend_data(loc.latitude, loc.longitude, hours)
        except WeatherServiceError as exc:
            raise HTTPException(status_code=502, detail=str(exc))
        cache_set(t_key, entries)

    return TrendResponse(
        location=loc,
        hours=hours,
        data=entries,
        data_source=DATA_SOURCE,
    )
