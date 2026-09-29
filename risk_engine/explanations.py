"""Dynamic natural language explanation generator for HeatShield Risk Engine.

Translates numeric contributions and environmental factors into a clear,
concise, human-readable narrative.

SAFETY LIMITATION:
No medical claims (e.g. diagnoses, mortality, hospitalization) are generated.
Focuses strictly on environmental heat exposure factors.
"""

from typing import List, TYPE_CHECKING

if TYPE_CHECKING:
    from models import ContributingFactor


def generate_explanation(
    category: str,
    ranked_factors: List["ContributingFactor"],
    solar_is_missing: bool = False,
    timestamp_applied: bool = False,
    temp_c: float = 30.0,
    humidity: float = 50.0
) -> str:
    """Generate a dynamic human-readable explanation based on primary risk factors."""
    category_lower = category.lower()

    # Identify primary and secondary drivers (factors with non-trivial contributions)
    top_drivers = [f.factor.replace("_", " ") for f in ranked_factors if f.impact in ("high", "moderate")]
    if not top_drivers and ranked_factors:
        top_drivers = [ranked_factors[0].factor.replace("_", " ")]

    if len(top_drivers) == 1:
        drivers_text = top_drivers[0]
    elif len(top_drivers) == 2:
        drivers_text = f"{top_drivers[0]} and {top_drivers[1]}"
    else:
        drivers_text = f"{top_drivers[0]}, {top_drivers[1]}, and {top_drivers[2]}"

    # Lead sentence based on environmental category
    if category_lower == "low":
        lead = "Environmental heat-exposure risk is currently low under the supplied conditions."
    elif category_lower == "moderate":
        lead = f"Moderate environmental heat-exposure risk, mainly influenced by {drivers_text}."
    elif category_lower == "high":
        lead = f"High environmental heat-exposure risk, mainly influenced by {drivers_text}."
    else:  # extreme
        lead = f"Extreme environmental heat-exposure indicator, driven primarily by severe {drivers_text}."

    # Additional contextual details
    notes = []
    if solar_is_missing:
        notes.append("Solar radiation data was unavailable; a default neutral baseline was assumed.")

    if timestamp_applied:
        notes.append("A time-of-day weighting was applied.")

    if notes:
        lead += " " + " ".join(notes)

    return lead
