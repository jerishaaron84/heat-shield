import { useEffect, useRef, useState } from 'react'
import './App.css'

import {
  DEFAULT_LOCATION,
  getLiveWeather,
  searchLocations,
  reverseGeocode,
} from './services/heatApi'
import {
  withRisk,
  withRiskPending,
  FALLBACK_DISCLAIMER,
  RISK_ERROR_MESSAGE,
} from './services/riskApi'

import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Popup,
  useMap,
  useMapEvents,
} from 'react-leaflet'

import 'leaflet/dist/leaflet.css'

import Person4AlertBanner from './person4/Person4AlertBanner'
import {
  evaluateAlert,
  sendBrowserAlert,
} from './person4/alertEngine'
import { adaptRiskEngineResponse } from './person4/riskEngineAdapter'


const NAV = [
  ['home', '⌂', 'Overview'],
  ['map', '⌖', 'Live Map'],
  ['forecast', '⌁', 'Forecast'],
  ['compare', '⇄', 'Compare'],
  ['safety', '◇', 'Safety'],
]


function App() {
  const [page, setPage] = useState('home')
  const [location, setLocation] = useState(DEFAULT_LOCATION)
  const [weather, setWeather] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [resolvingMap, setResolvingMap] = useState(false)
  const [lastRefresh, setLastRefresh] = useState(Date.now())


  // Guards against out-of-order responses (e.g. user picks a new
  // location while an older request is still in flight).
  const requestId = useRef(0)

  async function loadWeather(selected, quiet = false) {
    const id = ++requestId.current

    try {
      if (!quiet) {
        setLoading(true)
      }

      setError('')

      // 1. Weather values (Open-Meteo) — Person 1's existing service.
      const raw = await getLiveWeather(selected)

      if (id !== requestId.current) {
        return
      }

      // 2. Show the weather straight away; the risk panels show
      //    "Calculating heat risk..." and never a previous location's score.
      if (!quiet) {
        setWeather(withRiskPending(raw))
        setLastRefresh(Date.now())
      }

      // 3. Risk comes ONLY from the Python engine (POST /api/risk).
      const full = await withRisk(raw)

      if (id !== requestId.current) {
        return
      }

      setWeather(full)
      setLastRefresh(Date.now())

      if (full.riskStatus === 'error') {
        setError(full.riskError.message)
      }
    } catch (err) {
      if (id !== requestId.current) {
        return
      }

      console.error(err)
      setError(
        err.message ||
          'Unable to update weather.'
      )
    } finally {
      if (id === requestId.current) {
        setLoading(false)
      }
    }
  }

  useEffect(() => {
    loadWeather(location)

    const timer = setInterval(
      () => loadWeather(location, true),
      10 * 60 * 1000
    )

    return () => clearInterval(timer)
  }, [
    location.latitude,
    location.longitude,
  ])


  async function runSearch(text = query) {
    if (text.trim().length < 2) {
      return
    }

    try {
      setSearching(true)
      setError('')

      const matches =
        await searchLocations(text)

      setResults(matches)
    } catch (err) {
      console.error(err)

      setError(
        err.message ||
          'Search unavailable.'
      )

      setResults([])
    } finally {
      setSearching(false)
    }
  }


  async function chooseMapPoint(
    latitude,
    longitude
  ) {
    try {
      setResolvingMap(true)

      const address =
        await reverseGeocode(
          latitude,
          longitude
        )

      setLocation(address)
      setQuery(address.name)
      setResults([])
    } catch (err) {
      console.error(err)

      setError(
        'Unable to resolve this map location.'
      )
    } finally {
      setResolvingMap(false)
    }
  }


  function useMyLocation() {
    if (!navigator.geolocation) {
      setError(
        'This browser does not support location access.'
      )
      return
    }

    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        try {
          setResolvingMap(true)

          const place =
            await reverseGeocode(
              coords.latitude,
              coords.longitude
            )

          setLocation(place)
          setQuery(place.name)
          setPage('map')
        } catch (err) {
          console.error(err)

          setError(
            'Your coordinates were found, but the nearby address could not be resolved.'
          )
        } finally {
          setResolvingMap(false)
        }
      },

      () => {
        setError(
          'Location permission was not granted. You can still search or click the map.'
        )
      },

      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 300000,
      }
    )
  }


  if (!weather && loading) {
    return <Loading />
  }


  if (!weather) {
    return (
      <div className="loading-screen">
        <div className="loading-logo">
          ☀
        </div>

        <h1>
          HeatShield couldn't load
        </h1>

        <p>
          {error ||
            'Weather data is temporarily unavailable.'}
        </p>

        <button
          className="primary-btn"
          onClick={() =>
            loadWeather(location)
          }
        >
          Try again
        </button>
      </div>
    )
  }


  const riskColor =
    getRiskColor(weather.riskLevel)

  const weatherVisual =
    getWeatherVisual(
      weather.weatherCode,
      weather.isDay
    )

  const peak =
    getPeak(weather.trend)

  const alerts =
    buildAlerts(weather)

  const recommendations =
    getRecommendations(weather)


  return (
    <div
      className={`app ${
        weather.isDay
          ? 'day'
          : 'night'
      }`}
      style={{
        '--risk': riskColor,
      }}
    >
      <div className="aurora aurora-a" />
      <div className="aurora aurora-b" />

      <Sidebar
        page={page}
        setPage={setPage}
        weather={weather}
      />

      <main className="shell">
        <Topbar
          weather={weather}
          loading={loading}
          lastRefresh={lastRefresh}
          useMyLocation={useMyLocation}
          refresh={() =>
            loadWeather(location)
          }
        />

        <HeatAlertBanner weather={weather} />

        <div
          className="page-enter"
          key={page}
        >
          {page === 'home' && (
            <Overview
              weather={weather}
              visual={weatherVisual}
              riskColor={riskColor}
              peak={peak}
              alerts={alerts}
              setPage={setPage}
            />
          )}

          {page === 'map' && (
            <LiveMap
              weather={weather}
              riskColor={riskColor}
              query={query}
              setQuery={setQuery}
              results={results}
              setResults={setResults}
              searching={searching}
              runSearch={runSearch}
              setLocation={setLocation}
              chooseMapPoint={
                chooseMapPoint
              }
              resolvingMap={
                resolvingMap
              }
              useMyLocation={
                useMyLocation
              }
            />
          )}

          {page === 'forecast' && (
            <Forecast
              weather={weather}
              peak={peak}
              riskColor={riskColor}
            />
          )}

          {page === 'compare' && (
            <Compare
              current={weather}
              setError={setError}
            />
          )}

          {page === 'safety' && (
            <Safety
              weather={weather}
              riskColor={riskColor}
              recommendations={
                recommendations
              }
              alerts={alerts}
            />
          )}
        </div>
      </main>

      <MobileDock
        page={page}
        setPage={setPage}
      />

      {error && (
        <div
          className="toast"
          onClick={() =>
            setError('')
          }
        >
          <span>!</span>

          <div>
            <strong>
              Connection notice
            </strong>

            <p>{error}</p>
          </div>

          <b>×</b>
        </div>
      )}
    </div>
  )
}


