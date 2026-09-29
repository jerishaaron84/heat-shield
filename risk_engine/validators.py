"""Input validation and normalization module for HeatShield Risk Engine.

Handles unit conversion, boundary checking, solar category mapping,
and provides clear, friendly validation errors without crashing.
"""

from typing import Dict, Any, Tuple, Optional
from models import LocationData, EnvironmentalInputs


class ValidationError(Exception):
    """Raised when an environmental input is invalid or out of physical bounds."""
    pass


def validate_and_normalize_inputs(
    data: Dict[str, Any],
    solar_mapping: Dict[str, float],
    solar_default: float = 0.5
) -> EnvironmentalInputs:
    """Validate raw input dictionary and normalize into EnvironmentalInputs.

    Rules:
    - Temperature: C or F. Converted to Celsius. Realistic physical bounds: -40C to 70C (-40F to 158F).
    - Relative Humidity: 0.0 to 100.0%.
    - Wind Speed: >= 0. Supported units: 'km/h', 'm/s'. Converted to km/h.
    - Solar Exposure: 0.0 to 1.0 or category ('shaded', 'partial', 'full_sun').
      If missing, defaults to None (with solar_default applied gracefully during scoring).
    - Location: Optional name, lat, lon.
    - Timestamp: Optional ISO string.
    """
    if not isinstance(data, dict):
        raise ValidationError("Input payload must be a dictionary.")

    # 1. Temperature Validation
    if "temperature" not in data or data["temperature"] is None:
        raise ValidationError("temperature is required.")
    try:
        temp_val = float(data["temperature"])
    except (ValueError, TypeError):
        raise ValidationError("temperature must be a numeric value.")

    temp_unit = str(data.get("temperature_unit", "C")).strip().upper()
    if temp_unit not in ("C", "F"):
        raise ValidationError("temperature_unit must be 'C' or 'F'.")

    # Convert to Celsius for validation and internal calculation
    if temp_unit == "F":
        temp_c = (temp_val - 32.0) * (5.0 / 9.0)
    else:
        temp_c = temp_val

    if temp_c < -40.0 or temp_c > 75.0:
        raise ValidationError(
            f"Temperature {temp_val}°{temp_unit} is outside physically realistic meteorological bounds (-40°C to 75°C)."
        )

    # 2. Humidity Validation
    if "relative_humidity" not in data or data["relative_humidity"] is None:
        raise ValidationError("relative_humidity is required.")
    try:
        rh_val = float(data["relative_humidity"])
    except (ValueError, TypeError):
        raise ValidationError("relative_humidity must be a numeric value.")

    if rh_val < 0.0 or rh_val > 100.0:
        raise ValidationError("relative_humidity must be between 0 and 100.")

    # 3. Wind Speed Validation
    if "wind_speed" not in data or data["wind_speed"] is None:
        raise ValidationError("wind_speed is required.")
    try:
        wind_val = float(data["wind_speed"])
    except (ValueError, TypeError):
        raise ValidationError("wind_speed must be a numeric value.")

    wind_unit_raw = str(data.get("wind_unit", "km/h")).strip().lower()
    if wind_unit_raw in ("km/h", "kmh", "kph"):
        wind_unit = "km/h"
        wind_kmh = wind_val
    elif wind_unit_raw in ("m/s", "ms"):
        wind_unit = "m/s"
        wind_kmh = wind_val * 3.6  # 1 m/s = 3.6 km/h
    else:
        raise ValidationError("wind_unit must be 'km/h' or 'm/s'.")

    if wind_val < 0.0:
        raise ValidationError("wind_speed cannot be negative.")
    if wind_kmh > 350.0:
        raise ValidationError("wind_speed exceeds realistic meteorological limits (>350 km/h).")

    # 4. Solar Exposure Validation
    solar_val = data.get("solar_exposure")
    solar_normalized: Optional[float] = None
    solar_raw = solar_val

    if solar_val is not None:
        if isinstance(solar_val, str):
            category_key = solar_val.strip().lower()
            if category_key in solar_mapping:
                solar_normalized = float(solar_mapping[category_key])
            else:
                valid_options = ", ".join(solar_mapping.keys())
                raise ValidationError(
                    f"solar_exposure must be between 0 and 1 or one of: {valid_options}."
                )
        else:
            try:
                num_solar = float(solar_val)
                if 0.0 <= num_solar <= 1.0:
                    solar_normalized = num_solar
                else:
                    raise ValidationError("solar_exposure numeric value must be between 0.0 and 1.0.")
            except (ValueError, TypeError):
                raise ValidationError("solar_exposure must be a number between 0 and 1 or a recognized category string.")

    # 5. Optional Location
    loc_obj: Optional[LocationData] = None
    if "location" in data and isinstance(data["location"], dict):
        loc_dict = data["location"]
        loc_obj = LocationData(
            name=loc_dict.get("name"),
            lat=float(loc_dict["lat"]) if "lat" in loc_dict and loc_dict["lat"] is not None else None,
            lon=float(loc_dict["lon"]) if "lon" in loc_dict and loc_dict["lon"] is not None else None,
        )

    # 6. Optional Timestamp
    timestamp_val = data.get("timestamp")
    if timestamp_val is not None:
        timestamp_val = str(timestamp_val).strip()

    return EnvironmentalInputs(
        temperature=temp_c,
        temperature_unit=temp_unit,
        relative_humidity=rh_val,
        wind_speed=wind_kmh,
        wind_unit=wind_unit,
        solar_exposure=solar_normalized,
        solar_exposure_raw=solar_raw,
        location=loc_obj,
        timestamp=timestamp_val
    )
