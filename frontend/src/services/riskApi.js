// ============================================================
// HEATSHIELD — RISK API CLIENT (Person 1 -> Person 2)
// ============================================================
//
// The Python Heat Risk Engine (risk_engine/, Person 2) is the
// SINGLE SOURCE OF TRUTH for:
//
//   • risk score (0-100)
//   • risk category (Low / Moderate / High / Extreme)
//   • contributing factors
//   • explanation
//   • recommendations
//   • disclaimer
//
// This file only:
//   1. maps the weather values Person 1 already fetched from
//      Open-Meteo into the engine's request format,
//   2. calls  POST /api/risk        (current conditions)
//             POST /api/risk/batch  (forecast hours),
//   3. attaches the returned result to the weather object.
//
// It contains NO risk formula.
//
// ------------------------------------------------------------
// SOLAR EXPOSURE MAPPING (documented, deterministic)
// ------------------------------------------------------------
// Open-Meteo gives   shortwave_radiation   in W/m².
// The engine wants   solar_exposure        as 0.0 (shaded) … 1.0 (full sun).
//
//     solar_exposure = clamp(shortwave_radiation / 1000, 0, 1)
//
// 1000 W/m² is used as the "full sun" reference (≈ clear-sky
// midday global horizontal irradiance at low latitudes).
// At night radiation is really 0, so exposure is 0.0 (shaded).
// If Open-Meteo returns no radiation value we OMIT solar_exposure
// and the engine applies its own documented default
// (config/thresholds.json -> "solar_default") and says so in its
// explanation. No value is ever invented here.
// ============================================================

const API_BASE = (
  import.meta.env.VITE_API_BASE_URL || ''
).replace(/\/+$/, '')

const REQUEST_TIMEOUT_MS = 15000

export const SOLAR_FULL_SUN_W_M2 = 1000

// Shown only when the engine is unreachable, so the safety
// wording is never missing. When the engine responds, its own
// `disclaimer` field is displayed instead.
export const FALLBACK_DISCLAIMER =
  'This score is an environmental heat-exposure risk indicator. ' +
  'It is not a medical diagnostic tool and does not predict ' +
  'individual medical outcomes.'

export const RISK_ERROR_MESSAGE =
  'Unable to calculate heat risk. Please try again.'


// ------------------------------------------------------------
// ERROR TYPE
// ------------------------------------------------------------

export class RiskApiError extends Error {
  constructor(message, kind = 'unavailable', status = 0) {
    super(message)
    this.name = 'RiskApiError'
    // 'validation'  -> engine rejected the inputs (HTTP 422)
    // 'unavailable' -> network / server / timeout / bad JSON
    this.kind = kind
    this.status = status
  }
}


// ------------------------------------------------------------
// MAPPING HELPERS
// ------------------------------------------------------------

function finiteOrNull(value) {
  if (value === null || value === undefined || value === '') {
    return null
  }
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

export function radiationToSolarExposure(radiationWm2) {
  const radiation = finiteOrNull(radiationWm2)
  if (radiation === null) {
    return null
  }
  const exposure = Math.max(
    0,
    Math.min(1, radiation / SOLAR_FULL_SUN_W_M2)
  )
  return Math.round(exposure * 1000) / 1000
}

// Engine category -> the lowercase key the UI uses for colours.
// (Pure presentation mapping; it does not decide any risk.)
export function riskLevelFromCategory(category) {
  return typeof category === 'string'
    ? category.trim().toLowerCase()
    : null
}

function buildLocation(weather) {
  return {
    name:
      weather.shortName ||
      weather.city ||
      weather.name ||
      undefined,
    lat: finiteOrNull(weather.latitude),
    lon: finiteOrNull(weather.longitude),
  }
}

// snapshot: { temperature, humidity, wind, radiation, time }
export function buildRiskRequest(snapshot, location) {
  const request = {
    temperature: finiteOrNull(snapshot.temperature),
    temperature_unit: 'C',
    relative_humidity: finiteOrNull(snapshot.humidity),
    wind_speed: finiteOrNull(snapshot.wind),
    wind_unit: 'km/h',
    location,
    timestamp: snapshot.time || undefined,
  }

  const solar = radiationToSolarExposure(snapshot.radiation)
  if (solar !== null) {
    request.solar_exposure = solar
  }

  return request
}


// ------------------------------------------------------------
// HTTP
// ------------------------------------------------------------

function extractDetail(body) {
  // FastAPI HTTPException: { detail: { error, message } }
  // FastAPI/pydantic request validation: { detail: [ { loc, msg } ] }
  const detail = body?.detail
  if (!detail) {
    return ''
  }
  if (typeof detail === 'string') {
    return detail
  }
  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        const field = Array.isArray(item.loc)
          ? item.loc.filter((p) => p !== 'body').join('.')
          : ''
        return field ? `${field}: ${item.msg}` : item.msg
      })
      .join('; ')
  }
  return detail.message || ''
}

