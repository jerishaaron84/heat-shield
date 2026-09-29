"""
HeatShield – Test suite (Person 3: Backend + Data)
----------------------------------------------------
Tests cover:
  1.  /api/health
  2.  /api/current → valid city name
  3.  /api/current → valid lat/lon
  4.  /api/current → invalid location (city not found)
  5.  /api/current → weather API failure (502)
  6.  /api/current → missing location params (400)
  7.  /api/risk   → valid city, live weather → risk engine integration
  8.  Risk bridge  → unit tests (delegates to Person 2 calculate_risk)
  9.  /api/trend  → valid city
  10. /api/trend  → weather API failure
  11. Cache       → second request served from cache

External HTTP calls are mocked with `respx` so tests run fully offline.
"""

from __future__ import annotations

import json
import sys
import os
from datetime import datetime, timezone, timedelta

import httpx
import pytest
import respx
from httpx import Response as HttpxResponse
from starlette.testclient import TestClient

# Make sure 'app' package is importable when running from backend/ directory
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from app.main import app
from app.services.cache import cache_clear
from app.services import risk_engine

# ---------------------------------------------------------------------------
# Test client
# ---------------------------------------------------------------------------

client = TestClient(app)

# ---------------------------------------------------------------------------
# URL patterns used by the services
# ---------------------------------------------------------------------------

GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search"
WEATHER_URL = "https://api.open-meteo.com/v1/forecast"

# ---------------------------------------------------------------------------
# Helper payload builders
# ---------------------------------------------------------------------------


def _geocode_payload(name="Chennai", lat=13.0827, lon=80.2707):
    return {
        "results": [
            {
                "name": name,
                "latitude": lat,
                "longitude": lon,
                "country": "India",
                "admin1": "Tamil Nadu",
            }
        ]
    }


def _weather_payload(temp=38.2, humidity=64.0, wind=12.4, solar=650.0):
    ts = datetime.now(tz=timezone.utc).strftime("%Y-%m-%dT%H:00")
    return {
        "latitude": 13.0827,
        "longitude": 80.2707,
        "current": {
            "time": ts,
            "temperature_2m": temp,
            "relative_humidity_2m": humidity,
            "wind_speed_10m": wind,
            "shortwave_radiation": solar,
        },
    }


def _trend_payload():
    now = datetime.now(tz=timezone.utc).replace(minute=0, second=0, microsecond=0)
    t1 = (now - timedelta(hours=2)).strftime("%Y-%m-%dT%H:00")
    t2 = (now - timedelta(hours=1)).strftime("%Y-%m-%dT%H:00")
    return {
        "latitude": 13.0827,
        "longitude": 80.2707,
        "hourly": {
            "time": [t1, t2],
            "temperature_2m": [37.0, 38.2],
            "relativehumidity_2m": [63.0, 64.0],
            "windspeed_10m": [11.0, 12.4],
            "shortwave_radiation": [600.0, 650.0],
        },
    }


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(autouse=True)
def clear_cache_before_each():
    cache_clear()
    yield
    cache_clear()


# ---------------------------------------------------------------------------
# 1. Health endpoint
# ---------------------------------------------------------------------------


