"""Heat-risk scoring algorithms and models for HeatShield.

Implements:
1. NWS/NOAA Heat Index calculation with documented fallbacks (Rothfusz equation)
2. Environmental component sub-scores:
   - Heat Index baseline (0-100)
   - Humidity contribution (0-100)
   - Wind exposure adjustment (cooling relief vs stagnant air penalty)
   - Solar radiation exposure adjustment (shaded vs full sun)
   - Configurable optional time-of-day adjustment
3. Pluggable RiskModel interface to allow seamless transition to Future ML models.
"""

from abc import ABC, abstractmethod
from datetime import datetime
import math
from typing import Dict, Any, List, Tuple, Optional

from models import (
    EnvironmentalInputs,
    RiskResult,
    RiskSummary,
    EnvironmentSummary,
    ContributingFactor,
    EngineMetadata,
)
from explanations import generate_explanation


def compute_nws_heat_index(temp_c: float, humidity: float) -> Tuple[float, str]:
    """Compute NOAA / National Weather Service Heat Index in Celsius.

    Reference:
    NOAA National Weather Service Heat Index equation (Rothfusz regression).
    Applicability:
    Strict NWS equation is valid for Temperatures >= 80°F (~26.67°C) and RH >= 40%.
    Outside this domain, a documented fallback is used:
    - If temp_c < 20°C: environmental heat index is equivalent to ambient dry-bulb temperature.
    - If between 20°C and 26.67°C or RH < 40%: simplified Steadman formula approximation.

    Returns:
        (heat_index_c, method_applied_description)
    """
    # Convert to Fahrenheit for standard NWS formula
    temp_f = (temp_c * 9.0 / 5.0) + 32.0

    if temp_f < 68.0:
        # Below 20°C: Ambient temperature is the primary heat metric (no significant heat index distress)
        return temp_c, "Ambient (Cool/Moderate)"

    if temp_f < 80.0 or humidity < 40.0:
        # Simplified Steadman formula
        hi_simple_f = 0.5 * (temp_f + 61.0 + ((temp_f - 68.0) * 1.2) + (humidity * 0.094))
        # If simple heat index averages >= 80°F, Rothfusz may still be applied
        if hi_simple_f < 80.0:
            hi_c = (hi_simple_f - 32.0) * (5.0 / 9.0)
            return hi_c, "Steadman-simple"

    # Full Rothfusz regression equation
    # HI = c1 + c2*T + c3*R + c4*T*R + c5*T^2 + c6*R^2 + c7*T^2*R + c8*T*R^2 + c9*T^2*R^2
    t = temp_f
    r = humidity

    c1 = -42.379
    c2 = 2.04901523
    c3 = 10.14333127
    c4 = -0.22475541
    c5 = -0.00683783
    c6 = -0.05481717
    c7 = 0.00122874
    c8 = 0.00085282
    c9 = -0.00000199

    hi_f = (c1 + (c2 * t) + (c3 * r) + (c4 * t * r) +
            (c5 * (t ** 2)) + (c6 * (r ** 2)) +
            (c7 * (t ** 2) * r) + (c8 * t * (r ** 2)) +
            (c9 * (t ** 2) * (r ** 2)))

    # NWS Adjustments:
    # 1. Low humidity adjustment if RH < 13% and 80 <= T <= 112
    if r < 13.0 and 80.0 <= t <= 112.0:
        adjustment = ((13.0 - r) / 4.0) * math.sqrt((17.0 - abs(t - 95.0)) / 17.0)
        hi_f -= adjustment
    # 2. High humidity adjustment if RH > 85% and 80 <= T <= 87
    elif r > 85.0 and 80.0 <= t <= 87.0:
        adjustment = ((r - 85.0) / 10.0) * ((87.0 - t) / 5.0)
        hi_f += adjustment

    hi_c = (hi_f - 32.0) * (5.0 / 9.0)
    return hi_c, "NWS-Rothfusz"