// ============================================================
// HEAT ALERT (Person 4 alert layer)
// ============================================================
// The alert is driven ONLY by the engine's RiskResult
// (weather.risk = calculate_risk() output). The adapter maps
// risk.score / risk.category into the alert module; no heat
// index or risk value is recalculated here, and the frontend
// heat-index reading is deliberately NOT passed to the alert.
// Shown only when a RiskResult exists (loading/error states
// are already handled by the existing risk status UI).

function HeatAlertBanner({ weather }) {
  const lastNotified = useRef('')

  const ready =
    weather?.riskStatus === 'ready' && weather?.risk

  const alertInput = ready
    ? adaptRiskEngineResponse(weather.risk)
    : null

  const alert = alertInput ? evaluateAlert(alertInput) : null

  const notifyKey = alert?.active
    ? `${alert.location}:${alert.severity}`
    : ''

  useEffect(() => {
    // Browser notification only when the alert changes into
    // high/extreme for a location, not on every refresh.
    if (!alert?.active) {
      lastNotified.current = ''
      return
    }
    if (lastNotified.current !== notifyKey) {
      lastNotified.current = notifyKey
      sendBrowserAlert(alert)
    }
  }, [notifyKey])

  if (!alertInput) {
    return null
  }

  return <Person4AlertBanner weather={alertInput} />
}


function Sidebar({
  page,
  setPage,
  weather,
}) {
  return (
    <aside className="sidebar">
      <button
        className="brand"
        onClick={() =>
          setPage('home')
        }
      >
        <span className="brand-mark">
          ◉
        </span>

        <div>
          <strong>
            HeatShield
          </strong>

          <small>
            HEAT INTELLIGENCE
          </small>
        </div>
      </button>

      <div className="side-label">
        CONTROL CENTER
      </div>

      <nav className="side-nav">
        {NAV.map(
          ([id, icon, label]) => (
            <button
              key={id}
              className={
                page === id
                  ? 'side-link active'
                  : 'side-link'
              }
              onClick={() =>
                setPage(id)
              }
            >
              <span>{icon}</span>
              <b>{label}</b>
            </button>
          )
        )}
      </nav>

      <div className="side-spacer" />

      <div className="system-card">
        <div className="system-head">
          <span className="live-dot" />
          SYSTEM LIVE
        </div>

        <strong>
          {weather.shortName ||
            weather.city}
        </strong>

        <small>
          Open-Meteo connected
        </small>

        <div className="system-line">
          <i />
        </div>
      </div>

      <div className="side-footer">
        HeatShield v2.0
      </div>
    </aside>
  )
}


function Topbar({
  weather,
  loading,
  lastRefresh,
  useMyLocation,
  refresh,
}) {
  return (
    <header className="topbar">
      <div>
        <div className="crumb">
          HEATSHIELD

          <span>/</span>

          LIVE MONITORING
        </div>

        <h2>
          {weather.shortName ||
            weather.city ||
            'Selected location'}
        </h2>
      </div>

      <div className="top-actions">
        <div className="data-status">
          <span className="live-dot" />

          <div>
            <b>
              {loading
                ? 'UPDATING'
                : 'LIVE DATA'}
            </b>

            <small>
              {timeAgo(lastRefresh)}
            </small>
          </div>
        </div>

        <button
          className="icon-btn"
          title="Use my location"
          onClick={useMyLocation}
        >
          ⌖
        </button>

        <button
          className="icon-btn"
          title="Refresh"
          onClick={refresh}
        >
          ↻
        </button>
      </div>
    </header>
  )
}


function Overview({
  weather,
  visual,
  riskColor,
  peak,
  alerts,
  setPage,
}) {
  

  return (
    <>
      <section className="welcome">
        <div>
          <div className="eyebrow">
            <span className="live-dot" />
            CURRENT ATMOSPHERE
          </div>

          <h1>
            Heat intelligence,{' '}
            <span>alive.</span>
          </h1>

          <p>
            Real current weather for your
            selected coordinates, scored by
            the HeatShield Risk Engine.
          </p>
        </div>

        <div className="weather-badge">
          <span>
            {visual.icon}
          </span>

          <div>
            <b>
              {visual.label}
            </b>

            <small>
              {weather.isDay
                ? 'Daylight'
                : 'Night'}
            </small>
          </div>
        </div>
      </section>

      <section className="kpi-grid">
        <Kpi
          icon="🌡"
          label="AIR TEMPERATURE"
          value={`${weather.temperature}°`}
          unit="C"
          sub={`Today's high ${weather.dailyMaximum}°`}
        />

        <Kpi
          icon="♨"
          label="FEELS LIKE"
          value={`${weather.apparentTemperature}°`}
          unit="C"
          sub="Open-Meteo apparent temp"
        />

        <Kpi
          icon="💧"
          label="HUMIDITY"
          value={`${weather.humidity}`}
          unit="%"
          sub={`Dew point ${fmt(
            weather.dewPoint
          )}°`}
        />

        <Kpi
          icon="☀"
          label="UV INDEX MAX"
          value={fmt(
            weather.uvIndex
          )}
          unit=""
          sub={weather.uvCategory}
        />
      </section>

      <section className="command-grid">
        <div className="panel timeline-panel">
          <PanelTitle
            kicker="24-HOUR SIGNAL"
            title="Heat timeline"
            action="Forecast"
            onClick={() =>
              setPage('forecast')
            }
          />

          <NeonChart
            items={weather.trend}
          />

          <div className="peak-strip">
            <div>
              <span>
                PEAK WINDOW
              </span>

              <strong>
                {peak
                  ? peak.time
                  : '—'}
              </strong>
            </div>

            <div>
              <span>
                PEAK RISK SCORE
              </span>

              <strong>
                {peak &&
                peak.riskScore !== null
                  ? `${peak.riskScore} / 100`
                  : '—'}
              </strong>
            </div>

            <div>
              <span>
                FORECAST LEVEL
              </span>

              <strong
                style={{
                  color: peak
                    ? getRiskColor(
                        peak.level
                      )
                    : '#fff',
                }}
              >
                {peak?.category ||
                  '—'}
              </strong>
            </div>
          </div>
        </div>

        <HeatPulse
          weather={weather}
          riskColor={riskColor}
        />
      </section>

      <section className="lower-grid">
        <div className="panel mini-map-panel">
          <PanelTitle
            kicker="LOCATION PULSE"
            title="Live coordinate"
            action="Open map"
            onClick={() =>
              setPage('map')
            }
          />

          <MiniMap
            weather={weather}
            riskColor={riskColor}
          />

          <div className="map-caption">
            <div>
              <b>
                {weather.shortName ||
                  weather.city}
              </b>

              <small>
                {weather.name}
              </small>
            </div>

            <strong>
              {weather.temperature}°
            </strong>
          </div>
        </div>

        <div className="panel intelligence-panel">
          <PanelTitle
            kicker="WHY THIS LEVEL? · RISK ENGINE"
            title="Heat intelligence"
          />

          <div className="factor-list">
            <RiskFactors weather={weather} />
          </div>
        </div>

        <div className="panel alerts-panel">
          <PanelTitle
            kicker="SMART ADVISORY"
            title="Current signals"
            action="Safety"
            onClick={() =>
              setPage('safety')
            }
          />

          <div className="alert-list">
            {alerts
              .slice(0, 3)
              .map(
                (alert, index) => (
                  <div
                    className={`smart-alert ${alert.tone}`}
                    key={index}
                  >
                    <span>
                      {alert.icon}
                    </span>

                    <div>
                      <b>
                        {alert.title}
                      </b>

                      <small>
                        {alert.text}
                      </small>
                    </div>
                  </div>
                )
              )}
          </div>
        </div>
      </section>
    </>
  )
}


