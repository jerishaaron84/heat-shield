import { useState } from 'react'
import {
  evaluateAlert,
  requestBrowserNotifications,
} from './alertEngine'

export default function Person4AlertBanner({ weather }) {
  const [notificationsEnabled, setNotificationsEnabled] = useState(
    typeof Notification !== 'undefined' &&
      Notification.permission === 'granted'
  )

  const alert = evaluateAlert(weather)

  async function enableNotifications() {
    const result = await requestBrowserNotifications()

    if (result.granted) {
      setNotificationsEnabled(true)
    }
  }

  const tone =
    alert.severity === 'extreme'
      ? 'p4-alert-extreme'
      : alert.severity === 'high'
        ? 'p4-alert-high'
        : alert.severity === 'moderate'
          ? 'p4-alert-moderate'
          : 'p4-alert-normal'

  return (
    <section
      className={`p4-alert-banner ${tone}`}
      role={alert.active ? 'alert' : 'status'}
      aria-live="polite"
    >
      <div className="p4-alert-icon" aria-hidden="true">
        {alert.severity === 'extreme'
          ? '‼'
          : alert.severity === 'high'
            ? '!'
            : alert.severity === 'moderate'
              ? '△'
              : '✓'}
      </div>

      <div className="p4-alert-copy">
        <strong>{alert.title}</strong>
        <span>{alert.message}</span>

        {alert.active && alert.recommendations?.length > 0 && (
          <small>{alert.recommendations[0]}</small>
        )}
      </div>

      <div className="p4-alert-actions">
        {!notificationsEnabled &&
          typeof Notification !== 'undefined' && (
            <button
              type="button"
              onClick={enableNotifications}
              className="p4-notification-btn"
            >
              Enable browser alerts
            </button>
          )}
      </div>
    </section>
  )
}
