(function registerBootstrapWizardSkill(global) {
  function bootstrapWizardSkill(options = {}) {
    const targetWindow = options.window
    if (!targetWindow || !targetWindow.FamiliarWizardSkill || typeof targetWindow.FamiliarWizardSkill.createWizardSkill !== 'function') {
      return null
    }

    return targetWindow.FamiliarWizardSkill.createWizardSkill({
      elements: options.elements,
      familiar: options.familiar,
      getState: options.getState,
      setSkillHarness: options.setSkillHarness,
      setSkillHarnesses: options.setSkillHarnesses,
      setSkillInstalled: options.setSkillInstalled,
      cloudCoWorkGuide: options.cloudCoWorkGuide,
      setMessage: options.setMessage,
      updateWizardUI: options.updateWizardUI
    })
  }

  const registry = global.FamiliarDashboardBootstrap || {}
  registry.bootstrapWizardSkill = bootstrapWizardSkill
  global.FamiliarDashboardBootstrap = registry

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { bootstrapWizardSkill }
  }
})(typeof window !== 'undefined' ? window : global)