function Kpi({
  icon,
  label,
  value,
  unit,
  sub,
}) {
  return (
    <div className="kpi-card">
      <div className="kpi-icon">
        {icon}
      </div>

      <div className="kpi-copy">
        <span>{label}</span>

        <strong>
          {value}

          <small>
            {unit}
          </small>
        </strong>

        <p>{sub}</p>
      </div>

      <Spark />
    </div>
  )
}


function HeatPulse({
  weather,
  riskColor,
}) {
  const summary =
    getRiskSummary(weather)

  const percentage =
    summary.status === 'ready'
      ? Math.max(
          2,
          Math.min(
            100,
            summary.score
          )
        )
      : 0

  return (
    <div className="panel pulse-panel">
      <PanelTitle
        kicker="HEATSHIELD PULSE"
        title="Heat risk"
      />

      <div
        className="pulse-wrap"
        style={{
          '--pulse': riskColor,
        }}
      >
        <div className="pulse-halo h1" />
        <div className="pulse-halo h2" />

        <svg
          className="pulse-ring"
          viewBox="0 0 220 220"
        >
          <defs>
            <linearGradient
              id="ringGrad"
              x1="0"
              x2="1"
            >
              <stop
                offset="0%"
                stopColor="#22d3ee"
              />
              <stop
                offset="52%"
                stopColor="#8b5cf6"
              />
              <stop
                offset="100%"
                stopColor={riskColor}
              />
            </linearGradient>
          </defs>

          <circle
            className="ring-track"
            cx="110"
            cy="110"
            r="86"
          />

          <circle
            className="ring-value"
            cx="110"
            cy="110"
            r="86"
            pathLength="100"
            style={{
              strokeDasharray:
                `${percentage} 100`,
            }}
          />
        </svg>

        <div className="pulse-center">
          <span>
            HEAT RISK SCORE
          </span>

          <strong data-testid="risk-score">
            {summary.status === 'ready'
              ? summary.score
              : '—'}
            <small>/ 100</small>
          </strong>

          <b
            data-testid="risk-category"
            style={{
              color: riskColor,
            }}
          >
            {summary.status === 'ready'
              ? summary.category.toUpperCase()
              : summary.status ===
                  'loading'
                ? 'CALCULATING'
                : 'UNAVAILABLE'}
          </b>
        </div>
      </div>

      <RiskStatusLine
        summary={summary}
      />

      <div className="pulse-meta">
        <div>
          <span>
            Wet bulb est.
          </span>
          <b>
            {fmt(
              weather.wetBulb
            )}°
          </b>
        </div>

        <div>
          <span>Solar</span>
          <b>
            {fmt(
              weather.radiation
            )} W/m²
          </b>
        </div>

        <div>
          <span>Wind</span>
          <b>
            {fmt(
              weather.wind
            )} km/h
          </b>
        </div>
      </div>

      <p
        className="risk-disclaimer"
        data-testid="risk-disclaimer"
      >
        {summary.disclaimer}
      </p>
    </div>
  )
}

// Status / explanation line under the score ring.
function RiskStatusLine({
  summary,
}) {
  if (summary.status === 'loading') {
    return (
      <p
        className="risk-status loading"
        data-testid="risk-status"
        role="status"
      >
        Calculating heat risk...
      </p>
    )
  }

  if (summary.status === 'error') {
    return (
      <p
        className="risk-status error"
        data-testid="risk-status"
        role="alert"
      >
        {summary.errorMessage}{' '}
        <small>
          Use ↻ to retry.
        </small>
      </p>
    )
  }

  return (
    <div
      className="risk-status ready"
      data-testid="risk-status"
    >
      <em>Risk calculated</em>
      <p data-testid="risk-explanation">
        {summary.explanation}
      </p>
    </div>
  )
}

