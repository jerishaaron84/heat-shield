"""
HeatShield – bridge to the Person 2 Heat-Risk Engine
-----------------------------------------------------
Person 2's ``calculate_risk()`` (risk_engine/heat_risk_engine.py) is the SINGLE
SOURCE OF TRUTH for every risk score, category, factor, explanation and
recommendation in HeatShield.

This module contains NO risk formula. It only:
  1. makes the sibling ``risk_engine/`` package importable,
  2. converts backend weather values (W/m² radiation) into the engine's input
     contract (solar_exposure 0.0-1.0),
  3. calls ``calculate_risk()`` and returns ``RiskResult.to_dict()`` unchanged.

The former placeholder ``evaluate_risk()`` scoring table that shipped with the
Person 3 backend was removed so that there is only one heat-risk calculation.

Deliberately free of FastAPI / pydantic imports so it can be unit-tested alone.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import Any, Optional

# backend/app/services/risk_engine.py -> <repo>/risk_engine
_DEFAULT_ENGINE_DIR = Path(__file__).resolve().parents[3] / "risk_engine"
ENGINE_DIR = Path(os.getenv("RISK_ENGINE_DIR", str(_DEFAULT_ENGINE_DIR))).resolve()

if not (ENGINE_DIR / "heat_risk_engine.py").exists():
    raise RuntimeError(
        f"HeatShield risk engine not found at {ENGINE_DIR}. "
        "Expected <repo>/risk_engine/heat_risk_engine.py (or set RISK_ENGINE_DIR)."
    )
if str(ENGINE_DIR) not in sys.path:
    sys.path.insert(0, str(ENGINE_DIR))

from heat_risk_engine import calculate_risk  # noqa: E402  (Person 2 - authoritative)
from validators import ValidationError  # noqa: E402,F401  (re-exported for routes)

# Same documented mapping the frontend uses (frontend/src/services/riskApi.js):
#   solar_exposure = clamp(shortwave_radiation_W_m2 / 1000, 0, 1)
SOLAR_FULL_SUN_W_M2 = 1000.0


def radiation_to_solar_exposure(radiation_w_m2: Optional[float]) -> Optional[float]:
    """Map shortwave radiation (W/m²) to the engine's 0.0-1.0 solar exposure.

    Returns None when radiation is unavailable so the engine applies its own
    documented default (thresholds.json -> solar_default). Nothing is invented.
    """
    if radiation_w_m2 is None:
        return None
    exposure = max(0.0, min(1.0, float(radiation_w_m2) / SOLAR_FULL_SUN_W_M2))
    return round(exposure, 3)


def build_engine_inputs(
    *,
    temperature: Optional[float],
    humidity: Optional[float],
    wind_speed: Optional[float],
    solar_radiation: Optional[float],
    location: Optional[dict] = None,
    timestamp: Optional[str] = None,
) -> dict[str, Any]:
    """Build the dict accepted by ``calculate_risk()`` from live weather values."""
    inputs: dict[str, Any] = {
        "temperature": temperature,
        "temperature_unit": "C",
        "relative_humidity": humidity,
        "wind_speed": wind_speed,
        "wind_unit": "km/h",
    }
    solar = radiation_to_solar_exposure(solar_radiation)
    if solar is not None:
        inputs["solar_exposure"] = solar
    if location:
        inputs["location"] = location
    if timestamp:
        inputs["timestamp"] = timestamp
    return inputs


def assess(inputs: dict[str, Any]) -> dict[str, Any]:
    """Run Person 2's engine and return its RiskResult as a plain dict."""
    return calculate_risk(inputs).to_dict()
