# HeatShield

Environmental heat-exposure risk indicator. **Not** a medical diagnostic tool.

## Final architecture

```
Open-Meteo weather ──► React dashboard (Person 1) ──POST /api/risk──┐
                                                                      ▼
Open-Meteo weather ──► GET /api/risk?location=… ───────────► Main backend (backend/, FastAPI :8000)
                                                                      │
                                                                      ▼
                                              Person 2 Risk Engine  calculate_risk()   (single source of truth)
                                                                      │
                                                                      ▼
                                                                 RiskResult
                                                     ┌────────────────┴───────────────┐
                                                     ▼                                ▼
                                       Person 1 Dashboard                 Alert layer (Person 4)
                                  score / category / factors /        adaptRiskEngineResponse → evaluateAlert
                                  explanation / recommendations       → banner (+ optional browser notification)
```

* `backend/` is the one backend. It contains **no risk formula**; `backend/app/services/risk_engine.py`
  only converts weather values and calls `heat_risk_engine.calculate_risk()`.
* The alert layer is a **frontend-only** module (no server, database or external provider). It reads the
  engine's `RiskResult` (`risk.score`, `risk.category`, `recommendations`) and never recalculates risk.
* `risk_engine/api.py` is Person 2's standalone dev/test wrapper (port 8001). It is **not** used at
  runtime by the frontend and does not need to run.

## Layout

```
frontend/      React + Vite dashboard (Person 1); alert UI in src/person4/
backend/       FastAPI main backend (Person 3): weather, geocoding, cache, /api/*
risk_engine/   Person 2 engine (heat_risk_engine.py, scoring.py, validators.py, models.py,
               explanations.py, config/thresholds.json, tests/, examples/)
alerts/        Person 4 docs (INTEGRATION.txt, PERSON_4_README.md)
requirements.txt  .env.example  .gitignore
```

## Install

```bash
# Python 3.11+ (from repository root)
pip install -r requirements.txt

# Node 18+
cd frontend && npm install
```

## Run

Quickest: double-click `start.bat` (Windows) or run `./start.sh` (Mac/Linux), then open http://localhost:5173.

Manual:

```bash
# Terminal 1 – backend (http://localhost:8000, docs at /docs)
cd backend
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

# Terminal 2 – frontend (http://localhost:5173)
cd frontend
npm run dev
```

Open **http://localhost:5173** (dashboard) and **http://localhost:8000/docs** (API docs).
Vite proxies `/api/*` to `http://127.0.0.1:8000` (override with `VITE_RISK_API_TARGET`).

## API

| Method | Path | Purpose |
|---|---|---|
| GET  | `/api/health` | Health check |
| POST | `/api/risk` | `calculate_risk()` for supplied values (used by the dashboard) |
| POST | `/api/risk/batch` | Same, 1–48 snapshots (forecast hours) |
| GET  | `/api/risk?location=Chennai` (or `lat`,`lon`) | Backend fetches live weather, then `calculate_risk()` |
| GET  | `/api/current` | Live weather only |
| GET  | `/api/trend` | Recent hourly weather |

**POST /api/risk request** (Person 2 contract):

```json
{ "temperature": 34, "temperature_unit": "C", "relative_humidity": 65,
  "wind_speed": 12, "wind_unit": "km/h", "solar_exposure": "partial",
  "location": {"name": "Chennai", "lat": 13.0827, "lon": 80.2707},
  "timestamp": "2026-09-28T14:00" }
```

**Response** is `RiskResult.to_dict()` unchanged: `risk{score,category,factors[{factor,impact,contribution}],explanation}`,
`environment`, `location`, `timestamp`, `metadata`, `disclaimer`, `recommendations`.
Errors: `422` invalid input (e.g. humidity −10), `502` weather provider failure/incomplete data,
`400/404` location problems, `500` engine failure.

## Alerts

Thresholds live in `frontend/src/person4/alertEngine.js` (score ≥ 50 high, ≥ 75 extreme; these equal the
engine's category boundaries in `thresholds.json`). The dashboard passes only the adapted `RiskResult`, so the
alert's heat-index thresholds stay inactive (no second heat-index signal). Browser notifications need the user to
click **Enable browser alerts** and fire only when the alert changes into high/extreme. No API keys,
database or migration are required.

## Tests

```bash
cd risk_engine && python -m pytest          # Person 2 engine
cd backend     && python -m pytest          # backend (needs fastapi, respx, pytest-asyncio installed)
cd frontend    && npm run test:alerts       # alert module
```

## Environment variables

See `backend/.env.example` and `frontend/.env.example`. No secrets are required (Open-Meteo is keyless).

## Troubleshooting

* "Unable to calculate heat risk" → backend not running on :8000, or weather values invalid.
* CORS errors when bypassing the proxy → add your origin to `CORS_ORIGINS` in `backend/.env`.
* `risk engine not found` at backend start → keep `risk_engine/` next to `backend/` or set `RISK_ENGINE_DIR`.

## Team responsibilities

Person 1 frontend · Person 2 risk engine · Person 3 backend/data · Person 4 alerts/integration/testing.