// Factors returned by the engine, in the engine's ranked order.
function RiskFactors({
  weather,
}) {
  const summary =
    getRiskSummary(weather)

  if (summary.status === 'loading') {
    return (
      <div
        className="risk-status loading"
        role="status"
      >
        Calculating heat risk...
      </div>
    )
  }

  if (summary.status === 'error') {
    return (
      <div
        className="risk-status error"
        role="alert"
      >
        {summary.errorMessage}
      </div>
    )
  }

  return (
    <>
      <p className="risk-explanation">
        {summary.explanation}
      </p>

      {summary.factors.map(
        (factor) => {
          const meta =
            FACTOR_META[
              factor.factor
            ] || {
              icon: '•',
              label:
                factor.factor,
            }

          return (
            <div
              className="factor"
              data-testid="risk-factor"
              key={factor.factor}
            >
              <span>
                {meta.icon}
              </span>

              <div>
                <b>
                  {meta.label}
                </b>

                <small>
                  {capitalize(
                    factor.impact
                  )}{' '}
                  impact
                  {meta.reading
                    ? ` · ${meta.reading(
                        weather
                      )}`
                    : ''}
                </small>
              </div>

              <strong>
                {factor.contribution}{' '}
                pts
              </strong>
            </div>
          )
        }
      )}
    </>
  )
}
function LiveMap({
  weather,
  riskColor,
  query,
  setQuery,
  results,
  setResults,
  searching,
  runSearch,
  setLocation,
  chooseMapPoint,
  resolvingMap,
  useMyLocation,
}) {
  return (
    <>
      <PageHead
        kicker="LIVE GEOSPATIAL VIEW"
        title={
          <>
            Explore the{' '}
            <span>heat.</span>
          </>
        }
        text="Search a real place, use your browser location, or click anywhere on the map."
      />

      <section className="map-stage">
        <div className="map-tools">
          <form
            onSubmit={(event) => {
              event.preventDefault()
              runSearch()
            }}
          >
            <span>⌕</span>

            <input
              value={query}
              onChange={(event) => {
                setQuery(
                  event.target.value
                )
                setResults([])
              }}
              placeholder="Search street, landmark, area, city..."
            />

            <button>
              {searching
                ? '...'
                : 'Search'}
            </button>
          </form>

          <button
            className="locate-btn"
            onClick={useMyLocation}
          >
            ⌖{' '}
            <span>
              Use my location
            </span>
          </button>

          {results.length > 0 && (
            <div className="search-results">
              {results.map(
                (result) => (
                  <button
                    key={result.id}
                    onClick={() => {
                      setLocation(
                        result
                      )
                      setQuery(
                        result.name
                      )
                      setResults([])
                    }}
                  >
                    <span>⌖</span>

                    <div>
                      <b>
                        {result.shortName}
                      </b>

                      <small>
                        {result.name}
                      </small>
                    </div>
                  </button>
                )
              )}
            </div>
          )}
        </div>

        <MapContainer
          center={[
            weather.latitude,
            weather.longitude,
          ]}
          zoom={13}
          className="big-map"
          scrollWheelZoom
        >
          <MapUpdater
            latitude={
              weather.latitude
            }
            longitude={
              weather.longitude
            }
          />

          <MapClick
            onSelect={
              chooseMapPoint
            }
          />

          <TileLayer
            attribution="&copy; OpenStreetMap contributors"
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <CircleMarker
            center={[
              weather.latitude,
              weather.longitude,
            ]}
            radius={13}
            pathOptions={{
              color: '#ffffff',
              weight: 3,
              fillColor:
                riskColor,
              fillOpacity: 1,
            }}
          >
            <Popup>
              <b>
                {weather.shortName ||
                  weather.city}
              </b>

              <br />

              {weather.temperature}°C
              {' · '}
              Heat Index{' '}
              {weather.heatIndex}°C
            </Popup>
          </CircleMarker>
        </MapContainer>

        <div className="map-glass-card">
          <div className="map-card-head">
            <div>
              <span>
                SELECTED COORDINATE
              </span>

              <b>
                {weather.shortName ||
                  weather.city}
              </b>
            </div>

            <i
              style={{
                background:
                  riskColor,
              }}
            />
          </div>

          <p>
            {weather.name}
          </p>

          <div className="map-metrics">
            <div>
              <strong>
                {weather.temperature}°
              </strong>

              <span>Air</span>
            </div>

            <div>
              <strong>
                {weather.apparentTemperature}°
              </strong>

              <span>Feels</span>
            </div>

            <div>
              <strong
                style={{
                  color:
                    riskColor,
                }}
              >
                {weather.heatIndex}°
              </strong>

              <span>
                Heat Index
              </span>
            </div>

            <div>
              <strong>
                {weather.humidity}%
              </strong>

              <span>
                Humidity
              </span>
            </div>
          </div>

          <small>
            Weather is queried for this
            coordinate. The marker does not
            represent a measured heat radius.
          </small>
        </div>

        {resolvingMap && (
          <div className="map-loading">
            <span className="mini-loader" />
            Resolving location…
          </div>
        )}
      </section>
    </>
  )
}


function Forecast({
  weather,
  peak,
  riskColor,
}) {
  return (
    <>
      <PageHead
        kicker="FORECAST INTELLIGENCE"
        title={
          <>
            See the heat{' '}
            <span>
              before it arrives.
            </span>
          </>
        }
        text="The timeline combines Open-Meteo hourly forecast temperature and humidity with heat-risk scores calculated by the HeatShield Risk Engine."
      />

      <section className="forecast-kpis">
        <MiniKpi
          label="NOW"
          value={
            weather.risk
              ? `${weather.risk.risk.score}`
              : '—'
          }
          sub={
            getRiskSummary(weather)
              .category ||
            (weather.riskStatus ===
            'loading'
              ? 'Calculating…'
              : 'Unavailable')
          }
          color={riskColor}
        />

        <MiniKpi
          label="PEAK RISK"
          value={
            peak &&
            peak.riskScore !== null
              ? `${peak.riskScore}`
              : '—'
          }
          sub={
            peak?.time ||
            'Forecast'
          }
        />

        <MiniKpi
          label="AIR HIGH"
          value={`${weather.dailyMaximum}°`}
          sub="Today"
        />

        <MiniKpi
          label="FEELS MAX"
          value={`${weather.dailyApparentMaximum}°`}
          sub="Today"
        />
      </section>

      <section className="panel forecast-main">
        <PanelTitle
          kicker="NEXT 24 HOURS"
          title="Thermal trajectory"
        />

        <NeonChart
          items={weather.trend}
          large
        />

        <div className="chart-legend-row">
          <span>
            <i className="dot cyan" />
            Air temperature
          </span>

          <span>
            <i className="dot purple" />
            Heat Index
          </span>
        </div>
      </section>

      <section className="hour-grid">
        {weather.trend.map(
          (item, index) => (
            <div
              className={
                index === 0
                  ? 'hour-tile now'
                  : 'hour-tile'
              }
              key={`${item.time}-${index}`}
            >
              <span>
                {index === 0
                  ? 'NOW'
                  : item.time}
              </span>

              <b>
                {item.riskScore !== null
                  ? item.riskScore
                  : '—'}
              </b>

              <small>
                air{' '}
                {item.temperature}°
              </small>

              <div className="hour-bar">
                <i
                  style={{
                    width:
                      `${
                        item.riskScore !== null
                          ? Math.max(
                              2,
                              item.riskScore
                            )
                          : 0
                      }%`,
                    background:
                      getRiskColor(
                        item.level
                      ),
                  }}
                />
              </div>

              <em>
                {item.category ||
                  'Unavailable'}
              </em>
            </div>
          )
        )}
      </section>

      <section className="environment-grid">
        <Env
          icon="☀"
          label="UV MAX"
          value={fmt(
            weather.uvIndex
          )}
          sub={weather.uvCategory}
        />

        <Env
          icon="◌"
          label="CLOUD COVER"
          value={`${fmt(
            weather.cloudCover
          )}%`}
          sub="Current"
        />

        <Env
          icon="💨"
          label="WIND / GUST"
          value={`${fmt(
            weather.wind
          )} / ${fmt(
            weather.windGust
          )}`}
          sub="km/h"
        />

        <Env
          icon="↗"
          label="WIND DIRECTION"
          value={`${fmt(
            weather.windDirection
          )}°`}
          sub={windCompass(
            weather.windDirection
          )}
        />

        <Env
          icon="✦"
          label="SOLAR RADIATION"
          value={fmt(
            weather.radiation
          )}
          sub="W/m²"
        />

        <Env
          icon="◎"
          label="PRESSURE"
          value={fmt(
            weather.surfacePressure
          )}
          sub="hPa"
        />
      </section>
    </>
  )
}


