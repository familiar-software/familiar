(function registerStorageDeleteWindow(global) {
  const STORAGE_DELETE_WINDOW = Object.freeze({
    MINUTES_15: '15m',
    HOUR_1: '1h',
    DAY_1: '1d',
    DAYS_7: '7d',
    ALL_TIME: 'all'
  })

  const STORAGE_DELETE_WINDOW_PRESETS = Object.freeze({
    [STORAGE_DELETE_WINDOW.MINUTES_15]: { durationMs: 15 * 60 * 1000, label: '15 minutes' },
    [STORAGE_DELETE_WINDOW.HOUR_1]: { durationMs: 60 * 60 * 1000, label: '1 hour' },
    [STORAGE_DELETE_WINDOW.DAY_1]: { durationMs: 24 * 60 * 60 * 1000, label: '1 day' },
    [STORAGE_DELETE_WINDOW.DAYS_7]: { durationMs: 7 * 24 * 60 * 60 * 1000, label: '7 days' },
    [STORAGE_DELETE_WINDOW.ALL_TIME]: { durationMs: null, label: 'all time' }
  })

  const DEFAULT_STORAGE_DELETE_WINDOW = STORAGE_DELETE_WINDOW.MINUTES_15

  const api = {
    STORAGE_DELETE_WINDOW,
    STORAGE_DELETE_WINDOW_PRESETS,
    DEFAULT_STORAGE_DELETE_WINDOW
  }
  global.FamiliarStorageDeleteWindow = api

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api
  }
})(typeof window !== 'undefined' ? window : global)
