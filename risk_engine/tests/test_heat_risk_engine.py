"""Unit and integration tests for HeatShield Person 2 Heat-Risk Engine.

Verifies:
1. Low-risk scenario
2. Moderate-risk scenario
3. High-risk scenario
4. Extreme-risk scenario
5. Fahrenheit input
6. Celsius input
7. km/h wind
8. m/s wind
9. solar category input ('shaded', 'partial', 'full_sun')
10. numeric solar input
11. missing optional location
12. missing optional timestamp
13. missing solar exposure
14. invalid humidity (<0 or >100)
15. invalid wind (<0)
16. invalid temperature (unrealistic bounds)
17. malformed input (non-dict, non-numeric)
18. score always remains 0-100 across extreme edge inputs
19. contributing factors are ranked in descending order
20. output is 100% JSON serializable
"""

import json
import pytest
from heat_risk_engine import calculate_risk
from validators import ValidationError


def test_1_low_risk_scenario():
    """Verify realistic cool, breezy, shaded conditions produce a Low risk category."""
    payload = {
        "temperature": 18.0,
        "temperature_unit": "C",
        "relative_humidity": 35.0,
        "wind_speed": 22.0,
        "wind_unit": "km/h",
        "solar_exposure": 0.1
    }
    result = calculate_risk(payload)
    assert 0.0 <= result.risk.score <= 24.0
    assert result.risk.category == "Low"
    assert "low" in result.risk.explanation.lower()


def test_2_moderate_risk_scenario():
    """Verify warm, moderate humidity and moderate sun produce a Moderate category."""
    payload = {
        "temperature": 28.0,
        "temperature_unit": "C",
        "relative_humidity": 50.0,
        "wind_speed": 12.0,
        "wind_unit": "km/h",
        "solar_exposure": 0.5
    }
    result = calculate_risk(payload)
    assert 25.0 <= result.risk.score <= 49.0
    assert result.risk.category == "Moderate"
    assert "moderate" in result.risk.explanation.lower()


def test_3_high_risk_scenario():
    """Verify hot, moderately humid conditions produce a High category."""
    payload = {
        "temperature": 33.0,
        "temperature_unit": "C",
        "relative_humidity": 55.0,
        "wind_speed": 10.0,
        "wind_unit": "km/h",
        "solar_exposure": 0.7
    }
    result = calculate_risk(payload)
    assert 50.0 <= result.risk.score <= 74.0
    assert result.risk.category == "High"
    assert "high" in result.risk.explanation.lower()


def test_4_extreme_risk_scenario():
    """Verify severe heatwave, high humidity, calm air, direct sun produce Extreme category."""
    payload = {
        "temperature": 43.0,
        "temperature_unit": "C",
        "relative_humidity": 75.0,
        "wind_speed": 2.0,
        "wind_unit": "km/h",
        "solar_exposure": 1.0,
        "timestamp": "2026-09-27T14:00:00"  # Peak afternoon
    }
    result = calculate_risk(payload)
    assert 75.0 <= result.risk.score <= 100.0
    assert result.risk.category == "Extreme"
    assert "extreme" in result.risk.explanation.lower()


def test_5_fahrenheit_input():
    """Verify Fahrenheit conversion functions correctly."""
    # 95°F = 35°C
    payload_f = {
        "temperature": 95.0,
        "temperature_unit": "F",
        "relative_humidity": 65.0,
        "wind_speed": 10.0,
        "wind_unit": "km/h",
        "solar_exposure": 0.5
    }
    payload_c = {
        "temperature": 35.0,
        "temperature_unit": "C",
        "relative_humidity": 65.0,
        "wind_speed": 10.0,
        "wind_unit": "km/h",
        "solar_exposure": 0.5
    }
    res_f = calculate_risk(payload_f)
    res_c = calculate_risk(payload_c)
    assert pytest.approx(res_f.risk.score, 0.5) == res_c.risk.score
    assert res_f.environment.temperature_unit == "F"
    assert res_f.environment.temperature == 95.0