function Compare({
  current,
  setError,
}) {
  const [slots, setSlots] =
    useState([current])

  const [query, setQuery] =
    useState('')

  const [matches, setMatches] =
    useState([])

  const [busy, setBusy] =
    useState(false)


  useEffect(() => {
    setSlots(
      (old) => [
        current,
        ...old.slice(1),
      ]
    )
  }, [
    current.latitude,
        current.longitude,
    current.updatedAt,
    current.riskStatus,
  ])


  async function search(event) {
    event.preventDefault()

    if (
      query.trim().length < 2
    ) {
      return
    }

    try {
      setBusy(true)

      const data =
        await searchLocations(
          query
        )

      setMatches(data)
    } catch (err) {
      console.error(err)

      setError(
        err.message ||
          'Comparison search unavailable.'
      )
    } finally {
      setBusy(false)
    }
  }


  async function addLocation(
    place
  ) {
    try {
      setBusy(true)

      const data =
        await withRisk(
          await getLiveWeather(
            place
          )
        )

      setSlots(
        (old) => {
          const filtered =
            old.filter(
              (item) =>
                !(
                  item.latitude ===
                    data.latitude &&
                  item.longitude ===
                    data.longitude
                )
            )

          return [
            filtered[0] ||
              current,
            ...filtered.slice(1),
            data,
          ].slice(0, 3)
        }
      )

      setMatches([])
      setQuery('')
    } catch (err) {
      console.error(err)

      setError(
        err.message ||
          'Could not load comparison weather.'
      )
    } finally {
      setBusy(false)
    }
  }


  return (
    <>
      <PageHead
        kicker="CITY PULSE"
        title={
          <>
            Compare heat{' '}
            <span>
              side by side.
            </span>
          </>
        }
        text="Add up to two more locations and compare current conditions using the same data and Heat Index method."
      />

      <div className="compare-search">
        <form
          onSubmit={search}
        >
          <span>⌕</span>

          <input
            value={query}
            onChange={
              (event) =>
                setQuery(
                  event.target.value
                )
            }
            placeholder="Add another location..."
          />

          <button>
            {busy
              ? 'Loading…'
              : 'Add location'}
          </button>
        </form>

        {matches.length > 0 && (
          <div className="compare-results">
            {matches.map(
              (match) => (
                <button
                  key={match.id}
                  onClick={() =>
                    addLocation(
                      match
                    )
                  }
                >
                  <b>
                    {match.shortName}
                  </b>

                  <small>
                    {match.name}
                  </small>
                </button>
              )
            )}
          </div>
        )}
      </div>

      <section className="compare-grid">
        {slots.map(
          (item, index) => (
            <CompareCard
              key={`${item.latitude}-${item.longitude}`}
              weather={item}
              primary={
                index === 0
              }
            />
          )
        )}

        {slots.length < 3 && (
          <div className="compare-empty">
            <span>＋</span>

            <b>
              Add a location
            </b>

            <small>
              Search above to compare another place.
            </small>
          </div>
        )}
      </section>

      {slots.length > 1 && (
        <section className="panel compare-bars">
          <PanelTitle
            kicker="RELATIVE VIEW"
            title="Current-condition comparison"
          />

          {[
            'temperature',
            'apparentTemperature',
            'humidity',
            'heatIndex',
          ].map(
            (field) => (
              <CompareRow
                key={field}
                label={metricLabel(
                  field
                )}
                items={slots}
                field={field}
              />
            )
          )}
        </section>
      )}
    </>
  )
}


function CompareCard({
  weather,
  primary,
}) {
  const color =
    getRiskColor(
      weather.riskLevel
    )

  return (
    <div
      className={
        primary
          ? 'compare-card primary'
          : 'compare-card'
      }
      style={{
        '--city': color,
      }}
    >
      <div className="compare-top">
        <span>
          {primary
            ? 'CURRENT LOCATION'
            : 'COMPARISON'}
        </span>

        <i
          style={{
            background: color,
          }}
        />
      </div>

      <h3>
        {weather.shortName ||
          weather.city}
      </h3>

      <p>
        {weather.country ||
          weather.name}
      </p>

      <div className="compare-orb">
        <strong>
          {getRiskSummary(weather)
            .status === 'ready'
            ? getRiskSummary(weather)
                .score
            : '—'}
          <small>/100</small>
        </strong>
        <span>
          RISK SCORE
        </span>
      </div>

      <b
        className="compare-category"
        style={{
          color,
        }}
      >
        {getRiskSummary(weather)
          .category ||
          (weather.riskStatus ===
          'loading'
            ? 'Calculating…'
            : 'Unavailable')}
      </b>

      <div className="compare-stats">
        <div>
          <span>AIR</span>
          <b>
            {weather.temperature}°
          </b>
        </div>

        <div>
          <span>FEELS</span>
          <b>
            {weather.apparentTemperature}°
          </b>
        </div>

        <div>
          <span>HUMIDITY</span>
          <b>
            {weather.humidity}%
          </b>
        </div>

        <div>
          <span>UV</span>
          <b>
            {fmt(
              weather.uvIndex
            )}
          </b>
        </div>
      </div>
    </div>
  )
}


