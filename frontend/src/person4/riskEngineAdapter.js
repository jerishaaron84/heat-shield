/**
 * Person 4 integration adapter.
 *
 * Converts the Person 2 risk-engine response into the common frontend
 * shape expected by the alert layer. This does not replace Person 3's
 * backend; it is the boundary to use once the central API is available.
 */
export function adaptRiskEngineResponse(payload = {}) {
  const risk = payload.risk ?? {}
  const environment = payload.environment ?? {}
  const location = payload.location ?? {}

  return {
    riskScore: Number.isFinite(Number(risk.score)) ? Number(risk.score) : null,
    heatCategory: risk.category ?? 'Low',
    factors: Array.isArray(risk.factors) ? risk.factors : [],
    explanation: risk.explanation ?? '',
    recommendations: Array.isArray(payload.recommendations)
      ? payload.recommendations
      : [],
    temperature: Number(environment.temperature),
    humidity: Number(environment.humidity),
    wind: Number(environment.wind_speed),
    radiation: Number(environment.solar_exposure),
    shortName: location.name ?? 'Selected location',
    latitude: Number(location.lat),
    longitude: Number(location.lon),
    timestamp: payload.timestamp ?? new Date().toISOString(),
  }
}
