(function (global) {
  const microcopyModule = global?.FamiliarMicrocopy || (typeof require === 'function' ? require('../microcopy') : null)
  if (!microcopyModule || !microcopyModule.microcopy || !microcopyModule.formatters) {
    throw new Error('Familiar microcopy is unavailable')
  }
  const { microcopy, formatters } = microcopyModule

  const createUpdates = (options = {}) => {
    const elements = options.elements || {}
    const familiar = options.familiar || {}
    const setMessage = typeof options.setMessage === 'function' ? options.setMessage : () => {}

    const {
      updateButtons = [],
      updateStatuses = [],
      updateErrors = [],
      updateProgress = null,
      updateProgressBar = null,
      updateProgressLabel = null
    } = elements

    let isCheckingUpdates = false
    let currentProgress = 0

    const setProgressVisible = (visible) => {
      if (!updateProgress) {
        return
      }
      updateProgress.classList.toggle('hidden', !visible)
    }

    const setProgressBar = (value) => {
      if (!updateProgressBar) {
        return
      }
      updateProgressBar.style.width = `${value}%`
      if (typeof updateProgressBar.setAttribute === 'function') {
        updateProgressBar.setAttribute('aria-valuenow', String(value))
      }
    }

    const setProgressLabel = (message) => {
      if (!updateProgressLabel) {
        return
      }
      updateProgressLabel.textContent = message || ''
      updateProgressLabel.classList.toggle('hidden', !message)
    }

    const resetProgress = () => {
      currentProgress = 0
      setProgressBar(0)
      setProgressLabel('')
      setProgressVisible(false)
    }

    const updateProgressState = ({ percent, label }) => {
      if (!Number.isFinite(percent)) {
        return
      }
      const clamped = Math.max(0, Math.min(100, percent))
      const rounded = Math.round(clamped)
      currentProgress = rounded
      setProgressBar(rounded)
      setProgressLabel(label)
      setProgressVisible(true)
    }

    const handleDownloadProgress = (payload) => {
      const percent = payload && typeof payload.percent === 'number' ? payload.percent : null
      if (!Number.isFinite(percent)) {
        return
      }
      const clamped = Math.max(0, Math.min(100, percent))
      const rounded = Math.round(clamped)
      updateProgressState({
        percent: rounded,
        label: formatters.updateDownloading(rounded)
      })
    }

    const handleDownloadComplete = (payload) => {
      const version = payload && payload.version ? String(payload.version) : ''
      const label = formatters.updateDownloadComplete({ version })
      updateProgressState({ percent: 100, label })
    }

    const parseVersionParts = (value) => {
      if (typeof value !== 'string') {
        return []
      }
      const trimmed = value.trim().replace(/^v/i, '')
      const base = trimmed.split(/[-+]/)[0]
      return base.split('.').map((part) => Number.parseInt(part, 10)).filter(Number.isFinite)
    }

    const compareVersions = (next, current) => {
      const nextParts = parseVersionParts(next)
      const currentParts = parseVersionParts(current)
      const maxLength = Math.max(nextParts.length, currentParts.length)
      if (maxLength === 0) {
        return null
      }
      for (let i = 0; i < maxLength; i += 1) {
        const nextValue = nextParts[i] || 0
        const currentValue = currentParts[i] || 0
        if (nextValue > currentValue) {
          return 1
        }
        if (nextValue < currentValue) {
          return -1
        }
      }
      return 0
    }

    const setUpdateCheckState = (nextIsChecking) => {
      isCheckingUpdates = Boolean(nextIsChecking)
      updateButtons.forEach((button) => {
        button.disabled = isCheckingUpdates
      })
    }

    const handleCheck = async () => {
      if (!familiar.checkForUpdates) {
        setMessage(updateErrors, microcopy.dashboard.updates.errors.bridgeUnavailableRestart)
        return
      }

      setMessage(updateErrors, '')
      setMessage(updateStatuses, microcopy.dashboard.updates.statusCheckingForUpdates)
      setUpdateCheckState(true)

      try {
        const result = await familiar.checkForUpdates({ reason: 'manual' })
        if (result && result.ok) {
          const version = result.updateInfo && result.updateInfo.version
            ? result.updateInfo.version
            : ''
          const currentVersion = result.currentVersion || ''
          let message = microcopy.dashboard.updates.statusNoUpdatesFound
          if (version && currentVersion) {
            const comparison = compareVersions(version, currentVersion)
            if (comparison === 1) {
              message = formatters.updateAvailable({ currentVersion, version })
              console.log('Update available', { from: currentVersion, to: version })
            } else if (comparison === null) {
              console.warn('Unable to compare update versions', { version, currentVersion })
            }
          } else if (version) {
            console.warn('Missing current version; unable to compare update version', { version })
          }
          setMessage(updateStatuses, message)
          if (message === microcopy.dashboard.updates.statusNoUpdatesFound && currentProgress === 0) {
            resetProgress()
          }
        } else if (result && result.reason === 'checking') {
          setMessage(updateStatuses, microcopy.dashboard.updates.statusAlreadyCheckingForUpdates)
        } else if (result && result.reason === 'disabled') {
          setMessage(updateStatuses, '')
          setMessage(updateErrors, microcopy.dashboard.updates.errors.autoUpdatesDisabled)
          resetProgress()
        } else {
          setMessage(updateStatuses, '')
          setMessage(updateErrors, result?.message || microcopy.dashboard.updates.errors.failedToCheckForUpdates)
        }
      } catch (error) {
        console.error('Failed to check for updates', error)
        setMessage(updateStatuses, '')
        setMessage(updateErrors, microcopy.dashboard.updates.errors.failedToCheckForUpdates)
      } finally {
        setUpdateCheckState(false)
      }
    }

    if (updateButtons.length > 0) {
      updateButtons.forEach((button) => {
        button.addEventListener('click', () => {
          void handleCheck()
        })
      })
    }

    if (typeof familiar.onUpdateDownloadProgress === 'function') {
      familiar.onUpdateDownloadProgress((payload) => {
        handleDownloadProgress(payload)
      })
    }

    if (typeof familiar.onUpdateDownloaded === 'function') {
      familiar.onUpdateDownloaded((payload) => {
        handleDownloadComplete(payload)
      })
    }

    return {
      isReady: Boolean(familiar.checkForUpdates)
    }
  }

  const registry = global.FamiliarUpdates || {}
  registry.createUpdates = createUpdates
  global.FamiliarUpdates = registry

  // Export for Node/CommonJS so tests can require this module; browsers ignore this.
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = registry
  }
})(window)