function CompareRow({
  label,
  items,
  field,
}) {
  const values =
    items.map(
      (item) =>
        Number(
          item[field]
        ) || 0
    )

  const maximum =
    Math.max(
      ...values,
      1
    )

  return (
    <div className="compare-row">
      <span>{label}</span>

      <div className="compare-row-bars">
        {items.map(
          (item, index) => (
            <div
              key={`${item.latitude}-${field}`}
            >
              <small>
                {item.shortName ||
                  item.city}
              </small>

              <div>
                <i
                  style={{
                    width:
                      `${(
                        values[index] /
                        maximum
                      ) * 100}%`,
                  }}
                />
              </div>

              <b>
                {values[index]}
                {field ===
                'humidity'
                  ? '%'
                  : '°'}
              </b>
            </div>
          )
        )}
      </div>
    </div>
  )
}


function Safety({
  weather,
  riskColor,
  recommendations,
  alerts,
}) {
  return (
    <>
      <PageHead
        kicker="ADAPTIVE SAFETY"
        title={
          <>
            Know the conditions.{' '}
            <span>
              Act earlier.
            </span>
          </>
        }
        text="Guidance comes from the HeatShield Risk Engine for the current environmental heat-risk category."
      />

      <section className="safety-grid">
        <div className="panel safety-status">
          <HeatPulse
            weather={weather}
            riskColor={riskColor}
          />
        </div>

        <div className="panel safety-alerts">
          <PanelTitle
            kicker="ACTIVE SIGNALS"
            title="What stands out now"
          />

          <div className="alert-list">
            {alerts.map(
              (alert, index) => (
                <div
                  className={`smart-alert ${alert.tone}`}
                  key={index}
                >
                  <span>
                    {alert.icon}
                  </span>

                  <div>
                    <b>
                      {alert.title}
                    </b>

                    <small>
                      {alert.text}
                    </small>
                  </div>
                </div>
              )
            )}
          </div>
        </div>
      </section>

      <section className="recommend-grid">
        {recommendations.map(
          (
            recommendation,
            index
          ) => (
            <div
              className="recommend-card"
              key={
                recommendation.title
              }
            >
              <span className="recommend-num">
                0{index + 1}
              </span>

              <div className="recommend-icon">
                {recommendation.icon}
              </div>

              <h3>
                {recommendation.title}
              </h3>

              <p>
                {recommendation.text}
              </p>
            </div>
          )
        )}
      </section>

      <section className="panel transparency">
        <PanelTitle
          kicker="DATA TRANSPARENCY"
          title="What is measured vs derived"
        />

        <div className="source-cards">
          <Source
            title="Weather & forecast"
            badge="API"
            text="Open-Meteo model data for the selected coordinates."
          />

          <Source
            title="Heat risk score"
            badge="RISK ENGINE"
            text="Score, category, factors, explanation and guidance are calculated by the HeatShield Python Risk Engine. It is an environmental indicator, not a medical tool."
          />
          <Source
            title="Heat Index"
            badge="DERIVED"
            text="Weather reading calculated locally (NWS Rothfusz) for the charts. It is not used to decide the risk category."
          />

          <Source
            title="Wet-bulb"
            badge="ESTIMATE"
            text="Estimated locally with the Stull approximation; it is not a direct sensor observation."
          />

          <Source
            title="Address labels"
            badge="MAP DATA"
            text="OpenStreetMap Nominatim search and reverse-geocoding."
          />
        </div>

        <div className="source-foot">
          Model timestamp:{' '}
          {weather.updatedAt}
          {' · '}
          Timezone:{' '}
          {weather.timezone ||
            'local'}
          {' · '}
          Coordinates:{' '}
          {weather.latitude.toFixed(
            4
          )}
          ,{' '}
          {weather.longitude.toFixed(
            4
          )}
        </div>
      </section>
    </>
  )
}


function PanelTitle({
  kicker,
  title,
  action,
  onClick,
}) {
  return (
    <div className="panel-title">
      <div>
        <span>{kicker}</span>
        <h3>{title}</h3>
      </div>

      {action && (
        <button
          onClick={onClick}
        >
          {action} ↗
        </button>
      )}
    </div>
  )
}


function PageHead({
  kicker,
  title,
  text,
}) {
  return (
    <section className="page-head">
      <div className="eyebrow">
        {kicker}
      </div>

      <h1>{title}</h1>

      <p>{text}</p>
    </section>
  )
}


function MiniKpi({
  label,
  value,
  sub,
  color,
}) {
  return (
    <div className="mini-kpi">
      <span>{label}</span>

      <strong
        style={
          color
            ? { color }
            : undefined
        }
      >
        {value}
      </strong>

      <small>{sub}</small>
    </div>
  )
}


function Env({
  icon,
  label,
  value,
  sub,
}) {
  return (
    <div className="env-card">
      <span>{icon}</span>

      <div>
        <small>{label}</small>
        <b>{value}</b>
        <p>{sub}</p>
      </div>
    </div>
  )
}


function Source({
  title,
  badge,
  text,
}) {
  return (
    <div className="source-card">
      <span>{badge}</span>
      <b>{title}</b>
      <p>{text}</p>
    </div>
  )
}


function Spark() {
  return (
    <svg
      className="spark"
      viewBox="0 0 70 28"
    >
      <path
        d="M2 22 C10 20 12 8 20 14 S30 24 38 12 S50 5 56 13 S64 10 68 4"
        fill="none"
      />
    </svg>
  )
}