def test_health():
    resp = client.get("/api/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert "version" in data
    assert data["data_source"] == "Open-Meteo"
    assert "timestamp" in data


# ---------------------------------------------------------------------------
# 2. /api/current → valid city name
# ---------------------------------------------------------------------------


@respx.mock
def test_current_valid_city():
    respx.get(GEOCODING_URL).mock(return_value=HttpxResponse(200, json=_geocode_payload()))
    weather_route = respx.get(WEATHER_URL).mock(
        return_value=HttpxResponse(200, json=_weather_payload())
    )

    resp = client.get("/api/current?location=Chennai")
    assert resp.status_code == 200, resp.text
    data = resp.json()

    assert data["location"]["name"] == "Chennai"
    assert data["location"]["latitude"] == 13.0827
    assert data["environment"]["temperature"] == 38.2
    assert data["environment"]["humidity"] == 64.0
    assert data["environment"]["wind_speed"] == 12.4
    assert data["environment"]["solar_radiation"] == 650.0
    assert data["data_source"] == "Open-Meteo"
    assert "timestamp" in data
    assert "units" in data
    assert weather_route.calls[0].request.url.params["current"] == (
        "temperature_2m,relative_humidity_2m,wind_speed_10m,shortwave_radiation"
    )


@respx.mock
def test_current_missing_optional_weather_field_returns_null():
    payload = _weather_payload()
    del payload["current"]["shortwave_radiation"]
    respx.get(GEOCODING_URL).mock(return_value=HttpxResponse(200, json=_geocode_payload()))
    respx.get(WEATHER_URL).mock(return_value=HttpxResponse(200, json=payload))

    resp = client.get("/api/current?location=Chennai")

    assert resp.status_code == 200, resp.text
    assert resp.json()["environment"]["solar_radiation"] is None


@respx.mock
def test_current_rejects_invalid_weather_value():
    payload = _weather_payload(temp="not-a-number")
    respx.get(GEOCODING_URL).mock(return_value=HttpxResponse(200, json=_geocode_payload()))
    respx.get(WEATHER_URL).mock(return_value=HttpxResponse(200, json=payload))

    resp = client.get("/api/current?location=Chennai")

    assert resp.status_code == 502
    assert "invalid temperature_2m" in resp.json()["detail"]


@respx.mock
def test_current_rejects_out_of_range_weather_value():
    respx.get(GEOCODING_URL).mock(return_value=HttpxResponse(200, json=_geocode_payload()))
    respx.get(WEATHER_URL).mock(
        return_value=HttpxResponse(200, json=_weather_payload(temp=100.0))
    )

    resp = client.get("/api/current?location=Chennai")

    assert resp.status_code == 502
    assert "out-of-range temperature_2m" in resp.json()["detail"]


@respx.mock
def test_current_rejects_unexpected_weather_response():
    respx.get(GEOCODING_URL).mock(return_value=HttpxResponse(200, json=_geocode_payload()))
    respx.get(WEATHER_URL).mock(return_value=HttpxResponse(200, json={"hourly": {}}))

    resp = client.get("/api/current?location=Chennai")

    assert resp.status_code == 502
    assert "unexpected current-conditions" in resp.json()["detail"].lower()


# ---------------------------------------------------------------------------
# 3. /api/current → valid lat/lon
# ---------------------------------------------------------------------------


@respx.mock
def test_current_valid_coords():
    respx.get(WEATHER_URL).mock(return_value=HttpxResponse(200, json=_weather_payload()))

    resp = client.get("/api/current?lat=13.0827&lon=80.2707")
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["environment"]["temperature"] == 38.2


# ---------------------------------------------------------------------------
# 4. /api/current → city not found → 404
# ---------------------------------------------------------------------------


@respx.mock
def test_current_city_not_found():
    respx.get(GEOCODING_URL).mock(return_value=HttpxResponse(200, json={"results": []}))

    resp = client.get("/api/current?location=NonexistentCityXYZ123")
    assert resp.status_code == 404
    assert "not found" in resp.json()["detail"].lower()


@respx.mock
def test_current_geocoding_provider_failure():
    respx.get(GEOCODING_URL).mock(return_value=HttpxResponse(503, text="Unavailable"))

    resp = client.get("/api/current?location=Chennai")

    assert resp.status_code == 502
    assert "geocoding api returned http 503" in resp.json()["detail"].lower()


# ---------------------------------------------------------------------------
# 5. /api/current → weather API failure → 502
# ---------------------------------------------------------------------------


@respx.mock
def test_current_weather_api_failure():
    respx.get(GEOCODING_URL).mock(return_value=HttpxResponse(200, json=_geocode_payload()))
    respx.get(WEATHER_URL).mock(return_value=HttpxResponse(500, text="Internal Server Error"))

    resp = client.get("/api/current?location=Chennai")
    assert resp.status_code == 502


@respx.mock
def test_current_weather_timeout():
    respx.get(GEOCODING_URL).mock(return_value=HttpxResponse(200, json=_geocode_payload()))
    respx.get(WEATHER_URL).mock(side_effect=httpx.ReadTimeout("timed out"))

    resp = client.get("/api/current?location=Chennai")

    assert resp.status_code == 502
    assert "timed out" in resp.json()["detail"].lower()


# ---------------------------------------------------------------------------
# 6. /api/current → missing location params → 400
# ---------------------------------------------------------------------------


def test_current_missing_location():
    resp = client.get("/api/current")
    assert resp.status_code == 400
    detail = resp.json()["detail"].lower()
    assert "location" in detail or "supply" in detail or "lat" in detail


# ---------------------------------------------------------------------------
# 7. /api/risk → live weather + risk engine integration
# ---------------------------------------------------------------------------


@respx.mock
def test_get_risk_uses_person2_calculate_risk():
    """GET /api/risk must equal calculate_risk() on the same live values."""
    respx.get(GEOCODING_URL).mock(return_value=HttpxResponse(200, json=_geocode_payload()))
    respx.get(WEATHER_URL).mock(
        return_value=HttpxResponse(200, json=_weather_payload(temp=42.0, humidity=70.0, wind=5.0, solar=750.0))
    )

    resp = client.get("/api/risk?location=Chennai")
    assert resp.status_code == 200, resp.text
    data = resp.json()

    # RiskResult schema of Person 2 (not a backend-specific schema)
    assert set(["risk", "environment", "location", "timestamp", "metadata", "disclaimer", "recommendations"]) <= set(data)
    assert set(["score", "category", "factors", "explanation"]) <= set(data["risk"])
    assert data["location"]["name"] == "Chennai"
    assert data["environment"]["temperature"] == 42.0

    expected = risk_engine.assess(
        risk_engine.build_engine_inputs(
            temperature=42.0, humidity=70.0, wind_speed=5.0, solar_radiation=750.0,
            location={"name": "Chennai", "lat": 13.0827, "lon": 80.2707},
            timestamp=data["timestamp"],
        )
    )
    assert data["risk"]["score"] == expected["risk"]["score"]
    assert data["risk"]["category"] == expected["risk"]["category"]


@respx.mock
def test_get_risk_incomplete_weather_returns_502():
    payload = _weather_payload()
    payload["current"]["temperature_2m"] = None
    respx.get(GEOCODING_URL).mock(return_value=HttpxResponse(200, json=_geocode_payload()))
    respx.get(WEATHER_URL).mock(return_value=HttpxResponse(200, json=payload))
    assert client.get("/api/risk?location=Chennai").status_code == 502


CHENNAI_REQUEST = {
    "temperature": 34,
    "temperature_unit": "C",
    "relative_humidity": 65,
    "wind_speed": 12,
    "wind_unit": "km/h",
    "solar_exposure": "partial",
    "location": {"name": "Chennai", "lat": 13.0827, "lon": 80.2707},
}


def test_post_risk_matches_calculate_risk():
    resp = client.post("/api/risk", json=CHENNAI_REQUEST)
    assert resp.status_code == 200, resp.text
    assert resp.json() == risk_engine.assess(CHENNAI_REQUEST)


def test_post_risk_invalid_humidity_returns_422():
    bad = dict(CHENNAI_REQUEST, relative_humidity=-10)
    resp = client.post("/api/risk", json=bad)
    assert resp.status_code == 422
    assert resp.json()["detail"]["error"] == "ValidationError"


def test_post_risk_missing_required_field_returns_422():
    bad = {k: v for k, v in CHENNAI_REQUEST.items() if k != "temperature"}
    assert client.post("/api/risk", json=bad).status_code == 422


def test_post_risk_batch_in_order_and_reports_bad_index():
    items = [CHENNAI_REQUEST, dict(CHENNAI_REQUEST, temperature=44)]
    resp = client.post("/api/risk/batch", json={"items": items})
    assert resp.status_code == 200
    results = resp.json()["results"]
    assert [r["risk"]["score"] for r in results] == [
        risk_engine.assess(i)["risk"]["score"] for i in items
    ]
    bad = client.post("/api/risk/batch", json={"items": [CHENNAI_REQUEST, dict(CHENNAI_REQUEST, relative_humidity=-10)]})
    assert bad.status_code == 422
    assert "items[1]" in bad.json()["detail"]["message"]


def test_cors_allows_post_from_vite_origin():
    resp = client.options(
        "/api/risk",
        headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "POST"},
    )
    assert resp.status_code == 200
    assert "POST" in resp.headers.get("access-control-allow-methods", "")


