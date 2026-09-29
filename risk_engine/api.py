"""FastAPI Development and Testing Wrapper for HeatShield Person 2 Risk Engine.

NOTE:
This is a lightweight development/testing tool for Person 2.
It is NOT the main HeatShield production backend (owned by Person 3).
It exists so Person 2 can independently test the engine via HTTP and OpenAPI (/docs).

Endpoints:
- GET  /api/health : Health check
- POST /api/risk   : Calculate heat risk score
- POST /api/risk/batch : Same calculation for several snapshots (forecast hours)
"""

import os
from typing import List, Optional, Dict, Any, Union
from fastapi import FastAPI, HTTPException, status
from pathlib import Path
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from heat_risk_engine import calculate_risk
from validators import ValidationError

app = FastAPI(
    title="HeatShield Risk Engine (Person 2 Component)",
    description=(
        "Development and testing API wrapper for Person 2's Heat-Risk Engine. "
        "Strictly provides an environmental heat-exposure risk indicator; "
        "not a medical diagnostic tool."
    ),
    version="1.0.0"
)

INDEX_HTML_PATH = Path(__file__).resolve().parent / "index.html"


@app.get("/", tags=["Web Console"], response_class=FileResponse)
def serve_web_console():
    """Interactive visual console for evaluating and testing the Heat-Risk Engine."""
    if INDEX_HTML_PATH.exists():
        return FileResponse(INDEX_HTML_PATH)
    return {"message": "HeatShield Person 2 Risk Engine API. Visit /docs for OpenAPI specifications."}

# CORS: configurable via CORS_ALLOW_ORIGINS (comma separated). Defaults to the local
# Vite dev/preview origins. In normal dev the frontend uses the Vite proxy (/api -> this
# server), so CORS is not even exercised; it is here for direct cross-origin access.
_DEFAULT_ORIGINS = (
    "http://localhost:5173,http://127.0.0.1:5173,"
    "http://localhost:4173,http://127.0.0.1:4173"
)
ALLOWED_ORIGINS = [
    o.strip()
    for o in os.getenv("CORS_ALLOW_ORIGINS", _DEFAULT_ORIGINS).split(",")
    if o.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


class LocationSchema(BaseModel):
    name: Optional[str] = Field(None, example="Chennai")
    lat: Optional[float] = Field(None, example=13.0827)
    lon: Optional[float] = Field(None, example=80.2707)


class RiskRequestSchema(BaseModel):
    temperature: float = Field(..., description="Ambient temperature", example=35.0)
    temperature_unit: Optional[str] = Field("C", description="'C' or 'F'", example="C")
    relative_humidity: float = Field(..., description="Relative humidity (0-100%)", example=70.0)
    wind_speed: float = Field(..., description="Wind speed", example=10.0)
    wind_unit: Optional[str] = Field("km/h", description="'km/h' or 'm/s'", example="km/h")
    solar_exposure: Optional[Union[float, str]] = Field(
        None,
        description="0.0 to 1.0 or 'shaded'|'partial'|'full_sun'",
        example=0.8
    )
    location: Optional[LocationSchema] = None
    timestamp: Optional[str] = Field(None, example="2026-09-27T14:30:00+05:30")


@app.get("/api/health", tags=["Health"])
def health_check():
    """Health check endpoint confirming engine readiness."""
    return {
        "status": "healthy",
        "component": "Person 2 - HeatShield Risk Engine",
        "version": "1.0.0"
    }


@app.post("/api/risk", tags=["Risk Calculation"])
def get_risk(payload: RiskRequestSchema):
    """Calculate heat-risk score and contributing factors from environmental inputs."""
    data = payload.model_dump(exclude_unset=True)

    try:
        result = calculate_risk(data)
        return result.to_dict()
    except ValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"error": "ValidationError", "message": str(exc)}
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error": "EngineError", "message": str(exc)}
        )


class RiskBatchSchema(BaseModel):
    items: List[RiskRequestSchema] = Field(..., min_length=1, max_length=48)


@app.post("/api/risk/batch", tags=["Risk Calculation"])
def get_risk_batch(payload: RiskBatchSchema):
    """Calculate risk for several environmental snapshots (e.g. current + forecast hours).

    Each item goes through exactly the same `calculate_risk()` as POST /api/risk.
    Results are returned in input order. If any item is invalid the whole request
    fails with 422 and reports the index of the offending item.
    """
    results = []
    for index, item in enumerate(payload.items):
        data = item.model_dump(exclude_unset=True)
        try:
            results.append(calculate_risk(data).to_dict())
        except ValidationError as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={"error": "ValidationError", "message": f"items[{index}]: {exc}"}
            )
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail={"error": "EngineError", "message": str(exc)}
            )
    return {"results": results}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "api:app",
        host=os.getenv("RISK_API_HOST", "127.0.0.1"),
        port=int(os.getenv("RISK_API_PORT", "8001")),
        reload=True,
    )
