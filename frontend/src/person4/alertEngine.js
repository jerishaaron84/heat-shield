/**
 * HeatShield — Person 4 Alert Engine
 * Owner: Alerts / Integration / Testing
 *
 * Keeps alert policy separate from UI code. Supports both:
 *  - Person 1/2 frontend NWS-style categories
 *  - Person 2 risk-engine categories (Low/Moderate/High/Extreme)
 */

export const DEFAULT_ALERT_THRESHOLDS = Object.freeze({
  highScore: 50,
  extremeScore: 75,
  highHeatIndexC: 39.4, // 103°F
  extremeHeatIndexC: 51.7, // 125°F
})

const HIGH_CATEGORIES = new Set([
  'High',
  'Danger',
  'Extreme Danger',
])

const EXTREME_CATEGORIES = new Set([
  'Extreme',
  'Extreme Danger',
])

const MODERATE_CATEGORIES = new Set([
  'Moderate',
  'Caution',
  'Extreme Caution',
])

function finite(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

export function normalizeRiskCategory(category = '') {
  const value = String(category).trim().toLowerCase()

  if (value === 'extreme' || value === 'extreme danger') return 'Extreme'
  if (value === 'high' || value === 'danger') return 'High'
  if (value === 'moderate' || value === 'extreme caution' || value === 'caution') return 'Moderate'
  return 'Low'
}

export function evaluateAlert(weather, thresholds = DEFAULT_ALERT_THRESHOLDS) {
  if (!weather) {
    return {
      active: false,
      severity: 'normal',
      category: 'Low',
      title: 'No current heat alert',
      message: 'Waiting for environmental data.',
      location: 'Selected location',
      recommendations: [],
    }
  }

  const category = normalizeRiskCategory(weather.heatCategory ?? weather.category)
  const score = finite(weather.riskScore ?? weather.score)
  const heatIndex = finite(weather.heatIndex)

  let severity = 'normal'

  if (
    category === 'Extreme' ||
    (score !== null && score >= thresholds.extremeScore) ||
    (heatIndex !== null && heatIndex >= thresholds.extremeHeatIndexC)
  ) {
    severity = 'extreme'
  } else if (
    category === 'High' ||
    (score !== null && score >= thresholds.highScore) ||
    (heatIndex !== null && heatIndex >= thresholds.highHeatIndexC)
  ) {
    severity = 'high'
  } else if (category === 'Moderate') {
    severity = 'moderate'
  }

  const location =
    weather.shortName ||
    weather.city ||
    weather.location?.name ||
    'Selected location'

  const recommendations = Array.isArray(weather.recommendations)
    ? weather.recommendations
    : severity === 'extreme'
      ? [
          'Avoid non-essential outdoor heat exposure during peak radiation hours.',
          'Use shaded rest periods and maintain adequate water intake.',
          'Move to an actively cooled environment when possible.',
        ]
      : severity === 'high'
        ? [
            'Limit continuous direct sun exposure.',
            'Take regular shaded breaks and maintain hydration.',
            'Schedule strenuous outdoor activity for cooler hours.',
          ]
        : severity === 'moderate'
          ? [
              'Take periodic breaks in shaded areas.',
              'Stay hydrated and monitor changing conditions.',
            ]
          : [
              'Maintain normal hydration.',
              'Continue monitoring conditions during prolonged outdoor activity.',
            ]

  const messages = {
    extreme: `Extreme heat risk detected for ${location}. Take protective action now.`,
    high: `High heat risk detected for ${location}. Reduce prolonged heat exposure.`,
    moderate: `Moderate heat conditions detected for ${location}. Monitor conditions and stay hydrated.`,
    normal: `No high-risk heat alert is active for ${location}.`,
  }

  return {
    active: severity === 'high' || severity === 'extreme',
    severity,
    category,
    title:
      severity === 'extreme'
        ? 'EXTREME HEAT ALERT'
        : severity === 'high'
          ? 'HIGH HEAT ALERT'
          : severity === 'moderate'
            ? 'HEAT ADVISORY'
            : 'HEAT STATUS',
    message: messages[severity],
    location,
    score,
    heatIndex,
    recommendations,
  }
}

export async function requestBrowserNotifications() {
  if (!('Notification' in window)) {
    return { supported: false, granted: false }
  }

  const permission =
    Notification.permission === 'granted'
      ? 'granted'
      : await Notification.requestPermission()

  return {
    supported: true,
    granted: permission === 'granted',
  }
}

export function sendBrowserAlert(alert) {
  if (
    !alert?.active ||
    !('Notification' in window) ||
    Notification.permission !== 'granted'
  ) {
    return false
  }

  new Notification(alert.title, {
    body: `${alert.message}\n${alert.recommendations?.[0] ?? ''}`,
    tag: `heatshield-${alert.location}`,
  })

  return true
}
