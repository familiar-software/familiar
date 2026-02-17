(function registerBootstrapSettings(global) {
  function bootstrapSettings(options = {}) {
    const targetWindow = options.window
    if (!targetWindow || !targetWindow.FamiliarSettings || typeof targetWindow.FamiliarSettings.createSettings !== 'function') {
      return null
    }

    return targetWindow.FamiliarSettings.createSettings({
      elements: options.elements,
      familiar: options.familiar,
      defaults: options.defaults,
      getState: options.getState,
      setContextFolderValue: options.setContextFolderValue,
      setSkillHarness: options.setSkillHarness,
      setSkillHarnesses: options.setSkillHarnesses,
      setLlmProviderValue: options.setLlmProviderValue,
      setLlmApiKeyPending: options.setLlmApiKeyPending,
      setLlmApiKeySaved: options.setLlmApiKeySaved,
      setStillsMarkdownExtractorType: options.setStillsMarkdownExtractorType,
      setAlwaysRecordWhenActiveValue: options.setAlwaysRecordWhenActiveValue,
      setExclusions: options.setExclusions,
      setMessage: options.setMessage,
      refreshContextGraphStatus: options.refreshContextGraphStatus,
      updatePruneButtonState: options.updatePruneButtonState,
      updateWizardUI: options.updateWizardUI
    })
  }

  const registry = global.FamiliarDashboardBootstrap || {}
  registry.bootstrapSettings = bootstrapSettings
  global.FamiliarDashboardBootstrap = registry

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { bootstrapSettings }
  }
})(typeof window !== 'undefined' ? window : global)