function NeonChart({
  items = [],
  large = false,
}) {
  if (!items.length) {
    return (
      <div className="chart-empty">
        Forecast unavailable
      </div>
    )
  }

  const width = 800

  const height =
    large
      ? 300
      : 220

  const padX = 38
  const padY = 35

  const heat =
    items.map(
      (item) =>
        Number(
          item.heatIndex
        ) || 0
    )

  const air =
    items.map(
      (item) =>
        Number(
          item.temperature
        ) || 0
    )

  const all = [
    ...heat,
    ...air,
  ]

  const minimum =
    Math.min(...all) - 2

  const maximum =
    Math.max(...all) + 2

  const getX =
    (index) =>
      padX +
      index *
        (
          (
            width -
            padX * 2
          ) /
          Math.max(
            items.length - 1,
            1
          )
        )

  const getY =
    (value) =>
      height -
      padY -
      (
        (
          value -
          minimum
        ) /
        Math.max(
          maximum -
          minimum,
          1
        )
      ) *
      (
        height -
        padY * 2
      )

  const heatPath =
    heat.map(
      (value, index) =>
        `${index
          ? 'L'
          : 'M'} ${getX(
          index
        )} ${getY(
          value
        )}`
    ).join(' ')

  const airPath =
    air.map(
      (value, index) =>
        `${index
          ? 'L'
          : 'M'} ${getX(
          index
        )} ${getY(
          value
        )}`
    ).join(' ')

  const area =
    `${heatPath} ` +
    `L ${getX(
      items.length - 1
    )} ${height - padY} ` +
    `L ${getX(
      0
    )} ${height - padY} Z`

  const gradientId =
    `area-${large
      ? 'large'
      : 'small'}`

  const glowId =
    `glow-${large
      ? 'large'
      : 'small'}`

  return (
    <div
      className={
        large
          ? 'neon-chart large'
          : 'neon-chart'
      }
    >
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient
            id={gradientId}
            x1="0"
            y1="0"
            x2="0"
            y2="1"
          >
            <stop
              offset="0%"
              stopColor="#a855f7"
              stopOpacity=".30"
            />

            <stop
              offset="100%"
              stopColor="#a855f7"
              stopOpacity="0"
            />
          </linearGradient>

          <filter id={glowId}>
            <feGaussianBlur
              stdDeviation="5"
              result="blur"
            />

            <feMerge>
              <feMergeNode
                in="blur"
              />

              <feMergeNode
                in="SourceGraphic"
              />
            </feMerge>
          </filter>
        </defs>

        {[
          .2,
          .4,
          .6,
          .8,
        ].map(
          (position) => (
            <line
              key={position}
              x1="0"
              x2={width}
              y1={
                height *
                position
              }
              y2={
                height *
                position
              }
              className="grid-line"
            />
          )
        )}

        <path
          d={area}
          fill={`url(#${gradientId})`}
        />

        <path
          d={airPath}
          className="air-path"
        />

        <path
          d={heatPath}
          className="heat-path"
          filter={`url(#${glowId})`}
        />

        {items.map(
          (item, index) => (
            <circle
              key={index}
              cx={getX(index)}
              cy={getY(
                heat[index]
              )}
              r="4"
              className="chart-point"
            />
          )
        )}
      </svg>

      <div className="chart-labels">
        {items.map(
          (item, index) => (
            <span key={index}>
              {index === 0
                ? 'NOW'
                : item.time}
            </span>
          )
        )}
      </div>
    </div>
  )
}


function MiniMap({
  weather,
  riskColor,
}) {
  return (
    <div className="mini-map">
      <MapContainer
        center={[
          weather.latitude,
          weather.longitude,
        ]}
        zoom={11}
        zoomControl={false}
        dragging={false}
        scrollWheelZoom={false}
        doubleClickZoom={false}
        attributionControl={false}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <CircleMarker
          center={[
            weather.latitude,
            weather.longitude,
          ]}
          radius={10}
          pathOptions={{
            color: '#ffffff',
            weight: 3,
            fillColor:
              riskColor,
            fillOpacity: 1,
          }}
        />
      </MapContainer>
    </div>
  )
}


function MapUpdater({
  latitude,
  longitude,
}) {
  const map = useMap()

  useEffect(() => {
    map.flyTo(
      [
        latitude,
        longitude,
      ],
      Math.max(
        map.getZoom(),
        12
      ),
      {
        duration: 1.2,
      }
    )
  }, [
    latitude,
    longitude,
    map,
  ])

  return null
}


function MapClick({
  onSelect,
}) {
  useMapEvents({
    click(event) {
      onSelect(
        event.latlng.lat,
        event.latlng.lng
      )
    },
  })

  return null
}


function MobileDock({
  page,
  setPage,
}) {
  return (
    <nav className="mobile-dock">
      {NAV.map(
        ([id, icon, label]) => (
          <button
            key={id}
            className={
              page === id
                ? 'active'
                : ''
            }
            onClick={() =>
              setPage(id)
            }
          >
            <span>{icon}</span>
            <small>{label}</small>
          </button>
        )
      )}
    </nav>
  )
}


function Loading() {
  return (
    <div className="loading-screen">
      <div className="loading-orbit">
        <span>◉</span>
      </div>

      <h1>HeatShield</h1>

      <p>
        Synchronizing heat intelligence…
      </p>
    </div>
  )
}


function getRiskColor(level) {
  const colors = {
    low: '#32e6b0',
    caution: '#f5d04c',
    moderate: '#ff9d45',
    high: '#ff5f70',
    extreme: '#ff3db8',
  }

  return (
    colors[level] ||
    '#8b5cf6'
  )
}


function getWeatherVisual(
  code,
  isDay
) {
  if ([0].includes(code)) {
    return {
      icon:
        isDay
          ? '☀️'
          : '🌙',
      label:
        'Clear sky',
    }
  }

  if ([1, 2].includes(code)) {
    return {
      icon:
        isDay
          ? '🌤️'
          : '☁️',
      label:
        'Partly cloudy',
    }
  }

  if (
    [3, 45, 48].includes(
      code
    )
  ) {
    return {
      icon: '☁️',
      label: 'Cloudy',
    }
  }

  if (
    [
      51,
      53,
      55,
      61,
      63,
      65,
      80,
      81,
      82,
    ].includes(code)
  ) {
    return {
      icon: '🌧️',
      label: 'Rain',
    }
  }

  if (
    [
      95,
      96,
      99,
    ].includes(code)
  ) {
    return {
      icon: '⛈️',
      label:
        'Thunderstorm',
    }
  }

  return {
    icon:
      isDay
        ? '🌤️'
        : '☁️',
    label:
      'Current weather',
  }
}


// Peak hour = highest engine risk score when available; otherwise
// falls back to the highest Heat Index reading (weather data only).
function getPeak(
  items = []
) {
  return items.reduce(
    (best, item) => {
      if (!best) {
        return item
      }

      const a = item.riskScore
      const b = best.riskScore

      if (
        a !== null &&
        a !== undefined &&
        b !== null &&
        b !== undefined
      ) {
        return a > b
          ? item
          : best
      }

      if (
        a !== null &&
        a !== undefined
      ) {
        return item
      }

      if (
        b !== null &&
        b !== undefined
      ) {
        return best
      }

      return Number(
        item.heatIndex
      ) >
        Number(best.heatIndex)
        ? item
        : best
    },
    null
  )
}

