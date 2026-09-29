# Person 3 Integration Guide — HeatShield Heat-Risk Engine

**Owner**: Person 2 (AI / Heat-Risk Engine)  
**Target Consumer**: Person 3 (Backend / Central API & Data Layer)

---

## 1. Executive Summary

Person 2 delivers an independent, transparent, and deterministic **Heat-Risk Scoring Engine**.
- **Person 3 Owns**: Live weather fetching, persistent storage (PostgreSQL/MongoDB), user session authentication, job scheduling, and central routing.
- **Person 2 Owns**: Environmental input validation, psychrometric Heat Index calculation (NOAA/NWS Rothfusz), environmental factor adjustments (wind, solar, time), risk category classification, dynamic explanations, and safety disclaimers.

The engine requires **no heavy dependencies** (runs on Python Standard Library alone) and does not require starting the React frontend.

---

## 2. Core Python Import & Usage

Person 3 can directly import `calculate_risk` from `heat_risk_engine`:

```python
from heat_risk_engine import calculate_risk

def process_heat_request(incoming_payload: dict) -> dict:
    """Takes normalized environmental parameters and returns the JSON-serializable risk contract."""
    risk_result = calculate_risk({
        "temperature": incoming_payload["temperature"],
        "temperature_unit": incoming_payload.get("temperature_unit", "C"),  # 'C' or 'F'
        "relative_humidity": incoming_payload["relative_humidity"],          # 0 to 100%
        "wind_speed": incoming_payload["wind_speed"],                        # numeric >= 0
        "wind_unit": incoming_payload.get("wind_unit", "km/h"),              # 'km/h' or 'm/s'
        "solar_exposure": incoming_payload.get("solar_exposure", 0.5),       # 0.0-1.0 or 'shaded'|'partial'|'full_sun'
        "location": incoming_payload.get("location"),                        # Optional: {"name": ..., "lat": ..., "lon": ...}
        "timestamp": incoming_payload.get("timestamp")                       # Optional: ISO 8601 string
    })

    # Return pure JSON-serializable dictionary
    return risk_result.to_dict()
```

---

## 3. Input Contract Specifications

| Field | Type | Required? | Accepted Values / Bounds | Default |
| :--- | :--- | :---: | :--- | :--- |
| `temperature` | `float` | **Yes** | `-40.0` to `75.0` °C (`-40` to `167` °F) | — |
| `temperature_unit` | `str` | No | `"C"` or `"F"` | `"C"` |
| `relative_humidity`| `float` | **Yes** | `0.0` to `100.0` % | — |
| `wind_speed` | `float` | **Yes** | `>= 0.0` km/h or m/s | — |
| `wind_unit` | `str` | No | `"km/h"` or `"m/s"` | `"km/h"` |
| `solar_exposure` | `float` \| `str` | No | `0.0` to `1.0` OR `"shaded"`, `"partial"`, `"full_sun"` | `0.5` |
| `location` | `dict` | No | `{"name": str, "lat": float, "lon": float}` | `None` |
| `timestamp` | `str` | No | ISO 8601 formatted datetime string | `None` |

---

## 4. Output Contract (Standard Team Schema)

`risk_result.to_dict()` produces a complete dictionary adhering to the shared schema:

```json
{
  "risk": {
    "score": 69.3,
    "category": "High",
    "factors": [
      {
        "factor": "temperature",
        "impact": "high",
        "contribution": 46.2
      },
      {
        "factor": "solar_exposure",
        "impact": "low",
        "contribution": 10.0
      },
      {
        "factor": "humidity",
        "impact": "low",
        "contribution": 9.3
      },
      {
        "factor": "wind",
        "impact": "low",
        "contribution": 3.8
      }
    ],
    "explanation": "High environmental heat-exposure risk, mainly influenced by temperature."
  },
  "environment": {
    "temperature": 34.0,
    "temperature_unit": "C",
    "humidity": 65.0,
    "wind_speed": 12.0,
    "wind_unit": "km/h",
    "solar_exposure": 0.5
  },
  "location": {
    "name": "Chennai",
    "lat": 13.08,
    "lon": 80.27
  },
  "timestamp": "2026-09-27T14:00:00",
  "metadata": {
    "model": "rule_based_v1",
    "heat_index_method": "NWS-Rothfusz",
    "time_adjustment_applied": true,
    "location_adjustment_applied": false
  },
  "recommendations": [
    "Limit continuous direct sun exposure during peak afternoon hours.",
    "Schedule strenuous physical labor for cooler morning or evening periods.",
    "Ensure accessible shaded rest stations and adequate water intake."
  ],
  "disclaimer": "This score is an environmental heat-exposure risk indicator. It is not a medical diagnostic tool and does not predict individual medical outcomes."
}
```

---

## 5. Error Handling

When given invalid inputs, the engine raises `ValidationError` from `validators.py`. Person 3 should catch this:

```python
from heat_risk_engine import calculate_risk
from validators import ValidationError

try:
    result = calculate_risk(payload)
except ValidationError as e:
    # Return HTTP 422 to client with clear error reason
    return {"error": "InvalidEnvironmentalInput", "message": str(e)}, 422
except Exception as e:
    # Unhandled internal exception
    return {"error": "EngineError", "message": str(e)}, 500
```

---

## 6. What Person 3 Should NOT Modify

1. **Do NOT hard-code alternative scoring formulas** in the central backend. All scoring resides in `scoring.py`.
2. **Do NOT alter threshold categories in code**. Thresholds and weights are configured in `config/thresholds.json`.
3. **Do NOT remove the disclaimer**. The disclaimer is a mandatory legal and ethical requirement protecting the team against medical liability claims.
