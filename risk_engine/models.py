"""Data models for HeatShield Person 2 Heat-Risk Engine.

Defines typed dataclasses for input data, scoring factors, and the final output
RiskResult contract. Ensures 100% JSON-serializable outputs.

DISCLAIMER:
This system is strictly an ENVIRONMENTAL HEAT-EXPOSURE RISK INDICATOR.
It does NOT diagnose medical conditions, predict hospitalization, mortality,
or individual health outcomes.
"""

from dataclasses import dataclass, asdict, field
from typing import List, Optional, Dict, Any


@dataclass
class LocationData:
    """Optional geographic location context metadata."""
    name: Optional[str] = None
    lat: Optional[float] = None
    lon: Optional[float] = None


@dataclass
class EnvironmentalInputs:
    """Validated and normalized environmental parameters."""
    temperature: float
    temperature_unit: str
    relative_humidity: float
    wind_speed: float
    wind_unit: str
    solar_exposure: Optional[float] = None
    solar_exposure_raw: Optional[Any] = None
    location: Optional[LocationData] = None
    timestamp: Optional[str] = None


@dataclass
class ContributingFactor:
    """Relative contribution of an individual environmental factor."""
    factor: str
    impact: str  # "low", "moderate", "high"
    contribution: float  # Numerical contribution percentage or magnitude


@dataclass
class RiskSummary:
    """Risk scoring summary segment."""
    score: float
    category: str
    factors: List[ContributingFactor]
    explanation: str


@dataclass
class EnvironmentSummary:
    """Clean environmental values matching the required output contract."""
    temperature: float
    temperature_unit: str
    humidity: float
    wind_speed: float
    wind_unit: str
    solar_exposure: Optional[float] = None


@dataclass
class EngineMetadata:
    """Processing metadata and flags."""
    model: str = "rule_based_v1"
    heat_index_method: str = "NWS-style"
    time_adjustment_applied: bool = False
    location_adjustment_applied: bool = False


@dataclass
class RiskResult:
    """Top-level stable JSON-compatible output contract.

    Person 3 Backend can directly consume the `risk` block or the entire result.
    """
    risk: RiskSummary
    environment: EnvironmentSummary
    location: Optional[Dict[str, Any]]
    timestamp: Optional[str]
    metadata: EngineMetadata
    disclaimer: str
    recommendations: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        """Convert result cleanly into a standard Python dictionary."""
        result = asdict(self)
        # Ensure contributing factor objects inside risk are properly converted
        return result
