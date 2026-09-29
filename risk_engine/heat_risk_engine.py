"""HeatShield Person 2 Heat-Risk Engine.

Public facade and entry point for risk calculation.
Exposes a clean, stable interface for Person 3 Backend integration:

    from heat_risk_engine import calculate_risk

    result = calculate_risk({
        "temperature": 35.0,
        "temperature_unit": "C",
        "relative_humidity": 70,
        "wind_speed": 10,
        "wind_unit": "km/h",
        "solar_exposure": 0.8
    })

DISCLAIMER:
This system is strictly an ENVIRONMENTAL HEAT-EXPOSURE RISK INDICATOR.
It does NOT diagnose medical conditions, predict hospitalization, mortality,
or individual health outcomes.
"""

import json
from pathlib import Path
from typing import Dict, Any, Optional

from models import RiskResult
from validators import validate_and_normalize_inputs, ValidationError
from scoring import RiskModel, RuleBasedRiskModel

# Default configuration path
DEFAULT_CONFIG_PATH = Path(__file__).resolve().parent / "config" / "thresholds.json"

_cached_config: Optional[Dict[str, Any]] = None


def load_config(config_path: Optional[Path] = None) -> Dict[str, Any]:
    """Safely load engine scoring configuration from thresholds.json.

    Raises:
        RuntimeError: If configuration file is missing, unreadable, or invalid JSON.
    """
    global _cached_config
    target_path = config_path or DEFAULT_CONFIG_PATH

    if not target_path.exists():
        raise RuntimeError(
            f"HeatShield Risk Engine configuration file not found at: {target_path}. "
            "Please ensure config/thresholds.json exists and is accessible."
        )

    try:
        with open(target_path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except json.JSONDecodeError as exc:
        raise RuntimeError(
            f"HeatShield Risk Engine configuration file contains invalid JSON: {exc}"
        ) from exc
    except Exception as exc:
        raise RuntimeError(
            f"Failed to read HeatShield Risk Engine configuration: {exc}"
        ) from exc

    # Basic structural check
    required_keys = ["score_categories", "weights", "solar_mapping"]
    for key in required_keys:
        if key not in data:
            raise RuntimeError(
                f"Invalid configuration: Missing mandatory section '{key}' in {target_path}"
            )

    _cached_config = data
    return data


def calculate_risk(
    inputs: Dict[str, Any],
    config_path: Optional[Path] = None,
    model: Optional[RiskModel] = None
) -> RiskResult:
    """Calculate normalized heat-risk result from environmental inputs.

    Parameters:
        inputs: Dictionary containing environmental data:
            - temperature (float, required)
            - relative_humidity (float, required, 0-100)
            - wind_speed (float, required, >= 0)
            - solar_exposure (float or str, optional, 0.0-1.0 or 'shaded'|'partial'|'full_sun')
            - temperature_unit (str, optional, 'C' or 'F', default 'C')
            - wind_unit (str, optional, 'km/h' or 'm/s', default 'km/h')
            - location (dict, optional: {"name": ..., "lat": ..., "lon": ...})
            - timestamp (str, optional ISO timestamp)
        config_path: Path to custom thresholds.json (optional)
        model: Custom RiskModel implementation (e.g. RuleBasedRiskModel or FutureMLRiskModel).
               Defaults to RuleBasedRiskModel.

    Returns:
        RiskResult: Typed dataclass representing the standardized heat-risk response.
                    Call `.to_dict()` on the result for a JSON-serializable Python dict.

    Raises:
        ValidationError: If input values violate physical bounds or format expectations.
        RuntimeError: If configuration cannot be loaded.
    """
    config = load_config(config_path)

    solar_mapping = config.get("solar_mapping", {"shaded": 0.0, "partial": 0.5, "full_sun": 1.0})
    solar_default = config.get("solar_default", 0.5)

    # 1. Validate and normalize inputs
    normalized_inputs = validate_and_normalize_inputs(
        data=inputs,
        solar_mapping=solar_mapping,
        solar_default=solar_default
    )

    # 2. Select scoring model (Pluggable: Defaults to RuleBasedRiskModel)
    active_model = model or RuleBasedRiskModel()

    # 3. Compute score and construct RiskResult
    result = active_model.calculate(inputs=normalized_inputs, config=config)

    return result
