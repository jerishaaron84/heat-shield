import { evaluateAlert } from '../src/person4/alertEngine.js'

const scenarios = [
  {
    name: 'Normal condition',
    data: { heatCategory: 'Below Caution', heatIndex: 25, shortName: 'Chennai' },
  },
  {
    name: 'Moderate condition',
    data: { category: 'Moderate', heatIndex: 34, shortName: 'Chennai' },
  },
  {
    name: 'High-risk condition',
    data: { riskScore: 65, category: 'High', heatIndex: 43, shortName: 'Chennai' },
  },
  {
    name: 'Extreme-risk condition',
    data: { riskScore: 85, category: 'Extreme', heatIndex: 52, shortName: 'Chennai' },
  },
]

console.log('\n=== HEATSHIELD — PERSON 4 ALERT DEMO ===\n')

for (const scenario of scenarios) {
  const alert = evaluateAlert(scenario.data)
  const icon = alert.severity === 'extreme' ? '‼' : alert.severity === 'high' ? '⚠' : alert.severity === 'moderate' ? '△' : '✓'

  console.log(`--- ${scenario.name} ---`)
  console.log(`${icon} ${alert.title}`)
  console.log(`Severity: ${alert.severity}`)
  console.log(`Location: ${alert.location}`)
  console.log(`Message: ${alert.message}`)
  if (alert.recommendations.length) {
    console.log(`Recommendation: ${alert.recommendations[0]}`)
  }
  console.log('')
}

console.log('Person 4 contribution demonstrated: threshold detection + warning + location + safety recommendation.')
