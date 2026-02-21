(function registerBootstrapCloudCoWorkGuide(global) {
  function bootstrapCloudCoWorkGuide(options = {}) {
    const targetWindow = options.window
    if (
      !targetWindow ||
      !targetWindow.FamiliarCloudCoWorkGuide ||
      typeof targetWindow.FamiliarCloudCoWorkGuide.createCloudCoWorkGuide !== 'function'
    ) {
      return null
    }

    return targetWindow.FamiliarCloudCoWorkGuide.createCloudCoWorkGuide({
      elements: options.elements,
      setMessage: options.setMessage
    })
  }

  const registry = global.FamiliarDashboardBootstrap || {}
  registry.bootstrapCloudCoWorkGuide = bootstrapCloudCoWorkGuide
  global.FamiliarDashboardBootstrap = registry

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { bootstrapCloudCoWorkGuide }
  }
})(typeof window !== 'undefined' ? window : global)
