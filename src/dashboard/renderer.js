document.addEventListener('DOMContentLoaded', function onDOMContentLoaded() {
  function resolveModule(globalKey, localPath) {
    if (window[globalKey]) {
      return window[globalKey]
    }
    if (typeof require === 'function') {
      return require(localPath)
    }
    return null
  }

  function resolveBootstrapModules() {
    if (window.JiminyDashboardBootstrap) {
      return window.JiminyDashboardBootstrap
    }
    if (typeof require === 'function') {
      return {
        ...require('./bootstrap/hotkeys'),
        ...require('./bootstrap/stills'),
        ...require('./bootstrap/settings'),
        ...require('./bootstrap/updates'),
        ...require('./bootstrap/wizard'),
        ...require('./bootstrap/wizard-skill')
      }
    }
    return {}
  }

  const jiminy = window.jiminy || {}
  const moduleLoader = resolveModule('JiminyDashboardModuleLoader', './module-loader')
  const stateModule = resolveModule('JiminyDashboardState', './state')
  const bootstrap = resolveBootstrapModules()
  const loadDashboardModules = moduleLoader?.loadDashboardModules
  const createDashboardState = stateModule?.createDashboardState
  const {
    bootstrapHotkeys,
    bootstrapStills,
    bootstrapSettings,
    bootstrapUpdates,
    bootstrapWizard,
    bootstrapWizardSkill
  } = bootstrap

  if (typeof createDashboardState !== 'function') {
    console.error('Dashboard state module unavailable.')
    return
  }

  function selectAll(selector) {
    if (typeof document.querySelectorAll !== 'function') {
      return []
    }
    return Array.from(document.querySelectorAll(selector))
  }

  function toArray(value) {
    if (Array.isArray(value)) {
      return value
    }
    return [value]
  }

  function callIfAvailable(target, method, ...args) {
    if (target && typeof target[method] === 'function') {
      return target[method](...args)
    }
    return undefined
  }

  if (typeof loadDashboardModules === 'function') {
    loadDashboardModules(window)
  }

  const settingsHeader = document.getElementById('settings-header')
  const settingsContent = document.getElementById('settings-content')
  const wizardSection = document.getElementById('section-wizard')
  const wizardBackButton = selectAll('[data-action="wizard-back"]')[0]
  const wizardNextButton = selectAll('[data-action="wizard-next"]')[0]
  const wizardDoneButton = selectAll('[data-action="wizard-done"]')[0]
  const wizardCompleteStatus = document.getElementById('wizard-complete-status')
  const wizardStepStatus = document.getElementById('wizard-step-status')
  const wizardStepPanels = selectAll('[data-wizard-step]')
  const wizardStepIndicators = selectAll('[data-wizard-step-indicator]')
  const wizardStepConnectors = selectAll('[data-wizard-step-connector]')
  const skillHarnessInputs = selectAll('[data-skill-harness]')
  const wizardSkillInstallButton = document.getElementById('wizard-skill-install')
  const wizardSkillStatus = document.getElementById('wizard-skill-status')
  const wizardSkillError = document.getElementById('wizard-skill-error')
  const wizardSkillPath = document.getElementById('wizard-skill-path')

  const contextFolderInputs = selectAll('[data-setting="context-folder-path"]')
  const contextFolderChooseButtons = selectAll('[data-action="context-folder-choose"]')
  const contextFolderErrors = selectAll('[data-setting-error="context-folder-error"]')
  const contextFolderStatuses = selectAll('[data-setting-status="context-folder-status"]')

  const llmProviderSelects = selectAll('[data-setting="llm-provider"]')
  const llmProviderErrors = selectAll('[data-setting-error="llm-provider-error"]')
  const llmKeyInputs = selectAll('[data-setting="llm-api-key"]')
  const llmKeyErrors = selectAll('[data-setting-error="llm-api-key-error"]')
  const llmKeyStatuses = selectAll('[data-setting-status="llm-api-key-status"]')
  const stillsMarkdownExtractorSelects = selectAll('[data-setting="stills-markdown-extractor"]')
  const stillsMarkdownExtractorErrors = selectAll('[data-setting-error="stills-markdown-extractor-error"]')
  const stillsMarkdownExtractorStatuses = selectAll('[data-setting-status="stills-markdown-extractor-status"]')
  const alwaysRecordWhenActiveInputs = selectAll('[data-setting="always-record-when-active"]')
  const alwaysRecordWhenActiveErrors = selectAll('[data-setting-error="always-record-when-active-error"]')
  const alwaysRecordWhenActiveStatuses = selectAll('[data-setting-status="always-record-when-active-status"]')
  const recordingDetails = document.getElementById('recording-details')
  const recordingPath = document.getElementById('recording-path')
  const recordingOpenFolderButton = document.getElementById('recording-open-folder')
  const recordingStatus = document.getElementById('recording-status')
  const recordingActionButton = document.getElementById('recording-action')
  const recordingPermission = document.getElementById('recording-permission')

  const updateButtons = selectAll('[data-action="updates-check"]')
  const updateStatuses = selectAll('[data-setting-status="updates-status"]')
  const updateErrors = selectAll('[data-setting-error="updates-error"]')
  const updateProgress = document.getElementById('updates-progress')
  const updateProgressBar = document.getElementById('updates-progress-bar')
  const updateProgressLabel = document.getElementById('updates-progress-label')

  const hotkeyButtons = selectAll('.hotkey-recorder')
  function isRecordingHotkey(button) {
    return button.dataset.hotkeyRole === 'recording'
  }
  const recordingHotkeyButtons = hotkeyButtons.filter(isRecordingHotkey)
  const hotkeysSaveButtons = selectAll('[data-action="hotkeys-save"]')
  const hotkeysResetButtons = selectAll('[data-action="hotkeys-reset"]')
  const hotkeysStatuses = selectAll('[data-setting-status="hotkeys-status"]')
  const hotkeysErrors = selectAll('[data-setting-error="hotkeys-error"]')

  const sectionTitle = document.getElementById('section-title')
  const sectionSubtitle = document.getElementById('section-subtitle')
  const sectionNavButtons = selectAll('[data-section-target]')
  const sectionPanes = selectAll('[data-section-pane]')

  const DEFAULT_RECORDING_HOTKEY = 'CommandOrControl+R'

  const apis = {
    wizardApi: null,
    wizardSkillApi: null,
    hotkeysApi: null,
    updatesApi: null,
    settingsApi: null,
    recordingApi: null
  }

  const state = createDashboardState({
    defaults: {
      recording: DEFAULT_RECORDING_HOTKEY
    },
    elements: {
      contextFolderInputs,
      llmProviderSelects,
      llmKeyInputs,
      stillsMarkdownExtractorSelects,
      alwaysRecordWhenActiveInputs
    },
    apis
  })

  const SECTION_META = {
    wizard: {
      title: 'Setup Wizard',
      subtitle: 'Guided setup in five steps.'
    },
    general: {
      title: 'General Settings',
      subtitle: 'Core app configuration.'
    },
    privacy: {
      title: 'Privacy',
      subtitle: 'Where your data lives and what leaves your machine.'
    },
    hotkeys: {
      title: 'Hotkeys',
      subtitle: 'Configure global keyboard shortcuts.'
    },
    updates: {
      title: 'Updates',
      subtitle: 'Check for new versions and download when available.'
    },
    recording: {
      title: 'Recording',
      subtitle: 'Capture still images while you are active, and configure extraction.'
    }
  }

  function setActiveSection(nextSection) {
    const sectionMeta = SECTION_META[nextSection]
    if (!sectionMeta) {
      console.warn('Unknown settings section', nextSection)
      return
    }

    const isWizard = nextSection === 'wizard'

    for (const pane of sectionPanes) {
      const isActive = pane.dataset.sectionPane === nextSection
      pane.classList.toggle('hidden', !isActive)
      pane.setAttribute('aria-hidden', String(!isActive))
      if (isActive) {
        pane.classList.remove('pane-enter')
        void pane.offsetHeight
        pane.classList.add('pane-enter')
      }
    }

    for (const button of sectionNavButtons) {
      const isActive = button.dataset.sectionTarget === nextSection
      button.dataset.active = isActive ? 'true' : 'false'
      button.setAttribute('aria-selected', String(isActive))
      button.tabIndex = isActive ? 0 : -1
    }

    if (sectionTitle) {
      sectionTitle.textContent = sectionMeta.title
    }
    if (sectionSubtitle) {
      sectionSubtitle.textContent = sectionMeta.subtitle
    }

    if (settingsHeader) {
      settingsHeader.classList.toggle('hidden', isWizard)
    }
    if (settingsContent) {
      settingsContent.classList.toggle('hidden', isWizard)
    }
    if (isWizard) {
      state.updateWizardUI()
    }
    callIfAvailable(apis.recordingApi, 'handleSectionChange', nextSection)

    console.log('Settings section changed', { section: nextSection })
  }

  function handleWizardDone() {
    setActiveSection('general')
  }

  const runBootstrapWizard = typeof bootstrapWizard === 'function' ? bootstrapWizard : () => null
  const runBootstrapWizardSkill = typeof bootstrapWizardSkill === 'function' ? bootstrapWizardSkill : () => null
  const runBootstrapUpdates = typeof bootstrapUpdates === 'function' ? bootstrapUpdates : () => null
  const runBootstrapStills = typeof bootstrapStills === 'function' ? bootstrapStills : () => null
  const runBootstrapSettings = typeof bootstrapSettings === 'function' ? bootstrapSettings : () => null
  const runBootstrapHotkeys = typeof bootstrapHotkeys === 'function' ? bootstrapHotkeys : () => null

  apis.wizardApi = runBootstrapWizard({
    window,
    elements: {
      wizardSection,
      wizardBackButton,
      wizardNextButton,
      wizardDoneButton,
      wizardCompleteStatus,
      wizardStepStatus,
      wizardStepPanels,
      wizardStepIndicators,
      wizardStepConnectors
    },
    getState: state.getWizardState,
    onDone: handleWizardDone
  })

  function handleSectionNavClick(targetElement) {
    const target = targetElement?.dataset?.sectionTarget
    if (target) {
      setActiveSection(target)
    }
  }

  for (const button of sectionNavButtons) {
    button.addEventListener('click', function onSectionNavClick(event) {
      const targetElement = event?.currentTarget || button
      handleSectionNavClick(targetElement)
    })
  }

  function setMessage(elements, message) {
    const targets = toArray(elements)
    const value = message || ''
    for (const element of targets) {
      if (!element) {
        continue
      }
      element.textContent = value
      element.classList.toggle('hidden', !value)
    }
  }

  apis.wizardSkillApi = runBootstrapWizardSkill({
    window,
    elements: {
      skillHarnessInputs,
      skillInstallButton: wizardSkillInstallButton,
      skillInstallStatus: wizardSkillStatus,
      skillInstallError: wizardSkillError,
      skillInstallPath: wizardSkillPath
    },
    jiminy,
    getState: state.getWizardState,
    setSkillHarness: state.setSkillHarness,
    setSkillInstalled: state.setSkillInstalled,
    setMessage,
    updateWizardUI: state.updateWizardUI
  })

  apis.updatesApi = runBootstrapUpdates({
    window,
    elements: {
      updateButtons,
      updateStatuses,
      updateErrors,
      updateProgress,
      updateProgressBar,
      updateProgressLabel
    },
    jiminy,
    setMessage
  })

  apis.recordingApi = runBootstrapStills({
    window,
    elements: {
      recordingDetails,
      recordingPath,
      recordingOpenFolderButton,
      recordingStatus,
      recordingActionButton,
      recordingPermission
    },
    jiminy,
    getState: state.getRecordingState
  })

  apis.settingsApi = runBootstrapSettings({
    window,
    elements: {
      contextFolderChooseButtons,
      contextFolderErrors,
      contextFolderStatuses,
      llmProviderSelects,
      llmProviderErrors,
      llmKeyInputs,
      llmKeyErrors,
      llmKeyStatuses,
      stillsMarkdownExtractorSelects,
      stillsMarkdownExtractorErrors,
      stillsMarkdownExtractorStatuses,
      alwaysRecordWhenActiveInputs,
      alwaysRecordWhenActiveErrors,
      alwaysRecordWhenActiveStatuses,
      hotkeysErrors,
      hotkeysStatuses
    },
    jiminy,
    defaults: {
      recording: DEFAULT_RECORDING_HOTKEY
    },
    getState: state.getSettingsState,
    setContextFolderValue: state.setContextFolderValue,
    setLlmProviderValue: state.setLlmProviderValue,
    setLlmApiKeyPending: state.setLlmApiKeyPending,
    setLlmApiKeySaved: state.setLlmApiKeySaved,
    setStillsMarkdownExtractorType: state.setStillsMarkdownExtractorType,
    setAlwaysRecordWhenActiveValue: state.setAlwaysRecordWhenActiveValue,
    setHotkeys: state.setHotkeysFromSettings,
    setMessage,
    updateWizardUI: state.updateWizardUI
  })

  if (!apis.settingsApi) {
    setMessage(contextFolderErrors, 'Settings module unavailable. Restart the app.')
    setMessage(llmProviderErrors, 'Settings module unavailable. Restart the app.')
    setMessage(llmKeyErrors, 'Settings module unavailable. Restart the app.')
    setMessage(stillsMarkdownExtractorErrors, 'Settings module unavailable. Restart the app.')
    setMessage(hotkeysErrors, 'Settings module unavailable. Restart the app.')
    return
  }

  if (!apis.settingsApi.isReady) {
    return
  }

  apis.hotkeysApi = runBootstrapHotkeys({
    window,
    elements: {
      hotkeyButtons,
      recordingHotkeyButtons,
      hotkeysSaveButtons,
      hotkeysResetButtons,
      hotkeysStatuses,
      hotkeysErrors
    },
    jiminy,
    setMessage,
    updateWizardUI: state.updateWizardUI,
    getState: state.getHotkeysState,
    setHotkeyValue: state.setHotkeyValue,
    defaults: {
      recording: DEFAULT_RECORDING_HOTKEY
    }
  })

  async function initialize() {
    const settingsResult = await apis.settingsApi.loadSettings()
    state.setIsFirstRun(Boolean(settingsResult?.isFirstRun))
    callIfAvailable(apis.recordingApi, 'setPermissionStatus', settingsResult?.screenRecordingPermissionStatus || '')
    callIfAvailable(apis.recordingApi, 'updateStillsUI')
    const defaultSection = state.getIsFirstRun() ? 'wizard' : 'general'
    setActiveSection(defaultSection)
    state.updateWizardUI()
  }

  void initialize()
})