# ---------------------------------------------------------------------------
# 8. Risk bridge (no formula lives in the backend any more)
# ---------------------------------------------------------------------------


class TestRiskBridge:
    def test_solar_mapping(self):
        assert risk_engine.radiation_to_solar_exposure(None) is None
        assert risk_engine.radiation_to_solar_exposure(500) == 0.5
        assert risk_engine.radiation_to_solar_exposure(2000) == 1.0
        assert risk_engine.radiation_to_solar_exposure(-5) == 0.0

    def test_missing_radiation_is_omitted_not_invented(self):
        inputs = risk_engine.build_engine_inputs(
            temperature=30, humidity=50, wind_speed=5, solar_radiation=None
        )
        assert "solar_exposure" not in inputs

    def test_backend_has_no_own_scoring_function(self):
        assert not hasattr(risk_engine, "evaluate_risk")


# ---------------------------------------------------------------------------
# 9. /api/trend → valid city
# ---------------------------------------------------------------------------


@respx.mock
def test_trend_valid_city():
    respx.get(GEOCODING_URL).mock(return_value=HttpxResponse(200, json=_geocode_payload()))
    respx.get(WEATHER_URL).mock(return_value=HttpxResponse(200, json=_trend_payload()))

    resp = client.get("/api/trend?location=Chennai&hours=24")
    assert resp.status_code == 200, resp.text
    data = resp.json()

    assert data["location"]["name"] == "Chennai"
    assert data["hours"] == 24
    assert isinstance(data["data"], list)
    assert data["data_source"] == "Open-Meteo"
    for entry in data["data"]:
        assert "timestamp" in entry


