import React, { useState, useEffect } from 'react'

export default function App() {
  // Engine health status
  const [engineOnline, setEngineOnline] = useState(null) // null = checking, true/false
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState(null)

  // Input states with sensible default demo values
  const [temperature, setTemperature] = useState(34)
  const [temperatureUnit, setTemperatureUnit] = useState('C')
  const [humidity, setHumidity] = useState(65)
  const [windSpeed, setWindSpeed] = useState(12)
  const [windUnit, setWindUnit] = useState('km/h')
  const [solarExposure, setSolarExposure] = useState('partial') // 'shaded', 'partial', 'full_sun' or custom number
  const [solarMode, setSolarMode] = useState('category') // 'category' or 'numeric'
  const [solarNumeric, setSolarNumeric] = useState(0.5)
  const [locationName, setLocationName] = useState('Chennai')
  const [latitude, setLatitude] = useState(13.08)
  const [longitude, setLongitude] = useState(80.27)
  const [timestamp, setTimestamp] = useState('2026-09-27T14:30')

  // Result state
  const [riskData, setRiskData] = useState(null)

  // 1. Health check on mount and interval
  const checkHealth = async () => {
    try {
      const res = await fetch('/api/health')
      if (res.ok) {
        const data = await res.json()
        if (data.status === 'healthy') {
          setEngineOnline(true)
          return
        }
      }
      setEngineOnline(false)
    } catch (err) {
      setEngineOnline(false)
    }
  }

  useEffect(() => {
    checkHealth()
    const timer = setInterval(checkHealth, 10000)
    return () => clearInterval(timer)
  }, [])

  // 2. Submit / Calculate Heat Risk
  const handleSubmit = async (e) => {
    if (e) e.preventDefault()
    setLoading(true)
    setErrorMsg(null)

    // Build payload according to existing API contract
    const payload = {
      temperature: parseFloat(temperature),
      temperature_unit: temperatureUnit,
      relative_humidity: parseFloat(humidity),
      wind_speed: parseFloat(windSpeed),
      wind_unit: windUnit,
      solar_exposure: solarMode === 'category' ? solarExposure : parseFloat(solarNumeric)
    }

    if (locationName || latitude || longitude) {
      payload.location = {
        name: locationName || undefined,
        lat: latitude ? parseFloat(latitude) : undefined,
        lon: longitude ? parseFloat(longitude) : undefined
      }
    }

    if (timestamp) {
      // Add timezone offset if not provided
      payload.timestamp = timestamp.includes(':00') ? timestamp : `${timestamp}:00`
    }

    try {
      const res = await fetch('/api/risk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      if (!res.ok) {
        const errJson = await res.json().catch(() => null)
        const msg = errJson?.detail?.message || errJson?.detail || `API error (${res.status})`
        setErrorMsg(typeof msg === 'string' ? msg : JSON.stringify(msg))
        setLoading(false)
        return
      }

      const data = await res.json()
      setRiskData(data)
      setEngineOnline(true)
    } catch (err) {
      setErrorMsg('Failed to communicate with Risk Engine at /api/risk. Check if the backend is running.')
      setEngineOnline(false)
    } finally {
      setLoading(false)
    }
  }

  // Run initial calculation when app mounts
  useEffect(() => {
    handleSubmit()
  }, [])

  // Presets helper
  const applyPreset = (preset) => {
    if (preset === 'mild') {
      setTemperature(22)
      setTemperatureUnit('C')
      setHumidity(40)
      setWindSpeed(18)
      setWindUnit('km/h')
      setSolarMode('category')
      setSolarExposure('shaded')
    } else if (preset === 'moderate') {
      setTemperature(28)
      setTemperatureUnit('C')
      setHumidity(50)
      setWindSpeed(14)
      setWindUnit('km/h')
      setSolarMode('category')
      setSolarExposure('partial')
    } else if (preset === 'high') {
      setTemperature(34)
      setTemperatureUnit('C')
      setHumidity(65)
      setWindSpeed(12)
      setWindUnit('km/h')
      setSolarMode('category')
      setSolarExposure('partial')
    } else if (preset === 'extreme') {
      setTemperature(43)
      setTemperatureUnit('C')
      setHumidity(75)
      setWindSpeed(4)
      setWindUnit('km/h')
      setSolarMode('category')
      setSolarExposure('full_sun')
    }
  }

  // Visual category color helper
  const getCategoryColor = (cat) => {
    const c = (cat || '').toLowerCase()
    if (c === 'low') return { hex: '#10b981', bg: 'rgba(16, 185, 129, 0.15)', border: 'rgba(16, 185, 129, 0.3)' }
    if (c === 'moderate') return { hex: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)', border: 'rgba(245, 158, 11, 0.3)' }
    if (c === 'high') return { hex: '#f97316', bg: 'rgba(249, 115, 22, 0.15)', border: 'rgba(249, 115, 22, 0.3)' }
    return { hex: '#ef4444', bg: 'rgba(239, 68, 68, 0.2)', border: 'rgba(239, 68, 68, 0.4)' }
  }

  const categoryColor = getCategoryColor(riskData?.risk?.category)
  const score = riskData?.risk?.score ?? 0
  const circumference = 2 * Math.PI * 72 // r=72 -> 452.4
  const strokeDashoffset = circumference - (score / 100) * circumference

  return (
    <div style={{ maxWidth: '1360px', margin: '0 auto', padding: '24px 20px', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      
      {/* 1. Header */}
      <header style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '18px 24px',
        marginBottom: '28px',
        borderRadius: '16px',
        background: 'rgba(18, 25, 41, 0.85)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        backdropFilter: 'blur(16px)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '42px',
            height: '42px',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, #f97316, #ef4444)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 20px rgba(249, 115, 22, 0.3)'
          }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="white">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>
            </svg>
          </div>
          <div>
            <h1 style={{ fontSize: '1.45rem', fontWeight: 800, letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: '10px' }}>
              HeatShield
              <span style={{
                fontSize: '0.72rem',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                background: 'rgba(249, 115, 22, 0.15)',
                color: '#fb923c',
                padding: '3px 9px',
                borderRadius: '6px',
                border: '1px solid rgba(249, 115, 22, 0.3)'
              }}>
                Person 2 Demo
              </span>
            </h1>
            <p style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
              AI Heat-Risk Engine — Person 2 Demo
            </p>
          </div>
        </div>

        {/* Status Indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '0.84rem',
            fontWeight: 600,
            padding: '7px 14px',
            borderRadius: '30px',
            background: engineOnline ? 'rgba(16, 185, 129, 0.12)' : 'rgba(239, 68, 68, 0.12)',
            border: `1px solid ${engineOnline ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
            color: engineOnline ? '#34d399' : '#f87171'
          }}>
            <span style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: engineOnline ? '#10b981' : '#ef4444',
              boxShadow: `0 0 10px ${engineOnline ? '#10b981' : '#ef4444'}`
            }}></span>
            {engineOnline === null ? 'Checking Engine...' : engineOnline ? '● Risk Engine Online' : '● Risk Engine Offline'}
          </div>

          <a href="http://127.0.0.1:8000/docs" target="_blank" rel="noreferrer" style={{
            fontSize: '0.84rem',
            color: '#94a3b8',
            textDecoration: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '7px 12px',
            borderRadius: '8px',
            background: 'rgba(255, 255, 255, 0.04)',
            border: '1px solid rgba(255, 255, 255, 0.08)'
          }}>
            API Docs ↗
          </a>
        </div>
      </header>

      {/* Main Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(360px, 460px) 1fr',
        gap: '28px',
        alignItems: 'start',
        flex: 1
      }}>

        {/* 2. Input Section */}
        <section style={{
          background: 'rgba(18, 25, 41, 0.75)',
          backdropFilter: 'blur(16px)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '18px',
          padding: '24px',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.25)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
            <h2 style={{ fontSize: '1.15rem', fontWeight: 700 }}>Environmental Inputs</h2>
            <span style={{ fontSize: '0.78rem', color: '#64748b' }}>Simulate Conditions</span>
          </div>

          {/* Quick Presets */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
            <button type="button" onClick={() => applyPreset('mild')} style={presetBtnStyle}>Pleasant</button>
            <button type="button" onClick={() => applyPreset('moderate')} style={presetBtnStyle}>Warm</button>
            <button type="button" onClick={() => applyPreset('high')} style={presetBtnStyle}>High Risk (Default)</button>
            <button type="button" onClick={() => applyPreset('extreme')} style={presetBtnStyle}>Extreme Heat</button>
          </div>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            
            {/* Temperature */}
            <div>
              <div style={labelRowStyle}>
                <label style={labelStyle}>Temperature</label>
                <span style={monoValueStyle}>{temperature}°{temperatureUnit}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px', gap: '10px' }}>
                <input
                  type="number"
                  step="0.5"
                  value={temperature}
                  onChange={(e) => setTemperature(e.target.value)}
                  style={inputStyle}
                  required
                />
                <select
                  value={temperatureUnit}
                  onChange={(e) => setTemperatureUnit(e.target.value)}
                  style={selectStyle}
                >
                  <option value="C">°C</option>
                  <option value="F">°F</option>
                </select>
              </div>
            </div>

            {/* Relative Humidity */}
            <div>
              <div style={labelRowStyle}>
                <label style={labelStyle}>Relative Humidity (%)</label>
                <span style={monoValueStyle}>{humidity}%</span>
              </div>
              <input
                type="number"
                min="0"
                max="100"
                step="1"
                value={humidity}
                onChange={(e) => setHumidity(e.target.value)}
                style={inputStyle}
                required
              />
            </div>

            {/* Wind Speed */}
            <div>
              <div style={labelRowStyle}>
                <label style={labelStyle}>Wind Speed</label>
                <span style={monoValueStyle}>{windSpeed} {windUnit}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px', gap: '10px' }}>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={windSpeed}
                  onChange={(e) => setWindSpeed(e.target.value)}
                  style={inputStyle}
                  required
                />
                <select
                  value={windUnit}
                  onChange={(e) => setWindUnit(e.target.value)}
                  style={selectStyle}
                >
                  <option value="km/h">km/h</option>
                  <option value="m/s">m/s</option>
                </select>
              </div>
            </div>

            {/* Solar Exposure */}
            <div>
              <div style={labelRowStyle}>
                <label style={labelStyle}>Solar Exposure</label>
                <button
                  type="button"
                  onClick={() => setSolarMode(solarMode === 'category' ? 'numeric' : 'category')}
                  style={{ background: 'none', border: 'none', color: '#f97316', fontSize: '0.78rem', cursor: 'pointer', textDecoration: 'underline' }}
                >
                  {solarMode === 'category' ? 'Switch to Numeric' : 'Switch to Category'}
                </button>
              </div>

              {solarMode === 'category' ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', background: '#0a0d16', padding: '4px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.08)' }}>
                  {['shaded', 'partial', 'full_sun'].map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setSolarExposure(cat)}
                      style={{
                        padding: '8px 4px',
                        fontSize: '0.8rem',
                        fontWeight: 600,
                        textTransform: 'capitalize',
                        borderRadius: '6px',
                        border: 'none',
                        cursor: 'pointer',
                        background: solarExposure === cat ? 'rgba(249, 115, 22, 0.2)' : 'transparent',
                        color: solarExposure === cat ? '#fb923c' : '#94a3b8',
                        outline: solarExposure === cat ? '1px solid rgba(249, 115, 22, 0.4)' : 'none'
                      }}
                    >
                      {cat.replace('_', ' ')}
                    </button>
                  ))}
                </div>
              ) : (
                <input
                  type="number"
                  min="0"
                  max="1"
                  step="0.05"
                  value={solarNumeric}
                  onChange={(e) => setSolarNumeric(e.target.value)}
                  placeholder="0.0 (shaded) to 1.0 (full sun)"
                  style={inputStyle}
                />
              )}
            </div>

            {/* Location context */}
            <div>
              <label style={labelStyle}>Location Name</label>
              <input
                type="text"
                value={locationName}
                onChange={(e) => setLocationName(e.target.value)}
                placeholder="e.g. Chennai"
                style={{ ...inputStyle, marginBottom: '8px' }}
              />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                <input
                  type="number"
                  step="0.0001"
                  value={latitude}
                  onChange={(e) => setLatitude(e.target.value)}
                  placeholder="Latitude"
                  style={inputStyle}
                />
                <input
                  type="number"
                  step="0.0001"
                  value={longitude}
                  onChange={(e) => setLongitude(e.target.value)}
                  placeholder="Longitude"
                  style={inputStyle}
                />
              </div>
            </div>

            {/* Timestamp */}
            <div>
              <label style={labelStyle}>Timestamp</label>
              <input
                type="datetime-local"
                value={timestamp}
                onChange={(e) => setTimestamp(e.target.value)}
                style={inputStyle}
              />
            </div>

            {/* Calculate Button */}
            <button
              type="submit"
              disabled={loading}
              style={{
                marginTop: '10px',
                padding: '14px',
                borderRadius: '10px',
                border: 'none',
                background: 'linear-gradient(135deg, #f97316, #ea580c)',
                color: 'white',
                fontWeight: 700,
                fontSize: '0.98rem',
                cursor: loading ? 'not-allowed' : 'pointer',
                boxShadow: '0 4px 20px rgba(249, 115, 22, 0.3)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                transition: 'all 0.2s'
              }}
            >
              {loading ? 'Evaluating Model...' : 'Calculate Heat Risk'}
            </button>
          </form>
        </section>

        {/* 4 & 5. Result Dashboard */}
        <section style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* Error Banner */}
          {errorMsg && (
            <div style={{
              padding: '14px 18px',
              borderRadius: '12px',
              background: 'rgba(239, 68, 68, 0.15)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#fca5a5',
              fontSize: '0.88rem',
              display: 'flex',
              alignItems: 'center',
              gap: '10px'
            }}>
              <span style={{ fontSize: '1.1rem' }}>⚠️</span>
              <div>
                <strong>Error: </strong>
                {errorMsg}
              </div>
            </div>
          )}

          {/* Main Score Hero Card */}
          <div style={{
            background: 'rgba(18, 25, 41, 0.75)',
            backdropFilter: 'blur(16px)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '18px',
            padding: '28px',
            display: 'grid',
            gridTemplateColumns: '170px 1fr',
            gap: '28px',
            alignItems: 'center',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.25)'
          }}>
            
            {/* Visual Circular Gauge */}
            <div style={{ position: 'relative', width: '160px', height: '160px', margin: '0 auto' }}>
              <svg style={{ transform: 'rotate(-90deg)', width: '160px', height: '160px' }}>
                <circle
                  cx="80"
                  cy="80"
                  r="72"
                  fill="none"
                  stroke="rgba(255, 255, 255, 0.06)"
                  strokeWidth="12"
                />
                <circle
                  cx="80"
                  cy="80"
                  r="72"
                  fill="none"
                  stroke={categoryColor.hex}
                  strokeWidth="12"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={strokeDashoffset}
                  style={{ transition: 'stroke-dashoffset 0.8s ease, stroke 0.4s' }}
                />
              </svg>
              <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '2.5rem', fontWeight: 800, lineHeight: 1 }}>
                  {riskData ? riskData.risk.score : '--'}
                </div>
                <div style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 600, marginTop: '4px' }}>
                  / 100
                </div>
              </div>
            </div>

            {/* Category & Narrative */}
            <div>
              <div style={{ fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#64748b', marginBottom: '6px' }}>
                Risk Evaluation
              </div>
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 16px',
                borderRadius: '24px',
                background: categoryColor.bg,
                border: `1px solid ${categoryColor.border}`,
                color: categoryColor.hex,
                fontSize: '1.25rem',
                fontWeight: 800,
                marginBottom: '14px'
              }}>
                {riskData ? riskData.risk.category.toUpperCase() : 'AWAITING INPUT'}
              </div>
              <p style={{ fontSize: '0.98rem', color: '#e2e8f0', lineHeight: 1.6 }}>
                {riskData ? riskData.risk.explanation : 'Provide environmental conditions on the left to evaluate heat risk.'}
              </p>
            </div>
          </div>

          {/* 6. Why this risk? Contributing Factors */}
          <div style={{
            background: 'rgba(18, 25, 41, 0.75)',
            backdropFilter: 'blur(16px)',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            borderRadius: '18px',
            padding: '24px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.25)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 700 }}>Why this risk?</h3>
              <span style={{ fontSize: '0.78rem', color: '#64748b' }}>Ranked Contributing Factors</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
              {riskData?.risk?.factors?.map((f, i) => {
                const isHigh = f.impact === 'high'
                const isMod = f.impact === 'moderate'
                const badgeColor = isHigh ? '#ef4444' : isMod ? '#f59e0b' : '#10b981'
                const badgeBg = isHigh ? 'rgba(239, 68, 68, 0.15)' : isMod ? 'rgba(245, 158, 11, 0.15)' : 'rgba(16, 185, 129, 0.15)'

                return (
                  <div key={i} style={{
                    background: '#0a0d16',
                    border: '1px solid rgba(255, 255, 255, 0.06)',
                    borderRadius: '12px',
                    padding: '14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.88rem', fontWeight: 600, textTransform: 'capitalize' }}>
                        {f.factor.replace('_', ' ')}
                      </span>
                      <span style={{
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        textTransform: 'uppercase',
                        padding: '2px 8px',
                        borderRadius: '4px',
                        color: badgeColor,
                        background: badgeBg
                      }}>
                        {f.impact} contribution
                      </span>
                    </div>

                    <div style={{ width: '100%', height: '5px', background: 'rgba(255, 255, 255, 0.06)', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{
                        height: '100%',
                        width: `${Math.min(100, f.contribution * 1.8)}%`,
                        background: badgeColor,
                        borderRadius: '3px'
                      }} />
                    </div>

                    <div style={{ fontSize: '0.78rem', fontFamily: 'var(--font-mono)', color: '#64748b', textAlign: 'right' }}>
                      +{f.contribution.toFixed(1)} impact score
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Environmental Readings & Metadata Details */}
          {riskData && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: '10px'
            }}>
              <div style={statBoxStyle}>
                <div style={statLabelStyle}>Temperature</div>
                <div style={statValStyle}>{riskData.environment.temperature}°{riskData.environment.temperature_unit}</div>
              </div>
              <div style={statBoxStyle}>
                <div style={statLabelStyle}>Humidity</div>
                <div style={statValStyle}>{riskData.environment.humidity}%</div>
              </div>
              <div style={statBoxStyle}>
                <div style={statLabelStyle}>Wind Speed</div>
                <div style={statValStyle}>{riskData.environment.wind_speed} {riskData.environment.wind_unit}</div>
              </div>
              <div style={statBoxStyle}>
                <div style={statLabelStyle}>Solar Load</div>
                <div style={statValStyle}>{riskData.environment.solar_exposure ?? 'N/A'}</div>
              </div>
              <div style={statBoxStyle}>
                <div style={statLabelStyle}>Model Name</div>
                <div style={{ ...statValStyle, fontSize: '0.85rem' }}>{riskData.metadata.model}</div>
              </div>
              <div style={statBoxStyle}>
                <div style={statLabelStyle}>Heat Index Method</div>
                <div style={{ ...statValStyle, fontSize: '0.85rem' }}>{riskData.metadata.heat_index_method}</div>
              </div>
            </div>
          )}

          {/* 7. Disclaimer */}
          <div style={{
            padding: '14px 18px',
            background: 'rgba(249, 115, 22, 0.06)',
            borderLeft: '3px solid #f97316',
            borderRadius: '0 10px 10px 0',
            fontSize: '0.82rem',
            color: '#94a3b8',
            lineHeight: 1.6
          }}>
            {riskData?.disclaimer || "This score is an environmental heat-exposure risk indicator. It is not a medical diagnostic tool and does not predict individual medical outcomes."}
          </div>

        </section>
      </div>

      <footer style={{
        marginTop: '32px',
        borderTop: '1px solid rgba(255, 255, 255, 0.08)',
        padding: '20px 0',
        textAlign: 'center',
        fontSize: '0.8rem',
        color: '#64748b'
      }}>
        HeatShield Multi-Person Architecture &bull; Person 2 AI/Risk Engine &bull; Communicating directly with FastAPI /api/risk
      </footer>

    </div>
  )
}

// Styling Constants
const inputStyle = {
  width: '100%',
  background: '#0a0d16',
  border: '1px solid rgba(255, 255, 255, 0.08)',
  borderRadius: '8px',
  color: '#fff',
  padding: '9px 12px',
  fontSize: '0.9rem',
  outline: 'none'
}

const selectStyle = {
  width: '100%',
  background: '#0a0d16',
  border: '1px solid rgba(255, 255, 255, 0.08)',
  borderRadius: '8px',
  color: '#fff',
  padding: '9px 10px',
  fontSize: '0.9rem',
  outline: 'none'
}

const labelStyle = {
  fontSize: '0.85rem',
  color: '#94a3b8',
  fontWeight: 500,
  display: 'block',
  marginBottom: '6px'
}

const labelRowStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: '6px'
}

const monoValueStyle = {
  fontFamily: 'var(--font-mono)',
  fontSize: '0.85rem',
  color: '#f97316',
  fontWeight: 600
}

const presetBtnStyle = {
  background: 'rgba(255, 255, 255, 0.04)',
  border: '1px solid rgba(255, 255, 255, 0.08)',
  color: '#94a3b8',
  padding: '5px 10px',
  borderRadius: '6px',
  fontSize: '0.78rem',
  fontWeight: 500,
  cursor: 'pointer'
}

const statBoxStyle = {
  background: 'rgba(18, 25, 41, 0.5)',
  border: '1px solid rgba(255, 255, 255, 0.06)',
  borderRadius: '10px',
  padding: '12px 14px'
}

const statLabelStyle = {
  fontSize: '0.72rem',
  color: '#64748b',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
  marginBottom: '4px'
}

const statValStyle = {
  fontSize: '0.95rem',
  fontWeight: 700,
  color: '#f8fafc',
  fontFamily: 'var(--font-mono)'
}