async function postJson(path, payload) {
  const controller = new AbortController()
  const timer = setTimeout(
    () => controller.abort(),
    REQUEST_TIMEOUT_MS
  )

  let response
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
  } catch (error) {
    console.error('Risk API network error:', error)
    throw new RiskApiError(RISK_ERROR_MESSAGE, 'unavailable')
  } finally {
    clearTimeout(timer)
  }

  let body = null
  try {
    body = await response.json()
  } catch {
    body = null
  }

  if (!response.ok) {
    if (response.status === 422) {
      const message = extractDetail(body)
      throw new RiskApiError(
        message
          ? `The weather values could not be scored: ${message}`
          : 'The weather values could not be scored.',
        'validation',
        422
      )
    }
    console.error('Risk API error', response.status, body)
    throw new RiskApiError(
      RISK_ERROR_MESSAGE,
      'unavailable',
      response.status
    )
  }

  if (!body || typeof body !== 'object') {
    throw new RiskApiError(RISK_ERROR_MESSAGE, 'unavailable')
  }

  return body
}

function assertRiskResult(result) {
  if (
    !result?.risk ||
    !Number.isFinite(Number(result.risk.score)) ||
    typeof result.risk.category !== 'string'
  ) {
    throw new RiskApiError(RISK_ERROR_MESSAGE, 'unavailable')
  }
  return result
}

// POST /api/risk
export async function fetchRisk(request) {
  return assertRiskResult(await postJson('/api/risk', request))
}

// POST /api/risk/batch
export async function fetchRiskBatch(requests) {
  const body = await postJson('/api/risk/batch', {
    items: requests,
  })
  if (
    !Array.isArray(body.results) ||
    body.results.length !== requests.length
  ) {
    throw new RiskApiError(RISK_ERROR_MESSAGE, 'unavailable')
  }
  return body.results.map(assertRiskResult)
}


// ------------------------------------------------------------
// ATTACH ENGINE RESULTS TO A WEATHER OBJECT
// ------------------------------------------------------------
//
// weather (from heatApi.getLiveWeather) -> same object plus:
//
//   riskStatus : 'ready' | 'error'
//   risk       : full engine RiskResult | null
//   riskError  : { message, kind } | null
//   riskLevel  : 'low' | 'moderate' | 'high' | 'extreme' | null
//   trend[i].riskScore / .category / .level   (or null)
//
// The current-conditions call and the forecast call are
// independent: a failure in one never blanks the other.
// ------------------------------------------------------------

export async function withRisk(weather) {
  const location = buildLocation(weather)

  const currentRequest = buildRiskRequest(
    {
      temperature: weather.temperature,
      humidity: weather.humidity,
      wind: weather.wind,
      radiation: weather.radiation,
      time: weather.weatherTime,
    },
    location
  )

  // Forecast hours: only hours that really have temperature,
  // humidity AND wind. Others are left without risk (shown as
  // "—") rather than being filled with made-up numbers.
  const trend = Array.isArray(weather.trend) ? weather.trend : []
  const forecastIndexes = []
  const forecastRequests = []

  trend.forEach((item, index) => {
    if (
      finiteOrNull(item.temperature) === null ||
      finiteOrNull(item.humidity) === null ||
      finiteOrNull(item.wind) === null
    ) {
      return
    }
    forecastIndexes.push(index)
    forecastRequests.push(
      buildRiskRequest(
        {
          temperature: item.temperature,
          humidity: item.humidity,
          wind: item.wind,
          radiation: item.radiation,
          time: item.isoTime,
        },
        location
      )
    )
  })

  const [currentOutcome, forecastOutcome] =
    await Promise.allSettled([
      fetchRisk(currentRequest),
      forecastRequests.length
        ? fetchRiskBatch(forecastRequests)
        : Promise.resolve([]),
    ])

  // ---- forecast ------------------------------------------------
  const trendWithRisk = trend.map((item) => ({
    ...item,
    riskScore: null,
    category: null,
    level: null,
  }))

  if (forecastOutcome.status === 'fulfilled') {
    forecastOutcome.value.forEach((result, position) => {
      const index = forecastIndexes[position]
      trendWithRisk[index] = {
        ...trendWithRisk[index],
        riskScore: result.risk.score,
        category: result.risk.category,
        level: riskLevelFromCategory(result.risk.category),
      }
    })
  } else {
    console.error('Forecast risk failed:', forecastOutcome.reason)
  }

  // ---- current -------------------------------------------------
  if (currentOutcome.status === 'fulfilled') {
    const result = currentOutcome.value
    return {
      ...weather,
      trend: trendWithRisk,
      risk: result,
      riskStatus: 'ready',
      riskError: null,
      riskLevel: riskLevelFromCategory(result.risk.category),
    }
  }

  const reason = currentOutcome.reason
  return {
    ...weather,
    trend: trendWithRisk,
    risk: null,
    riskStatus: 'error',
    riskError: {
      message:
        reason instanceof RiskApiError
          ? reason.message
          : RISK_ERROR_MESSAGE,
      kind:
        reason instanceof RiskApiError ? reason.kind : 'unavailable',
    },
    riskLevel: null,
  }
}

// Weather placeholder shown while the engine is calculating.
// Never carries a previous location's risk.
export function withRiskPending(weather) {
  return {
    ...weather,
    trend: (weather.trend || []).map((item) => ({
      ...item,
      riskScore: null,
      category: null,
      level: null,
    })),
    risk: null,
    riskStatus: 'loading',
    riskError: null,
    riskLevel: null,
  }
}