@respx.mock
def test_trend_rejects_invalid_weather_value():
    payload = _trend_payload()
    payload["hourly"]["relativehumidity_2m"][0] = 140.0
    respx.get(GEOCODING_URL).mock(return_value=HttpxResponse(200, json=_geocode_payload()))
    respx.get(WEATHER_URL).mock(return_value=HttpxResponse(200, json=payload))

    resp = client.get("/api/trend?location=Chennai&hours=24")

    assert resp.status_code == 502
    assert "out-of-range relativehumidity_2m" in resp.json()["detail"]


@respx.mock
def test_trend_rejects_unexpected_provider_response():
    respx.get(GEOCODING_URL).mock(return_value=HttpxResponse(200, json=_geocode_payload()))
    respx.get(WEATHER_URL).mock(return_value=HttpxResponse(200, json={"hourly": []}))

    resp = client.get("/api/trend?location=Chennai&hours=24")

    assert resp.status_code == 502
    assert "unexpected trend response" in resp.json()["detail"].lower()


# ---------------------------------------------------------------------------
# 10. /api/trend → weather API failure → 502
# ---------------------------------------------------------------------------


@respx.mock
def test_trend_weather_failure():
    respx.get(GEOCODING_URL).mock(return_value=HttpxResponse(200, json=_geocode_payload()))
    respx.get(WEATHER_URL).mock(return_value=HttpxResponse(503, text="Service Unavailable"))

    resp = client.get("/api/trend?location=Chennai")
    assert resp.status_code == 502


# ---------------------------------------------------------------------------
# 11. Cache: second request served from cache (no extra API calls)
# ---------------------------------------------------------------------------


@respx.mock
def test_cache_prevents_duplicate_api_calls():
    geo_route = respx.get(GEOCODING_URL).mock(
        return_value=HttpxResponse(200, json=_geocode_payload())
    )
    wx_route = respx.get(WEATHER_URL).mock(
        return_value=HttpxResponse(200, json=_weather_payload())
    )

    r1 = client.get("/api/current?location=Chennai")
    assert r1.status_code == 200

    r2 = client.get("/api/current?location=Chennai")
    assert r2.status_code == 200

    # Geocoding called once (cached), weather called once (cached)
    assert geo_route.call_count == 1, "Geocoding should be cached after first call"
    assert wx_route.call_count == 1, "Weather should be cached after first call"

    # Both responses should be identical
    assert r1.json()["environment"] == r2.json()["environment"]
