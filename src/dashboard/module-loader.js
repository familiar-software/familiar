(function registerModuleLoader(global) {
  const MODULE_SPECS = [
    { globalKey: 'FamiliarDashboardListUtils', modulePath: './list-utils.js', factory: 'normalizeStringArray' },
    { globalKey: 'FamiliarWizard', modulePath: './wizard.js', factory: 'createWizard' },
    { globalKey: 'FamiliarWizardSkill', modulePath: './wizard-skill.js', factory: 'createWizardSkill' },
    { globalKey: 'FamiliarUpdates', modulePath: './updates.js', factory: 'createUpdates' },
    { globalKey: 'FamiliarSettings', modulePath: './settings.js', factory: 'createSettings' },
    { globalKey: 'FamiliarProcessingEngine', modulePath: './processing-engine.js', factory: 'createProcessingEngine' },
    { globalKey: 'FamiliarStills', modulePath: './stills.js', factory: 'createStills' }
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

  const registry = global.FamiliarDashboardModuleLoader || {}
  registry.loadDashboardModules = loadDashboardModules
  global.FamiliarDashboardModuleLoader = registry

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = registry
  }
})(typeof window !== 'undefined' ? window : global)
