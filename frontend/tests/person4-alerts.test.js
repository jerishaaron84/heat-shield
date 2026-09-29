import assert from 'node:assert/strict'
import {
  evaluateAlert,
  normalizeRiskCategory,
} from '../src/person4/alertEngine.js'
import { adaptRiskEngineResponse } from '../src/person4/riskEngineAdapter.js'

assert.equal(normalizeRiskCategory('Danger'), 'High')
assert.equal(normalizeRiskCategory('Extreme Danger'), 'Extreme')
assert.equal(normalizeRiskCategory('High'), 'High')
assert.equal(normalizeRiskCategory('Moderate'), 'Moderate')

const normal = evaluateAlert({
  heatCategory: 'Below Caution',
  heatIndex: 25,
  shortName: 'Chennai',
})
assert.equal(normal.active, false)
assert.equal(normal.severity, 'normal')

const high = evaluateAlert({
  heatCategory: 'Danger',
  heatIndex: 42,
  shortName: 'Chennai',
})
assert.equal(high.active, true)
assert.equal(high.severity, 'high')
assert.match(high.message, /Chennai/)

const extreme = evaluateAlert({
  riskScore: 80,
  category: 'Extreme',
  shortName: 'Chennai',
})
assert.equal(extreme.active, true)
assert.equal(extreme.severity, 'extreme')

const invalid = evaluateAlert({
  heatCategory: 'Moderate',
  heatIndex: 'not-a-number',
})
assert.equal(invalid.severity, 'moderate')

console.log('Person 4 alert tests: PASS')


const adapted = adaptRiskEngineResponse({
  location: { name: 'Chennai', lat: 13.08, lon: 80.27 },
  environment: { temperature: 39, humidity: 70, wind_speed: 8, solar_exposure: 8 },
  risk: { score: 82, category: 'Extreme', factors: ['temperature'], explanation: 'High heat conditions' },
  recommendations: ['Stay hydrated'],
  timestamp: '2026-09-27T10:00:00Z',
})
assert.equal(adapted.shortName, 'Chennai')
assert.equal(adapted.riskScore, 82)
assert.equal(adapted.heatCategory, 'Extreme')
assert.equal(adapted.recommendations[0], 'Stay hydrated')
assert.equal(evaluateAlert(adapted).severity, 'extreme')

console.log('Person 4 adapter test: PASS')
