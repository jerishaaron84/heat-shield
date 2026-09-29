"""Contract tests: the exact request shape the HeatShield frontend sends
(frontend/src/services/riskApi.js -> buildRiskRequest) must be accepted by
calculate_risk(), and bad values must surface as ValidationError (HTTP 422).
"""

import json
import pytest
from heat_risk_engine import calculate_risk
from validators import ValidationError

# Solar mapping used by the frontend: clamp(shortwave_radiation_W_m2 / 1000, 0, 1)
FRONTEND_REQUEST = {
    "temperature": 34,
    "temperature_unit": "C",
    "relative_humidity": 65,
    "wind_speed": 12,
    "wind_unit": "km/h",
    "solar_exposure": 0.5,          # 500 W/m2 / 1000
    "location": {"name": "Chennai", "lat": 13.0827, "lon": 80.2707},
    "timestamp": "2026-09-28T14:00",  # Open-Meteo local time, no UTC offset
}


def test_frontend_request_shape_is_accepted():
    result = calculate_risk(FRONTEND_REQUEST).to_dict()
    assert 0.0 <= result["risk"]["score"] <= 100.0
    assert result["risk"]["category"] in ("Low", "Moderate", "High", "Extreme")
    assert [f["factor"] for f in result["risk"]["factors"]]
    assert result["risk"]["explanation"]
    assert result["location"]["name"] == "Chennai"
    assert result["timestamp"] == "2026-09-28T14:00"
    assert "not a medical diagnostic tool" in result["disclaimer"]
    json.dumps(result)


def test_missing_solar_uses_engine_default_and_says_so():
    payload = {k: v for k, v in FRONTEND_REQUEST.items() if k != "solar_exposure"}
    result = calculate_risk(payload).to_dict()
    assert "unavailable" in result["risk"]["explanation"].lower()


def test_night_zero_radiation_is_valid_shaded():
    payload = dict(FRONTEND_REQUEST, solar_exposure=0.0, timestamp="2026-09-28T23:00")
    assert calculate_risk(payload).to_dict()["environment"]["solar_exposure"] == 0.0


def test_invalid_humidity_from_weather_source_is_rejected():
    with pytest.raises(ValidationError, match="relative_humidity must be between 0 and 100"):
        calculate_risk(dict(FRONTEND_REQUEST, relative_humidity=-10))
