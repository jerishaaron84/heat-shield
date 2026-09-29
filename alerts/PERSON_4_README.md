# HeatShield — Person 4 Deliverable

## Person 4 scope
This ZIP contains **only Person 4 work** from the project plan:

- Threshold-based alert trigger
- High/extreme alert banner logic
- Optional browser notification helpers
- Location-specific warning
- Safety recommendations
- Risk-engine integration adapter
- Automated tests
- Basic security guidance

## Folder structure

```text
HeatShield_Person4_Alerts_Integration/
├── demo/
│   └── person4-demo.js
├── src/
│   └── person4/
│       ├── alertEngine.js
│       ├── Person4AlertBanner.jsx
│       └── riskEngineAdapter.js
├── tests/
│   └── person4-alerts.test.js
├── INTEGRATION.txt
├── package.json
└── PERSON_4_README.md
```

## Requirements

Install **Node.js 18 or newer**. No npm packages are required for the Person 4 tests/demo.

Check Node:

```bash
node --version
npm --version
```

## Run Person 4 tests

From this folder:

```bash
npm test
```

or:

```bash
npm run test:person4
```

Expected result:

```text
Person 4 alert tests: PASS
```

## Run the Person 4 demo

```bash
npm run demo
```

The demo exercises four conditions:

1. Normal — no high-risk alert
2. Moderate — heat advisory
3. High — high heat alert
4. Extreme — extreme heat alert

It also prints the selected location and a safety recommendation, so teammates can verify the Person 4 logic without needing the complete frontend/backend.

## Connecting to the main project

See `INTEGRATION.txt` for the exact integration points. The module does **not** replace Person 1's dashboard, Person 2's risk engine, or Person 3's backend.

`riskEngineAdapter.js` accepts the shared risk response and converts it to the shape expected by the Person 4 alert layer.

## Security checks

- No API keys or credentials are included.
- Browser notification permission is requested only after a user action.
- Alert content is rendered as React text, not raw HTML.
- The risk adapter does not execute external code.
- Secrets should remain in environment variables when the full application is deployed.

## Important

This is the **Person 4 module**, not the complete HeatShield application. The final team project should combine this module with Persons 1–3.