class RiskModel(ABC):
    """Abstract Base Class for HeatShield Risk Models.

    Enables pluggable architecture: A future machine-learning model (e.g. FutureMLRiskModel)
    can implement `calculate()` without altering the public engine interface or output contract.
    """

    @abstractmethod
    def calculate(self, inputs: EnvironmentalInputs, config: Dict[str, Any]) -> RiskResult:
        """Calculate heat-risk score and return standardized RiskResult."""
        pass


class RuleBasedRiskModel(RiskModel):
    """Transparent, deterministic rule-based heat-risk calculation engine."""

    def calculate(self, inputs: EnvironmentalInputs, config: Dict[str, Any]) -> RiskResult:
        temp_c = inputs.temperature
        humidity = inputs.relative_humidity
        wind_kmh = inputs.wind_speed

        # 1. Heat Index Calculation
        heat_index_c, hi_method = compute_nws_heat_index(temp_c, humidity)

        # Baseline Heat Index score normalized to 0-100 range
        # 15°C -> 0 score; 50°C -> 100 score
        hi_params = config.get("heat_index_parameters", {})
        min_ref = hi_params.get("min_reference_c", 15.0)
        max_ref = hi_params.get("max_reference_c", 50.0)

        raw_hi_norm = ((heat_index_c - min_ref) / (max_ref - min_ref)) * 100.0
        hi_score = max(0.0, min(100.0, raw_hi_norm))

        # 2. Humidity component (scaled to 0-100)
        # Humidity exerts higher heat stress when ambient temperature is elevated
        humidity_factor_scale = min(1.0, max(0.2, (temp_c - 15.0) / 20.0))
        humidity_score = (humidity / 100.0) * 100.0 * humidity_factor_scale

        # 3. Wind exposure adjustment
        # Calm/stagnant air increases heat accumulation; breezes afford modest environmental cooling relief.
        wind_cfg = config.get("wind_adjustment", {})
        calm_thresh = wind_cfg.get("calm_threshold_kmh", 5.0)
        mod_thresh = wind_cfg.get("moderate_threshold_kmh", 20.0)
        stagnant_penalty = wind_cfg.get("stagnant_penalty", 15.0)
        breeze_relief = wind_cfg.get("breeze_relief_max", 25.0)

        if wind_kmh <= calm_thresh:
            # Low wind = higher heat distress burden
            ratio = (calm_thresh - wind_kmh) / max(1.0, calm_thresh)
            wind_score = 50.0 + (ratio * stagnant_penalty)
        elif wind_kmh >= mod_thresh:
            # Wind provides modest relief up to moderate limits
            wind_score = max(0.0, 50.0 - breeze_relief)
        else:
            # Linear transition between calm and moderate breeze
            fraction = (wind_kmh - calm_thresh) / (mod_thresh - calm_thresh)
            wind_score = 50.0 - (fraction * breeze_relief)

        # 4. Solar exposure component
        solar_mapping = config.get("solar_mapping", {"shaded": 0.0, "partial": 0.5, "full_sun": 1.0})
        solar_default = config.get("solar_default", 0.5)

        solar_is_missing = inputs.solar_exposure is None
        solar_val = inputs.solar_exposure if not solar_is_missing else solar_default
        solar_score = float(solar_val) * 100.0

        # 5. Configured Weights
        weights = config.get("weights", {
            "heat_index": 0.55,
            "humidity": 0.15,
            "wind": 0.10,
            "solar": 0.20
        })

        w_hi = weights.get("heat_index", 0.55)
        w_rh = weights.get("humidity", 0.15)
        w_wind = weights.get("wind", 0.10)
        w_solar = weights.get("solar", 0.20)

        # Compute combined weighted score (0-100)
        weighted_score = (
            (hi_score * w_hi) +
            (humidity_score * w_rh) +
            (wind_score * w_wind) +
            (solar_score * w_solar)
        )

        # 6. Optional Time Adjustment
        time_adjustment_applied = False
        time_cfg = config.get("time_adjustment", {})
        if time_cfg.get("enabled", True) and inputs.timestamp:
            try:
                # Parse timestamp (supports ISO format)
                dt = datetime.fromisoformat(inputs.timestamp)
                hour = dt.hour

                peak_start = time_cfg.get("peak_start_hour", 11)
                peak_end = time_cfg.get("peak_end_hour", 16)
                peak_mult = time_cfg.get("peak_multiplier", 1.08)

                night_start = time_cfg.get("night_start_hour", 20)
                night_end = time_cfg.get("night_end_hour", 6)
                night_mult = time_cfg.get("night_multiplier", 0.92)

                if peak_start <= hour <= peak_end:
                    weighted_score *= peak_mult
                    time_adjustment_applied = True
                elif hour >= night_start or hour < night_end:
                    weighted_score *= night_mult
                    time_adjustment_applied = True
                else:
                    time_adjustment_applied = True  # Neutral daytime window
            except (ValueError, TypeError):
                # Ignore timestamp parsing issues gracefully
                time_adjustment_applied = False

        # Strictly clamp final score to 0.0 - 100.0
        final_score = round(max(0.0, min(100.0, weighted_score)), 1)

        # 7. Categorization from config
        score_categories = config.get("score_categories", {})
        matched_category = "Moderate"
        for cat_key, cat_data in score_categories.items():
            if cat_data["min"] <= final_score <= cat_data["max"]:
                matched_category = cat_data.get("name", cat_key.capitalize())
                break

        # 8. Factor Contribution Breakdown & Ranking
        # Calculate raw contribution values of each factor to the final composite score
        c_temp = round(hi_score * w_hi, 1)
        c_humidity = round(humidity_score * w_rh, 1)
        c_solar = round(solar_score * w_solar, 1)
        c_wind = round(wind_score * w_wind, 1)

        factors_raw = [
            ("temperature", c_temp),
            ("humidity", c_humidity),
            ("solar_exposure", c_solar),
            ("wind", c_wind)
        ]
        # Sort descending by contribution
        factors_raw.sort(key=lambda x: x[1], reverse=True)

        ranked_factors: List[ContributingFactor] = []
        for factor_name, contrib in factors_raw:
            if contrib >= 25.0:
                impact = "high"
            elif contrib >= 12.0:
                impact = "moderate"
            else:
                impact = "low"
            ranked_factors.append(ContributingFactor(
                factor=factor_name,
                impact=impact,
                contribution=contrib
            ))

        # 9. Explanation Generation
        explanation = generate_explanation(
            category=matched_category,
            ranked_factors=ranked_factors,
            solar_is_missing=solar_is_missing,
            timestamp_applied=time_adjustment_applied,
            temp_c=temp_c,
            humidity=humidity
        )

        # 10. Assemble Contract Structures
        # Reconstruct original requested environment structure
        # If user supplied Fahrenheit or m/s, present back the original unit & magnitude
        orig_temp = round((temp_c * 9.0 / 5.0) + 32.0, 1) if inputs.temperature_unit == "F" else round(temp_c, 1)
        orig_wind = round(inputs.wind_speed / 3.6, 1) if inputs.wind_unit == "m/s" else round(inputs.wind_speed, 1)

        location_dict = None
        if inputs.location:
            location_dict = {
                "name": inputs.location.name,
                "lat": inputs.location.lat,
                "lon": inputs.location.lon
            }

        disclaimer_text = config.get(
            "disclaimer",
            "This score is an environmental heat-exposure risk indicator. "
            "It is not a medical diagnostic tool and does not predict individual medical outcomes."
        )

        return RiskResult(
            risk=RiskSummary(
                score=final_score,
                category=matched_category,
                factors=ranked_factors,
                explanation=explanation
            ),
            environment=EnvironmentSummary(
                temperature=orig_temp,
                temperature_unit=inputs.temperature_unit,
                humidity=round(humidity, 1),
                wind_speed=orig_wind,
                wind_unit=inputs.wind_unit,
                solar_exposure=inputs.solar_exposure
            ),
            location=location_dict,
            timestamp=inputs.timestamp,
            metadata=EngineMetadata(
                model="rule_based_v1",
                heat_index_method=hi_method,
                time_adjustment_applied=time_adjustment_applied,
                location_adjustment_applied=False
            ),
            disclaimer=disclaimer_text,
            recommendations=config.get("recommendations", {}).get(matched_category.lower(), [])
        )
