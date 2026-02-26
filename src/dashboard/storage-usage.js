(function registerStorageUsage(global) {
  const microcopyModule = global?.FamiliarMicrocopy || (typeof require === 'function' ? require('../microcopy') : null)
  if (!microcopyModule || !microcopyModule.microcopy) {
    throw new Error('Familiar microcopy is unavailable')
  }
  const { microcopy } = microcopyModule

  function formatBytes(bytes) {
    const value = Number.isFinite(bytes) ? Math.max(0, bytes) : 0
    if (value === 0) {
      return '0 B'
    }
    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    const exponent = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1)
    const scaled = value / (1024 ** exponent)
    const decimals = scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2
    return `${scaled.toFixed(decimals)} ${units[exponent]}`
  }

  function toPercent(value, total) {
    if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0) {
      return 0
    }
    return Math.max(0, Math.min(100, (value / total) * 100))
  }

  const createStorageUsage = (options = {}) => {
    const familiar = options.familiar || {}
    const setMessage = typeof options.setMessage === 'function' ? options.setMessage : () => {}
    const elements = options.elements || {}

    const {
      totalLabel = null,
      statusElements = [],
      errorElements = [],
      loadingContainer = null,
      loadedContainer = null,
      loadingIndicator = null,
      computingTag = null,
      screenshotsValueLabel = null,
      steelsMarkdownValueLabel = null,
      systemValueLabel = null,
      screenshotsBar = null,
      steelsMarkdownBar = null,
      systemBar = null
    } = elements

    function setLoadingState(isLoading) {
      if (loadingContainer) {
        loadingContainer.classList.toggle('hidden', !isLoading)
      }
      if (loadedContainer) {
        loadedContainer.classList.toggle('hidden', isLoading)
      }
      if (loadingIndicator) {
        loadingIndicator.classList.toggle('hidden', !isLoading)
        loadingIndicator.classList.toggle('flex', isLoading)
      }
      if (computingTag) {
        computingTag.classList.toggle('hidden', !isLoading)
      }
      if (totalLabel) {
        totalLabel.classList.toggle('hidden', isLoading)
      }
    }

    function updateBar(barElement, value, total) {
      if (!barElement) {
        return
      }
      const percent = toPercent(value, total)
      barElement.style.width = `${percent}%`
      barElement.title = `${percent.toFixed(1)}%`
    }

    function updateUI(usage = {}) {
      const totalBytes = Number.isFinite(usage.totalBytes) ? usage.totalBytes : 0
      const screenshotsBytes = Number.isFinite(usage.screenshotsBytes) ? usage.screenshotsBytes : 0
      const steelsMarkdownBytes = Number.isFinite(usage.steelsMarkdownBytes) ? usage.steelsMarkdownBytes : 0
      const systemBytes = Number.isFinite(usage.systemBytes) ? usage.systemBytes : 0

      if (totalLabel) {
        totalLabel.textContent = `${microcopy.dashboard.storageUsage.totalPrefix} ${formatBytes(totalBytes)}`
      }
      if (screenshotsValueLabel) {
        screenshotsValueLabel.textContent = formatBytes(screenshotsBytes)
      }
      if (steelsMarkdownValueLabel) {
        steelsMarkdownValueLabel.textContent = formatBytes(steelsMarkdownBytes)
      }
      if (systemValueLabel) {
        systemValueLabel.textContent = formatBytes(systemBytes)
      }

      updateBar(screenshotsBar, screenshotsBytes, totalBytes)
      updateBar(steelsMarkdownBar, steelsMarkdownBytes, totalBytes)
      updateBar(systemBar, systemBytes, totalBytes)
    }

    async function refresh() {
      if (typeof familiar.getStorageUsageBreakdown !== 'function') {
        setLoadingState(false)
        setMessage(errorElements, microcopy.dashboard.storageUsage.errors.unavailableRestart)
        return null
      }

      setLoadingState(true)
      setMessage(statusElements, '')
      setMessage(errorElements, '')

      try {
        const result = await familiar.getStorageUsageBreakdown()
        if (result && result.ok) {
          updateUI(result)
          setLoadingState(false)
          setMessage(statusElements, '')
          return result
        }
        setLoadingState(false)
        setMessage(statusElements, '')
        setMessage(errorElements, result?.message || microcopy.dashboard.storageUsage.errors.failedToLoad)
      } catch (error) {
        console.error('Failed to load storage usage breakdown', error)
        setLoadingState(false)
        setMessage(statusElements, '')
        setMessage(errorElements, microcopy.dashboard.storageUsage.errors.failedToLoad)
      }

      return null
    }

    return {
      refresh,
      updateUI
    }
  }

  const registry = global.FamiliarStorageUsage || {}
  registry.createStorageUsage = createStorageUsage
  registry.formatBytes = formatBytes
  global.FamiliarStorageUsage = registry

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = registry
  }
})(typeof window !== 'undefined' ? window : global)
