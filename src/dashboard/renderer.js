document.addEventListener('DOMContentLoaded', () => {
  const jiminy = window.jiminy || {}
  if (typeof require === 'function') {
    const loadModule = (globalKey, modulePath) => {
      if (window[globalKey]) {
        return
      }
      try {
        const moduleExports = require(modulePath)
        if (moduleExports && typeof moduleExports.createWizard === 'function') {
          window.JiminyWizard = moduleExports
        } else if (moduleExports && typeof moduleExports.createExclusions === 'function') {
          window.JiminyExclusions = moduleExports
        } else if (moduleExports && typeof moduleExports.createHotkeys === 'function') {
          window.JiminyHotkeys = moduleExports
        } else if (moduleExports && typeof moduleExports.createHistory === 'function') {
          window.JiminyHistory = moduleExports
        } else if (moduleExports && typeof moduleExports.createUpdates === 'function') {
          window.JiminyUpdates = moduleExports
        } else if (moduleExports && typeof moduleExports.createSettings === 'function') {
          window.JiminySettings = moduleExports
        } else if (moduleExports && typeof moduleExports.createGraph === 'function') {
          window.JiminyGraph = moduleExports
        }
      } catch (error) {
        console.warn(`Failed to load ${globalKey} module`, error)
      }
    }

    loadModule('JiminyWizard', './wizard.js')
    loadModule('JiminyExclusions', './exclusions.js')
    loadModule('JiminyHotkeys', './hotkeys.js')
    loadModule('JiminyHistory', './history.js')
    loadModule('JiminyUpdates', './updates.js')
    loadModule('JiminySettings', './settings.js')
    loadModule('JiminyGraph', './graph.js')
  }
  const selectAll = (selector) => typeof document.querySelectorAll === 'function'
    ? Array.from(document.querySelectorAll(selector))
    : []

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

  const syncButtons = selectAll('[data-action="context-graph-sync"]')
  const syncStatuses = selectAll('[data-setting-status="context-graph-status"]')
  const syncStats = selectAll('[data-setting-status="context-graph-stats"]')
  const syncProgress = selectAll('[data-setting-status="context-graph-progress"]')
  const syncWarnings = selectAll('[data-setting-status="context-graph-warning"]')
  const syncErrors = selectAll('[data-setting-error="context-graph-error"]')
  const pruneButtons = selectAll('[data-action="context-graph-prune"]')
  const pruneStatuses = selectAll('[data-setting-status="context-graph-prune-status"]')
  const graphStatusPill = document.getElementById('context-graph-status-pill')
  const graphStatusDot = document.getElementById('context-graph-status-dot')
  const graphStatusLabel = document.getElementById('context-graph-status-label')
  const graphPercent = document.getElementById('context-graph-percent')
  const graphBarSynced = document.getElementById('context-graph-bar-synced')
  const graphBarPending = document.getElementById('context-graph-bar-pending')
  const graphBarNew = document.getElementById('context-graph-bar-new')
  const graphSyncedCount = document.getElementById('context-graph-synced-count')
  const graphPendingCount = document.getElementById('context-graph-pending-count')
  const graphNewCount = document.getElementById('context-graph-new-count')
  const graphIgnoredCount = document.getElementById('context-graph-ignored-count')
  const updateButtons = selectAll('[data-action="updates-check"]')
  const updateStatuses = selectAll('[data-setting-status="updates-status"]')
  const updateErrors = selectAll('[data-setting-error="updates-error"]')

  const exclusionsLists = selectAll('[data-setting-list="exclusions"]')
  const addExclusionButtons = selectAll('[data-action="add-exclusion"]')
  const exclusionsErrors = selectAll('[data-setting-error="exclusions-error"]')

  const hotkeyButtons = selectAll('.hotkey-recorder')
  const captureHotkeyButtons = hotkeyButtons.filter((button) => button.dataset.hotkeyRole === 'capture')
  const clipboardHotkeyButtons = hotkeyButtons.filter((button) => button.dataset.hotkeyRole === 'clipboard')
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

  let currentContextFolderPath = ''
  let currentLlmProviderName = ''
  let currentLlmApiKey = ''
  let pendingLlmApiKey = ''
  let isLlmApiKeySaved = false
  let currentCaptureHotkey = DEFAULT_CAPTURE_HOTKEY
  let currentClipboardHotkey = DEFAULT_CLIPBOARD_HOTKEY
  let currentExclusions = []
  let isContextGraphSynced = false
  let hasCompletedSync = false
  let isFirstRun = false
  let wizardApi = null
  let exclusionsApi = null
  let hotkeysApi = null
  let historyApi = null
  let updatesApi = null
  let settingsApi = null
  let graphApi = null

  const updateWizardUI = () => {
    if (wizardApi && wizardApi.updateWizardUI) {
      wizardApi.updateWizardUI()
    }
  }

  const setHotkeyValue = (role, value) => {
    const nextValue = value || ''
    if (role === 'capture') {
      currentCaptureHotkey = nextValue
      return
    }
    currentClipboardHotkey = nextValue
  }

  const setExclusionsState = (exclusions) => {
    currentExclusions = Array.isArray(exclusions) ? [...exclusions] : []
  }

  const setExclusionsValue = (exclusions) => {
    if (exclusionsApi && exclusionsApi.setExclusions) {
      exclusionsApi.setExclusions(exclusions)
      return
    }
    setExclusionsState(exclusions)
  }

  const SECTION_META = {
    wizard: {
      title: 'Setup Wizard',
      subtitle: 'Guided setup in five steps.'
    },
    general: {
      title: 'General Settings',
      subtitle: 'Core app configuration and provider setup.'
    },
    graph: {
      title: 'Context Graph',
      subtitle: 'Monitor sync health and graph status.'
    },
    exclusions: {
      title: 'Exclusions',
      subtitle: 'Paths skipped during sync and capture.'
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
    }
  }

  const setActiveSection = (nextSection) => {
    if (!SECTION_META[nextSection]) {
      console.warn('Unknown settings section', nextSection)
      return
    }

    const isWizard = nextSection === 'wizard'

    sectionPanes.forEach((pane) => {
      const isActive = pane.dataset.sectionPane === nextSection
      pane.classList.toggle('hidden', !isActive)
      pane.setAttribute('aria-hidden', String(!isActive))
      if (isActive) {
        pane.classList.remove('pane-enter')
        void pane.offsetHeight
        pane.classList.add('pane-enter')
      }
    })

    sectionNavButtons.forEach((button) => {
      const isActive = button.dataset.sectionTarget === nextSection
      button.dataset.active = isActive ? 'true' : 'false'
      button.setAttribute('aria-selected', String(isActive))
      button.tabIndex = isActive ? 0 : -1
    })

    if (sectionTitle) {
      sectionTitle.textContent = SECTION_META[nextSection].title
    }
    if (sectionSubtitle) {
      sectionSubtitle.textContent = SECTION_META[nextSection].subtitle
    }

    if (settingsHeader) {
      settingsHeader.classList.toggle('hidden', isWizard)
    }
    if (settingsContent) {
      settingsContent.classList.toggle('hidden', isWizard)
    }
    if (isWizard) {
      updateWizardUI()
    }
    if (historyApi && historyApi.handleSectionChange) {
      historyApi.handleSectionChange(nextSection)
    }
    if (graphApi && graphApi.handleSectionChange) {
      graphApi.handleSectionChange(nextSection)
    }

    console.log('Settings section changed', { section: nextSection })
  }

  if (window.JiminyWizard && typeof window.JiminyWizard.createWizard === 'function') {
    wizardApi = window.JiminyWizard.createWizard({
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
      getState: () => ({
        currentContextFolderPath,
        currentLlmProviderName,
        currentLlmApiKey,
        isLlmApiKeySaved,
        hasCompletedSync,
        isContextGraphSynced,
        currentCaptureHotkey,
        currentClipboardHotkey
      }),
      onDone: () => {
        setActiveSection('general')
      }
    })
  }

  if (sectionNavButtons.length > 0) {
    sectionNavButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const target = button.dataset.sectionTarget
        if (target) {
          setActiveSection(target)
        }
      })
    })
  }

  const setMessage = (elements, message) => {
    const targets = Array.isArray(elements) ? elements : [elements]
    const value = message || ''
    targets.filter(Boolean).forEach((element) => {
      element.textContent = value
      element.classList.toggle('hidden', !value)
    })
  }

  if (window.JiminyGraph && typeof window.JiminyGraph.createGraph === 'function') {
    graphApi = window.JiminyGraph.createGraph({
      elements: {
        syncButtons,
        syncStatuses,
        syncStats,
        syncProgress,
        syncWarnings,
        syncErrors,
        pruneButtons,
        pruneStatuses,
        statusPill: graphStatusPill,
        statusDot: graphStatusDot,
        statusLabel: graphStatusLabel,
        percentLabel: graphPercent,
        barSynced: graphBarSynced,
        barPending: graphBarPending,
        barNew: graphBarNew,
        syncedCount: graphSyncedCount,
        pendingCount: graphPendingCount,
        newCount: graphNewCount,
        ignoredCount: graphIgnoredCount
      },
      jiminy,
      getState: () => ({
        currentContextFolderPath,
        currentExclusions,
        isContextGraphSynced,
        hasCompletedSync
      }),
      setGraphState: (updates = {}) => {
        if ('isContextGraphSynced' in updates) {
          isContextGraphSynced = updates.isContextGraphSynced
        }
        if ('hasCompletedSync' in updates && updates.hasCompletedSync !== undefined) {
          hasCompletedSync = updates.hasCompletedSync
        }
        updateWizardUI()
      },
      setMessage,
      updateWizardUI
    })
  }

  if (window.JiminyHistory && typeof window.JiminyHistory.createHistory === 'function') {
    historyApi = window.JiminyHistory.createHistory({
      elements: {
        historyList,
        historyEmpty,
        historyError
      },
      jiminy,
      setMessage
    })
  }

  if (window.JiminyUpdates && typeof window.JiminyUpdates.createUpdates === 'function') {
    updatesApi = window.JiminyUpdates.createUpdates({
      elements: {
        updateButtons,
        updateStatuses,
        updateErrors
      },
      jiminy,
      setMessage
    })
  }

  const setInputValues = (elements, value) => {
    elements.forEach((element) => {
      if (element.value !== value) {
        element.value = value
      }
    })
  }

  const setContextFolderValue = (value) => {
    const nextValue = value || ''
    if (currentContextFolderPath !== nextValue) {
      hasCompletedSync = false
      isContextGraphSynced = false
    }
    currentContextFolderPath = nextValue
    setInputValues(contextFolderInputs, currentContextFolderPath)
    if (graphApi && graphApi.updatePruneButtonState) {
      graphApi.updatePruneButtonState()
    }
    updateWizardUI()
  }

  const setLlmProviderValue = (value) => {
    currentLlmProviderName = value || ''
    llmProviderSelects.forEach((select) => {
      if (select.value !== currentLlmProviderName) {
        select.value = currentLlmProviderName
      }
    })
    updateWizardUI()
  }

  const setLlmApiKeyPending = (value) => {
    pendingLlmApiKey = value || ''
    setInputValues(llmKeyInputs, pendingLlmApiKey)
    isLlmApiKeySaved = pendingLlmApiKey.length > 0 && pendingLlmApiKey === currentLlmApiKey
    updateWizardUI()
  }

  const setLlmApiKeySaved = (value) => {
    currentLlmApiKey = value || ''
    setLlmApiKeyPending(currentLlmApiKey)
    isLlmApiKeySaved = Boolean(currentLlmApiKey)
    updateWizardUI()
  }

  if (window.JiminySettings && typeof window.JiminySettings.createSettings === 'function') {
    settingsApi = window.JiminySettings.createSettings({
      elements: {
        contextFolderChooseButtons,
        contextFolderErrors,
        contextFolderStatuses,
        llmProviderSelects,
        llmProviderErrors,
        llmKeyInputs,
        llmKeyErrors,
        llmKeyStatuses,
        hotkeysErrors,
        hotkeysStatuses
      },
      jiminy,
      defaults: {
        capture: DEFAULT_CAPTURE_HOTKEY,
        clipboard: DEFAULT_CLIPBOARD_HOTKEY
      },
      getState: () => ({
        currentContextFolderPath,
        currentLlmProviderName,
        currentLlmApiKey,
        pendingLlmApiKey,
        currentExclusions
      }),
      setContextFolderValue,
      setLlmProviderValue,
      setLlmApiKeyPending,
      setLlmApiKeySaved,
      setHotkeys: (hotkeys) => {
        if (hotkeysApi && hotkeysApi.setHotkeys) {
          hotkeysApi.setHotkeys(hotkeys)
          return
        }
        setHotkeyValue('capture', hotkeys.capture)
        setHotkeyValue('clipboard', hotkeys.clipboard)
        updateWizardUI()
      },
      setExclusions: setExclusionsValue,
      setMessage,
      refreshContextGraphStatus: (options) => {
        if (graphApi && graphApi.refreshContextGraphStatus) {
          return graphApi.refreshContextGraphStatus(options)
        }
        return undefined
      },
      updatePruneButtonState: () => {
        if (graphApi && graphApi.updatePruneButtonState) {
          graphApi.updatePruneButtonState()
        }
      },
      updateWizardUI
    })
  }

  if (!settingsApi) {
    setMessage(contextFolderErrors, 'Settings module unavailable. Restart the app.')
    setMessage(llmProviderErrors, 'Settings module unavailable. Restart the app.')
    setMessage(llmKeyErrors, 'Settings module unavailable. Restart the app.')
    setMessage(hotkeysErrors, 'Settings module unavailable. Restart the app.')
    if (graphApi && graphApi.updatePruneButtonState) {
      graphApi.updatePruneButtonState()
    }
    return
  }

  if (!settingsApi.isReady) {
    return
  }

  if (window.JiminyExclusions && typeof window.JiminyExclusions.createExclusions === 'function') {
    exclusionsApi = window.JiminyExclusions.createExclusions({
      elements: {
        exclusionsLists,
        addExclusionButtons,
        exclusionsErrors
      },
      jiminy,
      getState: () => ({
        currentContextFolderPath,
        currentExclusions
      }),
      setExclusions: (exclusions) => {
        setExclusionsState(exclusions)
      },
      setMessage,
      refreshContextGraphStatus: (options) => {
        if (graphApi && graphApi.refreshContextGraphStatus) {
          return graphApi.refreshContextGraphStatus(options)
        }
        return undefined
      }
    })
  }

  if (window.JiminyHotkeys && typeof window.JiminyHotkeys.createHotkeys === 'function') {
    hotkeysApi = window.JiminyHotkeys.createHotkeys({
      elements: {
        hotkeyButtons,
        captureHotkeyButtons,
        clipboardHotkeyButtons,
        hotkeysSaveButtons,
        hotkeysResetButtons,
        hotkeysStatuses,
        hotkeysErrors
      },
      jiminy,
      setMessage,
      updateWizardUI,
      getState: () => ({
        currentCaptureHotkey,
        currentClipboardHotkey
      }),
      setHotkeyValue,
      defaults: {
        capture: DEFAULT_CAPTURE_HOTKEY,
        clipboard: DEFAULT_CLIPBOARD_HOTKEY
      }
    })
  }

  const initialize = async () => {
    if (graphApi && graphApi.showLoading) {
      graphApi.showLoading()
    }
    const settingsResult = await settingsApi.loadSettings()
    isFirstRun = Boolean(settingsResult?.isFirstRun)
    if (graphApi && graphApi.refreshContextGraphStatus) {
      await graphApi.refreshContextGraphStatus()
    }
    const defaultSection = isFirstRun ? 'wizard' : 'general'
    setActiveSection(defaultSection)
    updateWizardUI()
  }

  void initialize()
})
