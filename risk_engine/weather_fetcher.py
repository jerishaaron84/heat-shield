"""Optional Weather Fetcher for HeatShield (Demonstration / Dev Tool).

Fetches current weather observations using the free Open-Meteo API
(no API key required) and maps the response to the HeatShield Risk Engine
input contract.

IMPORTANT:
This module is independent and completely decoupled from the core risk engine.
The core engine does NOT depend on this module. If Person 3 handles data
ingestion, this module can be omitted or replaced without impact.
"""

from typing import Dict, Any, Optional
import requests


def fetch_weather(lat: float, lon: float, location_name: Optional[str] = None) -> Dict[str, Any]:
    """Fetch current ambient conditions from Open-Meteo API for given lat/lon.

    Returns:
        Dict conforming directly to calculate_risk() input contract:
        {
            "temperature": float,
            "temperature_unit": "C",
            "relative_humidity": float,
            "wind_speed": float,
            "wind_unit": "km/h",
            "solar_exposure": float,
            "location": {"name": ..., "lat": ..., "lon": ...},
            "timestamp": str
        }

    Raises:
        RuntimeError: If Open-Meteo API request fails or returns an error.
    """
    url = "https://api.open-meteo.com/v1/forecast"
    params = {
        "latitude": lat,
        "longitude": lon,
        "current": [
            "temperature_2m",
            "relative_humidity_2m",
            "wind_speed_10m",
            "direct_normal_irradiance",
            "cloud_cover"
        ],
        "timezone": "auto"
    }

    try:
        response = requests.get(url, params=params, timeout=10)
        response.raise_for_status()
        data = response.json()
    except requests.RequestException as exc:
        raise RuntimeError(f"Open-Meteo weather fetch failed: {exc}") from exc

    current = data.get("current", {})
    if not current:
        raise RuntimeError("No current weather data returned from Open-Meteo.")

    temp = current.get("temperature_2m", 25.0)
    humidity = current.get("relative_humidity_2m", 50.0)
    wind_speed = current.get("wind_speed_10m", 10.0)
    cloud_cover = current.get("cloud_cover", 20.0)  # 0 to 100%
    timestamp = current.get("time")

    # Map cloud cover to approximate solar exposure index (0.0 shaded to 1.0 full sun)
    # Higher cloud cover implies lower direct solar exposure
    solar_exposure = round(max(0.0, min(1.0, (100.0 - cloud_cover) / 100.0)), 2)

    return {
        "temperature": float(temp),
        "temperature_unit": "C",
        "relative_humidity": float(humidity),
        "wind_speed": float(wind_speed),
        "wind_unit": "km/h",
        "solar_exposure": solar_exposure,
        "location": {
            "name": location_name or f"{lat:.2f}, {lon:.2f}",
            "lat": lat,
            "lon": lon
        },
        "timestamp": timestamp
    }