def test_6_celsius_input():
    """Verify standard Celsius input behaves as expected."""
    payload = {
        "temperature": 32.0,
        "temperature_unit": "C",
        "relative_humidity": 55.0,
        "wind_speed": 15.0,
        "wind_unit": "km/h",
        "solar_exposure": 0.6
    }
    res = calculate_risk(payload)
    assert res.environment.temperature == 32.0
    assert res.environment.temperature_unit == "C"


def test_7_kmh_wind():
    """Verify km/h wind unit input."""
    payload = {
        "temperature": 30.0,
        "relative_humidity": 50.0,
        "wind_speed": 18.0,
        "wind_unit": "km/h",
        "solar_exposure": 0.5
    }
    res = calculate_risk(payload)
    assert res.environment.wind_unit == "km/h"
    assert res.environment.wind_speed == 18.0


def test_8_ms_wind():
    """Verify m/s wind speed is normalized and produces expected relief."""
    # 5 m/s = 18 km/h
    payload_ms = {
        "temperature": 30.0,
        "relative_humidity": 50.0,
        "wind_speed": 5.0,
        "wind_unit": "m/s",
        "solar_exposure": 0.5
    }
    payload_kmh = {
        "temperature": 30.0,
        "relative_humidity": 50.0,
        "wind_speed": 18.0,
        "wind_unit": "km/h",
        "solar_exposure": 0.5
    }
    res_ms = calculate_risk(payload_ms)
    res_kmh = calculate_risk(payload_kmh)
    assert pytest.approx(res_ms.risk.score, 0.5) == res_kmh.risk.score
    assert res_ms.environment.wind_unit == "m/s"
    assert res_ms.environment.wind_speed == 5.0


def test_9_solar_category_input():
    """Verify categorical solar inputs ('shaded', 'partial', 'full_sun')."""
    base = {
        "temperature": 33.0,
        "relative_humidity": 60.0,
        "wind_speed": 10.0,
        "wind_unit": "km/h"
    }

    res_shaded = calculate_risk({**base, "solar_exposure": "shaded"})
    res_partial = calculate_risk({**base, "solar_exposure": "partial"})
    res_full = calculate_risk({**base, "solar_exposure": "full_sun"})

    assert res_shaded.risk.score < res_partial.risk.score < res_full.risk.score
    assert res_shaded.environment.solar_exposure == 0.0
    assert res_partial.environment.solar_exposure == 0.5
    assert res_full.environment.solar_exposure == 1.0


def test_10_numeric_solar_input():
    """Verify numeric solar exposure ranging from 0.0 to 1.0."""
    payload = {
        "temperature": 33.0,
        "relative_humidity": 60.0,
        "wind_speed": 10.0,
        "solar_exposure": 0.75
    }
    res = calculate_risk(payload)
    assert res.environment.solar_exposure == 0.75


def test_11_missing_optional_location():
    """Verify execution succeeds when optional location is omitted."""
    payload = {
        "temperature": 32.0,
        "relative_humidity": 50.0,
        "wind_speed": 10.0,
        "solar_exposure": 0.5
    }
    res = calculate_risk(payload)
    assert res.location is None


def test_12_missing_optional_timestamp():
    """Verify execution succeeds when timestamp is absent, skipping time adjustment."""
    payload = {
        "temperature": 32.0,
        "relative_humidity": 50.0,
        "wind_speed": 10.0,
        "solar_exposure": 0.5
    }
    res = calculate_risk(payload)
    assert res.timestamp is None
    assert res.metadata.time_adjustment_applied is False
    assert "time-of-day" not in res.risk.explanation.lower()


def test_13_missing_solar_exposure():
    """Verify execution succeeds when solar exposure is omitted without crashing."""
    payload = {
        "temperature": 32.0,
        "relative_humidity": 50.0,
        "wind_speed": 10.0
    }
    res = calculate_risk(payload)
    assert res.environment.solar_exposure is None
    assert "solar radiation data was unavailable" in res.risk.explanation.lower()


