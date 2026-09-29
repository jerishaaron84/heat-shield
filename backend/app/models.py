"""
HeatShield – Pydantic response / data models
----------------------------------------------
All field names and units are documented here so they remain consistent
across services, routes, and tests.

Units:
  temperature     → °C
  humidity        → %
  wind_speed      → km/h
  solar_radiation → W/m²  (shortwave radiation)
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional, Union

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Sub-models
# ---------------------------------------------------------------------------


class LocationInfo(BaseModel):
    name: str = Field(..., description="Resolved place name")
    latitude: float = Field(..., description="Decimal degrees (WGS84)")
    longitude: float = Field(..., description="Decimal degrees (WGS84)")
    country: Optional[str] = Field(None, description="Country name if available")
    admin1: Optional[str] = Field(None, description="State/province if available")


class EnvironmentData(BaseModel):
    temperature: Optional[float] = Field(None, description="Air temperature (°C)")
    humidity: Optional[float] = Field(None, description="Relative humidity (%)")
    wind_speed: Optional[float] = Field(None, description="Wind speed at 10 m (km/h)")
    solar_radiation: Optional[float] = Field(
        None, description="Shortwave solar radiation (W/m²)"
    )


# ---------------------------------------------------------------------------
# Primary response models
# ---------------------------------------------------------------------------


class CurrentWeatherResponse(BaseModel):
    location: LocationInfo
    timestamp: datetime = Field(..., description="UTC timestamp of the observation")
    environment: EnvironmentData
    data_source: str = Field("Open-Meteo", description="Live weather data provider")
    units: dict = Field(
        default={
            "temperature": "°C",
            "humidity": "%",
            "wind_speed": "km/h",
            "solar_radiation": "W/m²",
        },
        description="Unit labels for each environment field",
    )


class RiskLocationSchema(BaseModel):
    name: Optional[str] = Field(None, examples=["Chennai"])
    lat: Optional[float] = Field(None, examples=[13.0827])
    lon: Optional[float] = Field(None, examples=[80.2707])


class RiskRequest(BaseModel):
    """Input contract of Person 2's calculate_risk() (unchanged)."""

    temperature: float = Field(..., description="Ambient temperature", examples=[34.0])
    temperature_unit: Optional[str] = Field("C", description="'C' or 'F'")
    relative_humidity: float = Field(..., description="Relative humidity (0-100%)", examples=[65.0])
    wind_speed: float = Field(..., description="Wind speed", examples=[12.0])
    wind_unit: Optional[str] = Field("km/h", description="'km/h' or 'm/s'")
    solar_exposure: Optional[Union[float, str]] = Field(
        None, description="0.0-1.0 or 'shaded'|'partial'|'full_sun'", examples=[0.5]
    )
    location: Optional[RiskLocationSchema] = None
    timestamp: Optional[str] = Field(None, examples=["2026-09-28T14:00"])


class RiskBatchRequest(BaseModel):
    items: list[RiskRequest] = Field(..., min_length=1, max_length=48)


class TrendEntry(BaseModel):
    timestamp: datetime
    temperature: Optional[float] = None
    humidity: Optional[float] = None
    wind_speed: Optional[float] = None
    solar_radiation: Optional[float] = None


class TrendResponse(BaseModel):
    location: LocationInfo
    hours: int = Field(..., description="Trend window requested (hours)")
    data: list[TrendEntry] = Field(..., description="Hourly time-series")
    data_source: str = Field("Open-Meteo", description="Live weather data provider")
    units: dict = Field(
        default={
            "temperature": "°C",
            "humidity": "%",
            "wind_speed": "km/h",
            "solar_radiation": "W/m²",
        }
    )


class HealthResponse(BaseModel):
    status: str
    version: str
    data_source: str
    timestamp: datetime


class ErrorResponse(BaseModel):
    error: str
    detail: str
    status_code: int
