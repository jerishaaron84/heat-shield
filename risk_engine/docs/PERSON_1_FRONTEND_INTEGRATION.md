# Person 1 Frontend Integration Guide — HeatShield Heat-Risk Engine

**Owner**: Person 2 (AI / Heat-Risk Engine)  
**Target Consumer**: Person 1 (Frontend / UI Team)

---

## 1. Overview

Person 1 is responsible for the final HeatShield portal, citizen dashboard, and mobile interface.  
Person 2 delivers the standardized JSON risk data structure through Person 3's backend.

Person 1 **does NOT need to compute heat index or risk scores in JavaScript**. All values are pre-computed, normalized (0–100), and dynamically explained by Person 2's Python engine.

---

## 2. Key Response Fields to Render

When calling Person 3's endpoint (or Person 2's development endpoint `POST /api/risk`), render the following components:

### A. The Hero Metric
- `risk.score` (`float`): Continuous score between `0.0` and `100.0`. Ideal for a radial gauge or progress bar.
- `risk.category` (`str`): `"Low"`, `"Moderate"`, `"High"`, or `"Extreme"`.

**Recommended Theme Palette**:
| Category | Score Range | Color Token | Suggested Hex |
| :--- | :--- | :--- | :--- |
| **Low** | `0.0 – 24.99` | Emerald Green | `#10b981` |
| **Moderate** | `25.0 – 49.99` | Amber / Yellow | `#f59e0b` |
| **High** | `50.0 – 74.99` | Orange | `#f97316` |
| **Extreme** | `75.0 – 100.0` | Crimson Red | `#ef4444` |

---

### B. Ranked Contributing Factors (`risk.factors`)
Array of environmental factors sorted in **descending order of impact**:
```json
[
  { "factor": "temperature", "impact": "high", "contribution": 46.2 },
  { "factor": "solar_exposure", "impact": "low", "contribution": 10.0 },
  { "factor": "humidity", "impact": "low", "contribution": 9.3 },
  { "factor": "wind", "impact": "low", "contribution": 3.8 }
]
```
- `factor`: Name (`temperature`, `humidity`, `wind`, `solar_exposure`).
- `impact`: `"high"`, `"moderate"`, or `"low"`.
- `contribution`: Relative points added to composite risk.

---

### C. Natural Language Narrative (`risk.explanation`)
Short, dynamically generated explanation based on the primary drivers:
> *"High environmental heat-exposure risk, mainly influenced by temperature."*

---

### D. Safety Recommendations (`recommendations`)
Configurable actionable steps derived from the category:
- *"Limit continuous direct sun exposure during peak afternoon hours."*
- *"Schedule strenuous physical labor for cooler morning or evening periods."*
- *"Ensure accessible shaded rest stations and adequate water intake."*

---

### E. Mandatory Disclaimer (`disclaimer`)
> *"This score is an environmental heat-exposure risk indicator. It is not a medical diagnostic tool and does not predict individual medical outcomes."*

*Note: Person 1 must display this text in the footer or info modal.*