// Everything the UI shows about risk is read from the engine result.
// This function only reshapes it — it never computes a risk.
function getRiskSummary(
  weather
) {
  const status =
    weather.riskStatus ||
    'loading'

  if (
    status === 'ready' &&
    weather.risk
  ) {
    return {
      status: 'ready',
      score:
        weather.risk.risk.score,
      category:
        weather.risk.risk.category,
      explanation:
        weather.risk.risk
          .explanation,
      factors:
        weather.risk.risk
          .factors || [],
      recommendations:
        weather.risk
          .recommendations || [],
      disclaimer:
        weather.risk.disclaimer ||
        FALLBACK_DISCLAIMER,
    }
  }

  return {
    status:
      status === 'error'
        ? 'error'
        : 'loading',
    score: null,
    category: null,
    explanation: '',
    factors: [],
    recommendations: [],
    errorMessage:
      weather.riskError
        ?.message ||
      RISK_ERROR_MESSAGE,
    disclaimer:
      FALLBACK_DISCLAIMER,
  }
}

const FACTOR_META = {
  temperature: {
    icon: '🌡',
    label: 'Temperature',
    reading: (w) =>
      `${w.temperature}°C`,
  },
  humidity: {
    icon: '💧',
    label: 'Humidity',
    reading: (w) =>
      `${w.humidity}%`,
  },
  wind: {
    icon: '💨',
    label: 'Wind',
    reading: (w) =>
      `${w.wind} km/h`,
  },
  solar_exposure: {
    icon: '☀',
    label: 'Solar Exposure',
    reading: (w) =>
      `${w.radiation} W/m²`,
  },
}

function capitalize(text) {
  const value = String(
    text || ''
  )

  return (
    value.charAt(0).toUpperCase() +
    value.slice(1)
  )
}
function buildAlerts(
  weather
) {
  const output = []

  const peak =
    getPeak(
      weather.trend
    )

  const summary =
    getRiskSummary(weather)

  // Risk alert text comes from the engine (category + explanation).
  if (
    summary.status === 'loading'
  ) {
    output.push({
      icon: '…',
      title:
        'Calculating heat risk...',
      text:
        'Waiting for the HeatShield Risk Engine.',
      tone: 'purple',
    })
  } else if (
    summary.status === 'error'
  ) {
    output.push({
      icon: '!',
      title:
        'Heat risk unavailable',
      text:
        summary.errorMessage,
      tone: 'warn',
    })
  } else if (
    ['High', 'Extreme'].includes(
      summary.category
    )
  ) {
    output.push({
      icon: '!',
      title:
        `${summary.category} heat risk now`,
      text:
        summary.explanation,
      tone: 'danger',
    })
  } else if (
    summary.category ===
    'Moderate'
  ) {
    output.push({
      icon: '△',
      title:
        'Moderate heat risk',
      text:
        summary.explanation,
      tone: 'warn',
    })
  } else {
    output.push({
      icon: '✓',
      title:
        'Low heat risk',
      text:
        summary.explanation,
      tone: 'good',
    })
  }

  if (
    summary.status === 'ready' &&
    peak &&
    peak.riskScore !== null &&
    peak.riskScore >
      summary.score + 5
  ) {
    output.push({
      icon: '↗',
      title:
        `Risk may rise to ${peak.category}`,
      text:
        `The forecast risk score reaches about ${peak.riskScore} around ${peak.time}.`,
      tone: 'purple',
    })
  }

  if (
    Number(
      weather.uvIndex
    ) >= 8
  ) {
    output.push({
      icon: '☀',
      title:
        `UV ${weather.uvCategory}`,
      text:
        'The daily maximum UV Index is elevated.',
      tone: 'warn',
    })
  }

  if (
    Number(
      weather.radiation
    ) >= 650
  ) {
    output.push({
      icon: '✦',
      title:
        'Strong solar radiation',
      text:
        `Current shortwave radiation is about ${weather.radiation} W/m².`,
      tone: 'purple',
    })
  }

  if (
    Number(
      weather.windGust
    ) >= 40
  ) {
    output.push({
      icon: '💨',
      title:
        'Strong wind gusts',
      text:
        `Current gusts are about ${weather.windGust} km/h.`,
      tone: 'good',
    })
  }

  return output.slice(
    0,
    4
  )
}
// Guidance text comes from the engine (config/thresholds.json ->
// "recommendations"); this only lays it out as cards.
function getRecommendations(
  weather
) {
  const summary =
    getRiskSummary(weather)

  if (
    summary.status !== 'ready' ||
    !summary.recommendations.length
  ) {
    return [
      {
        icon: '…',
        title:
          summary.status ===
          'error'
            ? 'Guidance unavailable'
            : 'Calculating heat risk...',
        text:
          summary.status ===
          'error'
            ? summary.errorMessage
            : 'Guidance appears once the Risk Engine responds.',
      },
    ]
  }

  const icons = [
    '💧',
    '◐',
    '👥',
    '⌚',
  ]

  return summary.recommendations.map(
    (text, index) => ({
      icon:
        icons[
          index % icons.length
        ],
      title:
        `${summary.category} risk · ${index + 1}`,
      text,
    })
  )
}
function metricLabel(key) {
  const labels = {
    temperature:
      'Air temperature',

    apparentTemperature:
      'Feels like',

    humidity:
      'Humidity',

    heatIndex:
      'Heat Index',
  }

  return labels[key]
}


function windCompass(
  degrees
) {
  if (
    degrees === null ||
    degrees === undefined
  ) {
    return '—'
  }

  const directions = [
    'N',
    'NE',
    'E',
    'SE',
    'S',
    'SW',
    'W',
    'NW',
  ]

  return directions[
    Math.round(
      Number(degrees) /
        45
    ) % 8
  ]
}


function fmt(value) {
  if (
    value === null ||
    value === undefined ||
    Number.isNaN(value)
  ) {
    return '—'
  }

  return value
}


function timeAgo(
  timestamp
) {
  const minutes =
    Math.max(
      0,
      Math.round(
        (
          Date.now() -
          timestamp
        ) /
          60000
      )
    )

  if (minutes < 1) {
    return 'just refreshed'
  }

  return `${minutes} min ago`
}


export default App