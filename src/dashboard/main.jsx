import React from 'react'
import { createRoot } from 'react-dom/client'

import DashboardShellController from './components/DashboardShellController'
import { DashboardErrorBoundary } from './components/DashboardErrorBoundary'

function getDashboardMicrocopy() {
  return window.FamiliarMicrocopySource?.microcopy || window.FamiliarMicrocopy?.microcopy || {}
}

function toDisplayText(value) {
  if (value === null || value === undefined) {
    return ''
  }
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  if (value instanceof Error) {
    return value.message || 'Error'
  }
  if (typeof value === 'object' && typeof value.message === 'string') {
    return value.message
  }
  return ''
}

function getAppName(microcopy) {
  return (
    toDisplayText(microcopy?.app?.name) ||
    toDisplayText(microcopy?.dashboard?.html?.appName) ||
    'Familiar'
  )
}

function getInitializationErrorCopy(microcopy) {
  return (
    toDisplayText(microcopy?.dashboard?.errors?.reactInitializationFailed) ||
    'Unable to initialize the React dashboard.'
  )
}

function setInlineFallback(message, microcopy = getDashboardMicrocopy()) {
  const fallback = document.getElementById('familiar-dashboard-react-root')
  if (!fallback) {
    return
  }
  const safeMessage = toDisplayText(message)
  fallback.innerHTML = `
    <div class="react-fallback">
      <h1>${getAppName(microcopy)}</h1>
      <p>${getInitializationErrorCopy(microcopy)}</p>
      <p>${safeMessage}</p>
    </div>
  `
}

function DashboardRoot() {
  const familiar = window.familiar || {}
  const microcopy = getDashboardMicrocopy()
  const formatters = window.FamiliarMicrocopy?.formatters || null

  const rootElement = document.getElementById('familiar-dashboard-react-root')
  if (!rootElement) {
    return
  }

  const root = createRoot(rootElement)
  root.render(
    <DashboardErrorBoundary microcopy={microcopy}>
      <DashboardShellController familiar={familiar} microcopy={microcopy} formatters={formatters} />
    </DashboardErrorBoundary>
  )
}

try {
  DashboardRoot()
} catch (error) {
  console.error('Failed to initialize Familiar React dashboard', error)
  const message = error && typeof error.message === 'string'
    ? error.message
    : 'unknown error'
  setInlineFallback(message, getDashboardMicrocopy())
}

window.addEventListener('error', (event) => {
  const message = event?.error?.message || event?.message || 'unknown error'
  console.error('Runtime error in React dashboard', event.error || message)
  setInlineFallback(message, getDashboardMicrocopy())
})

window.addEventListener('unhandledrejection', (event) => {
  const message = event?.reason && event.reason.message
    ? event.reason.message
    : toDisplayText(event?.reason) || 'unhandled rejection'
  console.error('Unhandled rejection in React dashboard', event.reason)
  setInlineFallback(message, getDashboardMicrocopy())
})
