"""
HeatShield Backend Configuration
---------------------------------
All configurable values are loaded from environment variables (via .env).
No secrets are hard-coded here.
"""

import os
from dotenv import load_dotenv

load_dotenv()

# -------------------------------------------------------------------
# Open-Meteo API (no API key required)
# -------------------------------------------------------------------
OPEN_METEO_BASE_URL: str = os.getenv(
    "OPEN_METEO_BASE_URL", "https://api.open-meteo.com/v1/forecast"
)
# -------------------------------------------------------------------
# Open-Meteo Geocoding (no API key required)
# -------------------------------------------------------------------
GEOCODING_BASE_URL: str = os.getenv(
    "GEOCODING_BASE_URL", "https://geocoding-api.open-meteo.com/v1/search"
)

# -------------------------------------------------------------------
# HTTP / request settings
# -------------------------------------------------------------------
REQUEST_TIMEOUT_SECONDS: int = int(os.getenv("REQUEST_TIMEOUT_SECONDS", "10"))

# -------------------------------------------------------------------
# In-memory cache settings
# -------------------------------------------------------------------
# How many seconds a cached weather response is considered fresh
CACHE_TTL_SECONDS: int = int(os.getenv("CACHE_TTL_SECONDS", "300"))   # 5 minutes

# -------------------------------------------------------------------
# CORS
# -------------------------------------------------------------------
CORS_ORIGINS: list[str] = os.getenv(
    "CORS_ORIGINS",
    "http://localhost:3000,http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173,http://localhost:8080,http://127.0.0.1:3000",
).split(",")

# -------------------------------------------------------------------
# Application metadata
# -------------------------------------------------------------------
APP_TITLE: str = "HeatShield API"
APP_VERSION: str = "1.0.0"
APP_DESCRIPTION: str = (
    "Live heat-risk backend for HeatShield. "
    "Weather data powered by Open-Meteo (open-meteo.com)."
)

DATA_SOURCE: str = "Open-Meteo"
