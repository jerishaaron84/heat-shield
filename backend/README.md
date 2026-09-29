# HeatShield Backend (main API)

FastAPI service on **http://localhost:8000** (docs: `/docs`). Weather comes from Open-Meteo (no API key).

**Risk is never calculated here.** Every score, category, factor, explanation and recommendation comes from
Person 2's `calculate_risk()` in `../risk_engine/heat_risk_engine.py`. `app/services/risk_engine.py` only converts
weather values (radiation W/m² -> `solar_exposure` 0-1) and calls the engine. `RiskResult.to_dict()` is returned unchanged.

## Run

```bash
pip install -r ../requirements.txt
cp .env.example .env            # optional; defaults work (Windows: Copy-Item .env.example .env)
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

## Endpoints

| Method | Path | Notes |
|---|---|---|
| GET | `/api/health` | `{status, version, data_source, timestamp}` |
| POST | `/api/risk` | Body = engine input contract; returns RiskResult (used by the dashboard) |
| POST | `/api/risk/batch` | `{"items":[...1-48 snapshots]}` -> `{"results":[...]}` |
| GET | `/api/risk?location=Chennai` (or `lat`,`lon`) | Fetches live weather, then `calculate_risk()`; same RiskResult schema |
| GET | `/api/current` | Live weather only |
| GET | `/api/trend?location=...&hours=24` | Recent hourly weather |

POST body example:

```json
{"temperature":34,"temperature_unit":"C","relative_humidity":65,"wind_speed":12,"wind_unit":"km/h",
 "solar_exposure":"partial","location":{"name":"Chennai","lat":13.0827,"lon":80.2707},"timestamp":"2026-09-28T14:00"}
```

RiskResult fields: `risk{score,category,factors[{factor,impact,contribution}],explanation}`, `environment`,
`location`, `timestamp`, `metadata`, `disclaimer`, `recommendations`.

## Errors

| Case | Status |
|---|---|
| Invalid engine input (e.g. humidity -10), missing required field | 422 |
| Missing/invalid location params | 400 |
| City not found | 404 |
| Weather/geocoding provider failure, timeout, invalid or incomplete data | 502 |
| Engine/config failure | 500 |

## Environment variables (`.env`)

`OPEN_METEO_BASE_URL`, `GEOCODING_BASE_URL`, `REQUEST_TIMEOUT_SECONDS` (10), `CACHE_TTL_SECONDS` (300),
`CORS_ORIGINS` (Vite ports 5173/4173), `RISK_ENGINE_DIR` (optional override of `../risk_engine`).

## Tests

```bash
python -m pytest tests/ -v      # external HTTP mocked with respx; runs offline
python verify.py                # live check against a running server
```
