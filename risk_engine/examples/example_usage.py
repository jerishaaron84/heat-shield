"""Example usage script for HeatShield Person 2 Heat-Risk Engine.

Demonstrates:
1. Basic calculation (Celsius, km/h, numeric solar)
2. Fahrenheit & m/s wind calculation
3. Categorical solar exposure ('full_sun')
4. Optional location and ISO timestamp calculation
5. Printing clean, formatted JSON output
"""

import json
import sys
from pathlib import Path

# Add project root to sys.path so example can be run directly
ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT_DIR))

from heat_risk_engine import calculate_risk


def main():
    print("=" * 70)
    print("HeatShield Person 2 Heat-Risk Engine - Examples")
    print("=" * 70)

    # 1. Basic calculation
    print("\n1. Basic Environmental Heat-Risk Calculation (Chennai Afternoon):")
    basic_input = {
        "temperature": 35.0,
        "temperature_unit": "C",
        "relative_humidity": 70,
        "wind_speed": 10,
        "wind_unit": "km/h",
        "solar_exposure": 0.8
    }
    result_basic = calculate_risk(basic_input)
    print(f"Risk Score : {result_basic.risk.score}/100")
    print(f"Category   : {result_basic.risk.category}")
    print(f"Explanation: {result_basic.risk.explanation}")
    print("Ranked Factors:")
    for f in result_basic.risk.factors:
        print(f"  - {f.factor:15}: {f.contribution:4.1f} ({f.impact} impact)")

    # 2. Fahrenheit & m/s wind input
    print("\n2. Calculation with Fahrenheit and m/s Wind Speed:")
    f_input = {
        "temperature": 95.0,
        "temperature_unit": "F",
        "relative_humidity": 65,
        "wind_speed": 3.0,
        "wind_unit": "m/s",
        "solar_exposure": 0.6
    }
    result_f = calculate_risk(f_input)
    print(f"Risk Score : {result_f.risk.score}/100")
    print(f"Category   : {result_f.risk.category}")
    print(f"Environment: {result_f.environment.temperature}°{result_f.environment.temperature_unit}, "
          f"Wind {result_f.environment.wind_speed} {result_f.environment.wind_unit}")

    # 3. Categorical solar exposure ('full_sun')
    print("\n3. Calculation using Categorical Solar Exposure ('full_sun'):")
    solar_cat_input = {
        "temperature": 38.0,
        "temperature_unit": "C",
        "relative_humidity": 50,
        "wind_speed": 8,
        "wind_unit": "km/h",
        "solar_exposure": "full_sun"
    }
    result_cat = calculate_risk(solar_cat_input)
    print(f"Risk Score : {result_cat.risk.score}/100")
    print(f"Category   : {result_cat.risk.category}")
    print(f"Explanation: {result_cat.risk.explanation}")

    # 4. Complete payload with optional location and timestamp
    print("\n4. Full Payload with Location and Peak-Hour Timestamp:")
    full_input = {
        "temperature": 36.5,
        "temperature_unit": "C",
        "relative_humidity": 68,
        "wind_speed": 7,
        "wind_unit": "km/h",
        "solar_exposure": 0.9,
        "location": {
            "name": "Chennai Marina",
            "lat": 13.0475,
            "lon": 80.2824
        },
        "timestamp": "2026-09-27T14:30:00+05:30"
    }
    result_full = calculate_risk(full_input)

    # 5. Output JSON Serialization (what Person 3 consumes)
    print("\n5. Serialized JSON Output Contract:")
    json_output = json.dumps(result_full.to_dict(), indent=2)
    print(json_output)


if __name__ == "__main__":
    main()
