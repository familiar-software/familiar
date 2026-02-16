(function registerRecordingStatusIndicator(global) {
  const INDICATOR_STATUSES = Object.freeze({
    OFF: 'off',
    PAUSED: 'paused',
    PERMISSION_NEEDED: 'permission-needed',
    RECORDING: 'recording',
    IDLE: 'idle'
  })

  const ACTIVE_STATES = new Set(['recording', 'idleGrace'])
  const NON_ERROR_PERMISSION_STATUSES = new Set(['granted', 'unavailable'])

  const STATUS_VISUALS = Object.freeze({
    [INDICATOR_STATUSES.OFF]: Object.freeze({
      label: 'Off',
      dotClass: 'bg-zinc-400',
      trayColorHex: '#9ca3af'
    }),
    [INDICATOR_STATUSES.PAUSED]: Object.freeze({
      label: 'Paused',
      dotClass: 'bg-amber-500',
      trayColorHex: '#f59e0b'
    }),
    [INDICATOR_STATUSES.PERMISSION_NEEDED]: Object.freeze({
      label: 'Permission needed',
      dotClass: 'bg-red-500',
      trayColorHex: '#ef4444'
    }),
    [INDICATOR_STATUSES.RECORDING]: Object.freeze({
      label: 'Capturing',
      dotClass: 'bg-emerald-500',
      trayColorHex: '#10b981'
    }),
    [INDICATOR_STATUSES.IDLE]: Object.freeze({
      label: 'Idle',
      dotClass: 'bg-zinc-400',
      trayColorHex: '#9ca3af'
    })
  })

  function isCaptureActiveState(state) {
    return ACTIVE_STATES.has(state)
  }

  function hasPermissionIssue({ state, permissionGranted, permissionStatus } = {}) {
    if (isCaptureActiveState(state)) {
      return false
    }
    if (permissionGranted === false) {
      return true
    }
    if (typeof permissionStatus !== 'string') {
      return false
    }
    return !NON_ERROR_PERMISSION_STATUSES.has(permissionStatus)
  }

  function resolveRecordingIndicatorStatus({
    enabled,
    state,
    manualPaused,
    permissionGranted,
    permissionStatus
  } = {}) {
    if (!enabled) {
      return INDICATOR_STATUSES.OFF
    }
    if (manualPaused) {
      return INDICATOR_STATUSES.PAUSED
    }
    if (hasPermissionIssue({ state, permissionGranted, permissionStatus })) {
      return INDICATOR_STATUSES.PERMISSION_NEEDED
    }
    if (isCaptureActiveState(state)) {
      return INDICATOR_STATUSES.RECORDING
    }
    return INDICATOR_STATUSES.IDLE
  }

  function getRecordingIndicatorVisuals(input = {}) {
    const status = resolveRecordingIndicatorStatus(input)
    return {
      status,
      ...STATUS_VISUALS[status]
    }
  }

  const api = {
    INDICATOR_STATUSES,
    STATUS_VISUALS,
    isCaptureActiveState,
    hasPermissionIssue,
    resolveRecordingIndicatorStatus,
    getRecordingIndicatorVisuals
  }

  global.FamiliarRecordingStatusIndicator = api

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api
  }
})(typeof window !== 'undefined' ? window : global)
