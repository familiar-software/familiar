(function registerModuleLoader(global) {
  const MODULE_SPECS = [
    { globalKey: 'JiminyWizard', modulePath: './wizard.js', factory: 'createWizard' },
    { globalKey: 'JiminyHotkeys', modulePath: './hotkeys.js', factory: 'createHotkeys' },
    { globalKey: 'JiminyUpdates', modulePath: './updates.js', factory: 'createUpdates' },
    { globalKey: 'JiminySettings', modulePath: './settings.js', factory: 'createSettings' },
    { globalKey: 'JiminyRecording', modulePath: './recording.js', factory: 'createRecording' }
  ]

  function assignModule(targetWindow, moduleExports) {
    if (!moduleExports) {
      return
    }
    for (const spec of MODULE_SPECS) {
      if (typeof moduleExports[spec.factory] === 'function') {
        targetWindow[spec.globalKey] = moduleExports
        return
      }
    }
  }

  function loadModule(targetWindow, spec) {
    if (targetWindow[spec.globalKey]) {
      return
    }
    try {
      const moduleExports = require(spec.modulePath)
      assignModule(targetWindow, moduleExports)
    } catch (error) {
      console.warn(`Failed to load ${spec.globalKey} module`, error)
    }
  }

  function loadDashboardModules(targetWindow) {
    if (typeof require !== 'function') {
      return
    }
    for (const spec of MODULE_SPECS) {
      loadModule(targetWindow, spec)
    }
  }

  const registry = global.JiminyDashboardModuleLoader || {}
  registry.loadDashboardModules = loadDashboardModules
  global.JiminyDashboardModuleLoader = registry

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = registry
  }
})(typeof window !== 'undefined' ? window : global)