def test_14_invalid_humidity():
    """Verify relative humidity outside 0-100 raises clean ValidationError."""
    payload_neg = {"temperature": 30.0, "relative_humidity": -5.0, "wind_speed": 10.0}
    with pytest.raises(ValidationError, match="relative_humidity must be between 0 and 100"):
        calculate_risk(payload_neg)

    payload_high = {"temperature": 30.0, "relative_humidity": 105.0, "wind_speed": 10.0}
    with pytest.raises(ValidationError, match="relative_humidity must be between 0 and 100"):
        calculate_risk(payload_high)


def test_15_invalid_wind():
    """Verify negative wind speed raises clean ValidationError."""
    payload = {"temperature": 30.0, "relative_humidity": 50.0, "wind_speed": -2.0}
    with pytest.raises(ValidationError, match="wind_speed cannot be negative"):
        calculate_risk(payload)


def test_16_invalid_temperature():
    """Verify out-of-bounds temperature raises clean ValidationError."""
    payload = {"temperature": 150.0, "temperature_unit": "C", "relative_humidity": 50.0, "wind_speed": 10.0}
    with pytest.raises(ValidationError, match="meteorological bounds"):
        calculate_risk(payload)


def test_17_malformed_input():
    """Verify non-dict or unparseable inputs raise clean ValidationError."""
    with pytest.raises(ValidationError, match="must be a dictionary"):
        calculate_risk("not-a-dict")  # type: ignore

    with pytest.raises(ValidationError, match="temperature must be a numeric value"):
        calculate_risk({"temperature": "invalid", "relative_humidity": 50.0, "wind_speed": 10.0})

    with pytest.raises(ValidationError, match="solar_exposure must be between 0 and 1"):
        calculate_risk({
            "temperature": 30.0,
            "relative_humidity": 50.0,
            "wind_speed": 10.0,
            "solar_exposure": "unknown_string"
        })


def test_18_score_always_remains_0_to_100():
    """Verify extreme edge-case boundaries never exceed 0-100 scale."""
    # Sub-zero / minimal heat
    cold_res = calculate_risk({
        "temperature": -10.0,
        "temperature_unit": "C",
        "relative_humidity": 5.0,
        "wind_speed": 50.0,
        "wind_unit": "km/h",
        "solar_exposure": 0.0
    })
    assert 0.0 <= cold_res.risk.score <= 100.0

    # Max realistic inferno
    hot_res = calculate_risk({
        "temperature": 55.0,
        "temperature_unit": "C",
        "relative_humidity": 95.0,
        "wind_speed": 0.0,
        "wind_unit": "km/h",
        "solar_exposure": 1.0,
        "timestamp": "2026-09-27T13:00:00"
    })
    assert 0.0 <= hot_res.risk.score <= 100.0


def test_19_contributing_factors_ranked():
    """Verify contributing factors are ranked in strictly descending order."""
    payload = {
        "temperature": 38.0,
        "relative_humidity": 75.0,
        "wind_speed": 4.0,
        "solar_exposure": 0.9
    }
    result = calculate_risk(payload)
    factors = result.risk.factors
    assert len(factors) == 4
    contributions = [f.contribution for f in factors]
    assert contributions == sorted(contributions, reverse=True)


def test_20_output_json_serializable():
    """Verify complete output is serializable to JSON without custom encoders."""
    payload = {
        "temperature": 35.0,
        "temperature_unit": "C",
        "relative_humidity": 70,
        "wind_speed": 10,
        "wind_unit": "km/h",
        "solar_exposure": 0.8,
        "location": {
            "name": "Chennai",
            "lat": 13.0827,
            "lon": 80.2707
        },
        "timestamp": "2026-09-27T14:30:00+05:30"
    }
    result = calculate_risk(payload)
    result_dict = result.to_dict()

    json_str = json.dumps(result_dict)
    assert isinstance(json_str, str)
    deserialized = json.loads(json_str)

    assert "risk" in deserialized
    assert "environment" in deserialized
    assert "location" in deserialized
    assert "timestamp" in deserialized
    assert "metadata" in deserialized
    assert "disclaimer" in deserialized
    assert "recommendations" in deserialized
    assert isinstance(deserialized["recommendations"], list)
    assert "environmental heat-exposure" in deserialized["disclaimer"].lower()
