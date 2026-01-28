(function (global) {
  const createUpdates = (options = {}) => {
    const elements = options.elements || {}
    const jiminy = options.jiminy || {}
    const setMessage = typeof options.setMessage === 'function' ? options.setMessage : () => {}

    const {
      updateButtons = [],
      updateStatuses = [],
      updateErrors = []
    } = elements

    let isCheckingUpdates = false

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
      if (!jiminy.checkForUpdates) {
        setMessage(updateErrors, 'Update bridge unavailable. Restart the app.')
        return
      }

      setMessage(updateErrors, '')
      setMessage(updateStatuses, 'Checking for updates...')
      setUpdateCheckState(true)

      try {
        const result = await jiminy.checkForUpdates({ reason: 'manual' })
        if (result && result.ok) {
          const version = result.updateInfo && result.updateInfo.version
            ? result.updateInfo.version
            : ''
          const currentVersion = result.currentVersion || ''
          let message = 'No updates found.'
          if (version && currentVersion) {
            const comparison = compareVersions(version, currentVersion)
            if (comparison === 1) {
              message = `Update available: ${currentVersion} -> ${version}. Check the download prompt.`
              console.log('Update available', { from: currentVersion, to: version })
            } else if (comparison === null) {
              console.warn('Unable to compare update versions', { version, currentVersion })
            }
          } else if (version) {
            console.warn('Missing current version; unable to compare update version', { version })
          }
          setMessage(updateStatuses, message)
        } else if (result && result.reason === 'checking') {
          setMessage(updateStatuses, 'Already checking for updates...')
        } else if (result && result.reason === 'disabled') {
          setMessage(updateStatuses, '')
          setMessage(updateErrors, 'Auto-updates are disabled in this build.')
        } else {
          setMessage(updateStatuses, '')
          setMessage(updateErrors, result?.message || 'Failed to check for updates.')
        }
      } catch (error) {
        console.error('Failed to check for updates', error)
        setMessage(updateStatuses, '')
        setMessage(updateErrors, 'Failed to check for updates.')
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

    return {
      isReady: Boolean(jiminy.checkForUpdates)
    }
  }

  const registry = global.JiminyUpdates || {}
  registry.createUpdates = createUpdates
  global.JiminyUpdates = registry

  // Export for Node/CommonJS so tests can require this module; browsers ignore this.
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = registry
  }
})(window)
