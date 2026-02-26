(function registerDashboardState(global) {
  const autoCleanupRetention = global?.FamiliarAutoCleanupRetention
  const resolveAutoCleanupRetentionDays = autoCleanupRetention?.resolveAutoCleanupRetentionDays

  if (typeof resolveAutoCleanupRetentionDays !== 'function') {
    throw new Error('FamiliarAutoCleanupRetention.resolveAutoCleanupRetentionDays is unavailable')
  }

  function createDashboardState(options = {}) {
    const elements = options.elements || {}
    const apis = options.apis || {}

    const contextFolderInputs = elements.contextFolderInputs || []
    const llmProviderSelects = elements.llmProviderSelects || []
    const llmKeyInputs = elements.llmKeyInputs || []
    const stillsMarkdownExtractorSelects = elements.stillsMarkdownExtractorSelects || []
    const alwaysRecordWhenActiveInputs = elements.alwaysRecordWhenActiveInputs || []
    const storageAutoCleanupRetentionSelects = elements.storageAutoCleanupRetentionSelects || []

    const state = {
      currentContextFolderPath: '',
      currentLlmProviderName: '',
      currentLlmApiKey: '',
      pendingLlmApiKey: '',
      currentStillsMarkdownExtractorType: 'apple_vision_ocr',
      currentAlwaysRecordWhenActive: false,
      currentStorageAutoCleanupRetentionDays: resolveAutoCleanupRetentionDays(undefined),
      isLlmApiKeySaved: false,
      currentSkillHarness: '',
      currentSkillHarnesses: [],
      isSkillInstalled: false
    }

    function callIfAvailable(target, method, ...args) {
      if (target && typeof target[method] === 'function') {
        return target[method](...args)
      }
      return undefined
    }

    function updateWizardUI() {
      callIfAvailable(apis.wizardApi, 'updateWizardUI')
    }

    function setInputValues(targets, value) {
      for (const element of targets) {
        if (element.value !== value) {
          element.value = value
        }
      }
    }

    function toDisplayedContextFolderPath(value) {
      if (typeof value !== 'string') {
        return ''
      }
      const normalized = value.replace(/\\/g, '/').replace(/\/+$/, '')
      if (!normalized) {
        return ''
      }
      if (normalized.toLowerCase().endsWith('/familiar')) {
        return normalized
      }
      return `${normalized}/familiar`
    }

    function setContextFolderValue(value) {
      const nextValue = value || ''
      state.currentContextFolderPath = nextValue
      setInputValues(contextFolderInputs, toDisplayedContextFolderPath(state.currentContextFolderPath))
      callIfAvailable(apis.recordingApi, 'updateRecordingUI')
      updateWizardUI()
    }

    function setLlmProviderValue(value) {
      state.currentLlmProviderName = value || ''
      for (const select of llmProviderSelects) {
        if (select.value !== state.currentLlmProviderName) {
          select.value = state.currentLlmProviderName
        }
      }
      callIfAvailable(apis.recordingApi, 'updateRecordingUI')
      updateWizardUI()
    }

    function setLlmApiKeyPending(value) {
      state.pendingLlmApiKey = value || ''
      setInputValues(llmKeyInputs, state.pendingLlmApiKey)
      state.isLlmApiKeySaved =
        state.pendingLlmApiKey.length > 0 && state.pendingLlmApiKey === state.currentLlmApiKey
      updateWizardUI()
    }

    function setLlmApiKeySaved(value) {
      state.currentLlmApiKey = value || ''
      setLlmApiKeyPending(state.currentLlmApiKey)
      state.isLlmApiKeySaved = Boolean(state.currentLlmApiKey)
      callIfAvailable(apis.recordingApi, 'updateRecordingUI')
      updateWizardUI()
    }

    function setStillsMarkdownExtractorType(value) {
      const nextValue = value || 'apple_vision_ocr'
      state.currentStillsMarkdownExtractorType = nextValue
      for (const select of stillsMarkdownExtractorSelects) {
        if (select.value !== state.currentStillsMarkdownExtractorType) {
          select.value = state.currentStillsMarkdownExtractorType
        }
      }
      callIfAvailable(apis.recordingApi, 'updateRecordingUI')
      callIfAvailable(apis.processingEngineApi, 'updateProcessingEngineUI')
      updateWizardUI()
    }

    function setAlwaysRecordWhenActiveValue(value) {
      state.currentAlwaysRecordWhenActive = Boolean(value)
      for (const input of alwaysRecordWhenActiveInputs) {
        if (input.checked !== state.currentAlwaysRecordWhenActive) {
          input.checked = state.currentAlwaysRecordWhenActive
        }
      }
      callIfAvailable(apis.recordingApi, 'updateRecordingUI')
      updateWizardUI()
    }

    function setStorageAutoCleanupRetentionDays(value) {
      const nextValue = resolveAutoCleanupRetentionDays(value)
      state.currentStorageAutoCleanupRetentionDays = nextValue
      for (const select of storageAutoCleanupRetentionSelects) {
        if (select.value !== String(nextValue)) {
          select.value = String(nextValue)
        }
      }
      updateWizardUI()
    }

    function setSkillHarnesses(values) {
      const nextValues = Array.isArray(values)
        ? values.filter((value) => typeof value === 'string' && value.trim().length > 0)
        : []
      state.currentSkillHarnesses = Array.from(new Set(nextValues))
      state.currentSkillHarness = state.currentSkillHarnesses[0] || ''
      updateWizardUI()
    }

    function setSkillHarness(value) {
      const nextValue = value || ''
      setSkillHarnesses(nextValue ? [nextValue] : [])
    }

    function getSelectedSkillHarnesses() {
      if (Array.isArray(state.currentSkillHarnesses) && state.currentSkillHarnesses.length > 0) {
        return state.currentSkillHarnesses
      }
      if (state.currentSkillHarness) {
        return [state.currentSkillHarness]
      }
      return []
    }

    function hasSelectedSkillHarnesses() {
      return getSelectedSkillHarnesses().length > 0
    }

    function setSkillInstalled(value) {
      state.isSkillInstalled = Boolean(value)
      updateWizardUI()
    }

    function getWizardState() {
      const selectedSkillHarnesses = getSelectedSkillHarnesses()
      return {
        currentContextFolderPath: state.currentContextFolderPath,
        currentLlmProviderName: state.currentLlmProviderName,
        currentLlmApiKey: state.currentLlmApiKey,
        isLlmApiKeySaved: state.isLlmApiKeySaved,
        currentStillsMarkdownExtractorType: state.currentStillsMarkdownExtractorType,
        currentSkillHarness: state.currentSkillHarness,
        currentSkillHarnesses: selectedSkillHarnesses,
        hasSelectedSkillHarnesses: selectedSkillHarnesses.length > 0,
        isSkillInstalled: state.isSkillInstalled,
        currentAlwaysRecordWhenActive: state.currentAlwaysRecordWhenActive
      }
    }

    function getRecordingState() {
      return {
        currentContextFolderPath: state.currentContextFolderPath,
        currentAlwaysRecordWhenActive: state.currentAlwaysRecordWhenActive,
        currentLlmProviderName: state.currentLlmProviderName,
        currentLlmApiKey: state.currentLlmApiKey
      }
    }

    function getSettingsState() {
      return {
        currentContextFolderPath: state.currentContextFolderPath,
        currentLlmProviderName: state.currentLlmProviderName,
        currentLlmApiKey: state.currentLlmApiKey,
        pendingLlmApiKey: state.pendingLlmApiKey,
        currentStillsMarkdownExtractorType: state.currentStillsMarkdownExtractorType,
        currentAlwaysRecordWhenActive: state.currentAlwaysRecordWhenActive,
        currentStorageAutoCleanupRetentionDays: state.currentStorageAutoCleanupRetentionDays
      }
    }

    return {
      updateWizardUI,
      setContextFolderValue,
      setLlmProviderValue,
      setLlmApiKeyPending,
      setLlmApiKeySaved,
      setStillsMarkdownExtractorType,
      setAlwaysRecordWhenActiveValue,
      setStorageAutoCleanupRetentionDays,
      setSkillHarnesses,
      setSkillHarness,
      setSkillInstalled,
      getWizardState,
      getRecordingState,
      getSettingsState
    }
  }

  const registry = global.FamiliarDashboardState || {}
  registry.createDashboardState = createDashboardState
  global.FamiliarDashboardState = registry

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = registry
  }
})(typeof window !== 'undefined' ? window : global)
