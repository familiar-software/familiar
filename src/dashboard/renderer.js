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
        ...require('./bootstrap/history'),
        ...require('./bootstrap/hotkeys'),
        ...require('./bootstrap/recording'),
        ...require('./bootstrap/settings'),
        ...require('./bootstrap/updates'),
        ...require('./bootstrap/wizard')
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
    bootstrapHistory,
    bootstrapHotkeys,
    bootstrapRecording,
    bootstrapSettings,
    bootstrapUpdates,
    bootstrapWizard
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

  const contextFolderInputs = selectAll('[data-setting="context-folder-path"]')
  const contextFolderChooseButtons = selectAll('[data-action="context-folder-choose"]')
  const contextFolderErrors = selectAll('[data-setting-error="context-folder-error"]')
  const contextFolderStatuses = selectAll('[data-setting-status="context-folder-status"]')

  const llmProviderSelects = selectAll('[data-setting="llm-provider"]')
  const llmProviderErrors = selectAll('[data-setting-error="llm-provider-error"]')
  const llmKeyInputs = selectAll('[data-setting="llm-api-key"]')
  const llmKeyErrors = selectAll('[data-setting-error="llm-api-key-error"]')
  const llmKeyStatuses = selectAll('[data-setting-status="llm-api-key-status"]')
  const alwaysRecordWhenActiveInputs = selectAll('[data-setting="always-record-when-active"]')
  const alwaysRecordWhenActiveErrors = selectAll('[data-setting-error="always-record-when-active-error"]')
  const alwaysRecordWhenActiveStatuses = selectAll('[data-setting-status="always-record-when-active-status"]')
  const recordingDetails = document.getElementById('recording-details')
  const recordingPath = document.getElementById('recording-path')
  const recordingStatus = document.getElementById('recording-status')
  const recordingActionButton = document.getElementById('recording-action')
  const recordingPermission = document.getElementById('recording-permission')
  const recordingQueryQuestion = document.getElementById('recording-query-question')
  const recordingQueryFrom = document.getElementById('recording-query-from')
  const recordingQueryTo = document.getElementById('recording-query-to')
  const recordingQuerySubmit = document.getElementById('recording-query-submit')
  const recordingQuerySpinner = document.getElementById('recording-query-spinner')
  const recordingQueryStatus = document.getElementById('recording-query-status')
  const recordingQueryError = document.getElementById('recording-query-error')
  const recordingQueryAnswer = document.getElementById('recording-query-answer')
  const recordingQueryAvailability = document.getElementById('recording-query-availability')
  const recordingQueryEstimate = document.getElementById('recording-query-estimate')
  const recordingQueryPath = document.getElementById('recording-query-path')

  const updateButtons = selectAll('[data-action="updates-check"]')
  const updateStatuses = selectAll('[data-setting-status="updates-status"]')
  const updateErrors = selectAll('[data-setting-error="updates-error"]')
  const updateProgress = document.getElementById('updates-progress')
  const updateProgressBar = document.getElementById('updates-progress-bar')
  const updateProgressLabel = document.getElementById('updates-progress-label')


  const hotkeyButtons = selectAll('.hotkey-recorder')
  function isCaptureHotkey(button) {
    return button.dataset.hotkeyRole === 'capture'
  }
  function isClipboardHotkey(button) {
    return button.dataset.hotkeyRole === 'clipboard'
  }
  function isRecordingHotkey(button) {
    return button.dataset.hotkeyRole === 'recording'
  }
  const captureHotkeyButtons = hotkeyButtons.filter(isCaptureHotkey)
  const clipboardHotkeyButtons = hotkeyButtons.filter(isClipboardHotkey)
  const recordingHotkeyButtons = hotkeyButtons.filter(isRecordingHotkey)
  const hotkeysSaveButtons = selectAll('[data-action="hotkeys-save"]')
  const hotkeysResetButtons = selectAll('[data-action="hotkeys-reset"]')
  const hotkeysStatuses = selectAll('[data-setting-status="hotkeys-status"]')
  const hotkeysErrors = selectAll('[data-setting-error="hotkeys-error"]')

  const sectionTitle = document.getElementById('section-title')
  const sectionSubtitle = document.getElementById('section-subtitle')
  const sectionNavButtons = selectAll('[data-section-target]')
  const sectionPanes = selectAll('[data-section-pane]')
  const historyList = document.getElementById('history-list')
  const historyEmpty = document.getElementById('history-empty')
  const historyError = document.getElementById('history-error')

  const DEFAULT_CAPTURE_HOTKEY = 'CommandOrControl+Shift+J'
  const DEFAULT_CLIPBOARD_HOTKEY = 'CommandOrControl+J'
  const DEFAULT_RECORDING_HOTKEY = 'CommandOrControl+R'

  const apis = {
    wizardApi: null,
    hotkeysApi: null,
    historyApi: null,
    updatesApi: null,
    settingsApi: null,
    recordingApi: null
  }

  const state = createDashboardState({
    defaults: {
      capture: DEFAULT_CAPTURE_HOTKEY,
      clipboard: DEFAULT_CLIPBOARD_HOTKEY,
      recording: DEFAULT_RECORDING_HOTKEY
    },
    elements: {
      contextFolderInputs,
      llmProviderSelects,
      llmKeyInputs,
      alwaysRecordWhenActiveInputs
    },
    apis
  })

  const SECTION_META = {
    wizard: {
      title: 'Setup Wizard',
      subtitle: 'Guided setup in four steps.'
    },
    general: {
      title: 'General Settings',
      subtitle: 'Core app configuration and provider setup.'
    },
    hotkeys: {
      title: 'Hotkeys',
      subtitle: 'Configure global keyboard shortcuts.'
    },
    history: {
      title: 'History',
      subtitle: 'Recent captures and analysis flows.'
    },
    updates: {
      title: 'Updates',
      subtitle: 'Check for new versions and download when available.'
    },
    recording: {
      title: 'Recording',
      subtitle: 'Control always-on screen recording.'
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
    callIfAvailable(apis.historyApi, 'handleSectionChange', nextSection)
    callIfAvailable(apis.recordingApi, 'handleSectionChange', nextSection)

    console.log('Settings section changed', { section: nextSection })
  }

  function handleWizardDone() {
    setActiveSection('general')
  }

  const runBootstrapWizard = typeof bootstrapWizard === 'function' ? bootstrapWizard : () => null
  const runBootstrapHistory = typeof bootstrapHistory === 'function' ? bootstrapHistory : () => null
  const runBootstrapUpdates = typeof bootstrapUpdates === 'function' ? bootstrapUpdates : () => null
  const runBootstrapRecording = typeof bootstrapRecording === 'function' ? bootstrapRecording : () => null
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

  apis.historyApi = runBootstrapHistory({
    window,
    elements: {
      historyList,
      historyEmpty,
      historyError
    },
    jiminy,
    setMessage
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

  apis.recordingApi = runBootstrapRecording({
    window,
    elements: {
      recordingDetails,
      recordingPath,
      recordingStatus,
      recordingActionButton,
      recordingPermission,
      recordingQueryQuestion,
      recordingQueryFrom,
      recordingQueryTo,
      recordingQuerySubmit,
      recordingQuerySpinner,
      recordingQueryStatus,
      recordingQueryError,
      recordingQueryAnswer,
      recordingQueryAvailability,
      recordingQueryEstimate,
      recordingQueryPath
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
      alwaysRecordWhenActiveInputs,
      alwaysRecordWhenActiveErrors,
      alwaysRecordWhenActiveStatuses,
      hotkeysErrors,
      hotkeysStatuses
    },
    jiminy,
    defaults: {
      capture: DEFAULT_CAPTURE_HOTKEY,
      clipboard: DEFAULT_CLIPBOARD_HOTKEY,
      recording: DEFAULT_RECORDING_HOTKEY
    },
    getState: state.getSettingsState,
    setContextFolderValue: state.setContextFolderValue,
    setLlmProviderValue: state.setLlmProviderValue,
    setLlmApiKeyPending: state.setLlmApiKeyPending,
    setLlmApiKeySaved: state.setLlmApiKeySaved,
    setAlwaysRecordWhenActiveValue: state.setAlwaysRecordWhenActiveValue,
    setHotkeys: state.setHotkeysFromSettings,
    setMessage,
    updateWizardUI: state.updateWizardUI
  })

  if (!apis.settingsApi) {
    setMessage(contextFolderErrors, 'Settings module unavailable. Restart the app.')
    setMessage(llmProviderErrors, 'Settings module unavailable. Restart the app.')
    setMessage(llmKeyErrors, 'Settings module unavailable. Restart the app.')
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
      captureHotkeyButtons,
      clipboardHotkeyButtons,
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
      capture: DEFAULT_CAPTURE_HOTKEY,
      clipboard: DEFAULT_CLIPBOARD_HOTKEY,
      recording: DEFAULT_RECORDING_HOTKEY
    }
  })

  async function initialize() {
    const settingsResult = await apis.settingsApi.loadSettings()
    state.setIsFirstRun(Boolean(settingsResult?.isFirstRun))
    callIfAvailable(apis.recordingApi, 'setPermissionStatus', settingsResult?.screenRecordingPermissionStatus || '')
    callIfAvailable(apis.recordingApi, 'updateRecordingUI')
    const defaultSection = state.getIsFirstRun() ? 'wizard' : 'general'
    setActiveSection(defaultSection)
    state.updateWizardUI()
  }

  void initialize()
})
