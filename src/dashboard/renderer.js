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
        } else if (moduleExports && typeof moduleExports.createSettings === 'function') {
          window.JiminySettings = moduleExports
        }
      } catch (error) {
        console.warn(`Failed to load ${globalKey} module`, error)
      }
    }

    loadModule('JiminyWizard', './wizard.js')
    loadModule('JiminyExclusions', './exclusions.js')
    loadModule('JiminyHotkeys', './hotkeys.js')
    loadModule('JiminyHistory', './history.js')
    loadModule('JiminySettings', './settings.js')
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
  let settingsApi = null

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
      subtitle: 'Core app configuration and sync controls.'
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

  let isSyncing = false
  let isMaxNodesExceeded = false
  let isPruning = false

  const setMessage = (elements, message) => {
    const targets = Array.isArray(elements) ? elements : [elements]
    const value = message || ''
    targets.filter(Boolean).forEach((element) => {
      element.textContent = value
      element.classList.toggle('hidden', !value)
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
    updatePruneButtonState()
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

  const updateSyncButtonState = () => {
    syncButtons.forEach((button) => {
      button.disabled = isSyncing || isPruning || isMaxNodesExceeded
    })
  }

  const updatePruneButtonState = () => {
    const hasContextPath = Boolean(currentContextFolderPath)
    pruneButtons.forEach((button) => {
      button.disabled = isSyncing || isPruning || !hasContextPath
    })
  }

  const setSyncState = (nextIsSyncing) => {
    isSyncing = Boolean(nextIsSyncing)
    updateSyncButtonState()
    updatePruneButtonState()
  }

  const setPruneState = (nextIsPruning) => {
    isPruning = Boolean(nextIsPruning)
    updateSyncButtonState()
    updatePruneButtonState()
  }

  const showContextGraphLoading = () => {
    syncButtons.forEach((button) => {
      button.hidden = true
    })
    setMessage(syncStats, '')
    setMessage(syncProgress, 'Loading...')
  }

  const showContextGraphCounts = ({ syncedNodes, outOfSyncNodes, newNodes, totalNodes }) => {
    syncButtons.forEach((button) => {
      button.hidden = false
    })
    const statsText = `Synced: ${syncedNodes}/${totalNodes} | Out of sync: ${outOfSyncNodes}/${totalNodes} | New: ${newNodes}`
    setMessage(syncStats, statsText)
    setMessage(syncProgress, '')
  }

  const refreshContextGraphStatus = async (options = {}) => {
    if (!jiminy.getContextGraphStatus) {
      setMessage(syncErrors, 'Context graph status bridge unavailable. Restart the app.')
      syncButtons.forEach((button) => {
        button.hidden = false
      })
      showContextGraphCounts({ syncedNodes: 0, outOfSyncNodes: 0, newNodes: 0, totalNodes: 0 })
      return
    }

    if (isSyncing) {
      return
    }

    showContextGraphLoading()
    isMaxNodesExceeded = false
    updateSyncButtonState()

    try {
      const contextFolderPath = typeof options.contextFolderPath === 'string'
        ? options.contextFolderPath
        : currentContextFolderPath
      const exclusions = Array.isArray(options.exclusions) ? options.exclusions : currentExclusions
      const result = await jiminy.getContextGraphStatus({ contextFolderPath, exclusions })
      const syncedNodes = Number(result?.syncedNodes ?? 0)
      const outOfSyncNodes = Number(result?.outOfSyncNodes ?? 0)
      const newNodes = Number(result?.newNodes ?? 0)
      const totalNodes = Number(result?.totalNodes ?? 0)
      isMaxNodesExceeded = Boolean(result?.maxNodesExceeded)

      if (isMaxNodesExceeded) {
        setMessage(syncErrors, result?.message || 'Context graph exceeds MAX_NODES.')
      } else {
        setMessage(syncErrors, '')
      }

      showContextGraphCounts({ syncedNodes, outOfSyncNodes, newNodes, totalNodes })
      isContextGraphSynced = totalNodes > 0 && outOfSyncNodes === 0 && newNodes === 0 && syncedNodes === totalNodes
      if (isContextGraphSynced) {
        hasCompletedSync = true
      }
      updateWizardUI()
    } catch (error) {
      console.error('Failed to load context graph status', error)
      isMaxNodesExceeded = false
      setMessage(syncErrors, 'Failed to load context graph status.')
      showContextGraphCounts({ syncedNodes: 0, outOfSyncNodes: 0, newNodes: 0, totalNodes: 0 })
    } finally {
      updateSyncButtonState()
    }
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
      refreshContextGraphStatus,
      updatePruneButtonState,
      updateWizardUI
    })
  }

  if (!settingsApi) {
    setMessage(contextFolderErrors, 'Settings module unavailable. Restart the app.')
    setMessage(llmProviderErrors, 'Settings module unavailable. Restart the app.')
    setMessage(llmKeyErrors, 'Settings module unavailable. Restart the app.')
    setMessage(hotkeysErrors, 'Settings module unavailable. Restart the app.')
    updatePruneButtonState()
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
      refreshContextGraphStatus
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

  if (jiminy.onContextGraphProgress && syncProgress.length > 0) {
    jiminy.onContextGraphProgress((payload) => {
      if (!payload) {
        return
      }

      const progressText = `${payload.completed}/${payload.total}` +
        (payload.relativePath ? ` • ${payload.relativePath}` : '')
      setMessage(syncProgress, progressText)
    })
  }

  if (syncButtons.length > 0) {
    syncButtons.forEach((button) => {
      button.addEventListener('click', async () => {
        if (!jiminy.syncContextGraph) {
          setMessage(syncErrors, 'Sync bridge unavailable. Restart the app.')
          return
        }

        let shouldRefreshStatus = false
        setMessage(syncErrors, '')
        setMessage(syncStatuses, 'Syncing...')
        setMessage(syncWarnings, '')
        setMessage(syncProgress, '0/0')
        setSyncState(true)

        try {
          const result = await jiminy.syncContextGraph()
          if (result && result.ok) {
            const warnings = Array.isArray(result.warnings) ? result.warnings : []
            const errorCount = Array.isArray(result.errors) ? result.errors.length : 0
            const message = errorCount > 0
              ? `Sync completed with ${errorCount} error${errorCount === 1 ? '' : 's'}.`
              : warnings.length > 0
                ? 'Sync completed with warnings.'
                : 'Sync complete.'
            setMessage(syncStatuses, message)
            if (warnings.length > 0) {
              const warningText = warnings[0]?.path
                ? `Warning: cycle detected at ${warnings[0].path}.`
                : 'Warning: cycle detected in context folder.'
              setMessage(syncWarnings, warningText)
            }
            shouldRefreshStatus = true
            hasCompletedSync = true
            updateWizardUI()
          } else {
            setMessage(syncStatuses, '')
            setMessage(syncWarnings, '')
            setMessage(syncErrors, result?.message || 'Failed to sync context graph.')
          }
        } catch (error) {
          console.error('Failed to sync context graph', error)
          setMessage(syncStatuses, '')
          setMessage(syncWarnings, '')
          setMessage(syncErrors, 'Failed to sync context graph.')
        } finally {
          setSyncState(false)
          if (shouldRefreshStatus) {
            await refreshContextGraphStatus()
          }
        }
      })
    })
  }

  if (pruneButtons.length > 0) {
    pruneButtons.forEach((button) => {
      button.addEventListener('click', async () => {
        if (!jiminy.pruneContextGraph) {
          setMessage(syncErrors, 'Prune bridge unavailable. Restart the app.')
          return
        }

        setMessage(syncErrors, '')
        setMessage(pruneStatuses, 'Pruning...')
        setPruneState(true)

        try {
          const result = await jiminy.pruneContextGraph()
          if (result && result.ok) {
            const message = result.deleted ? 'Pruned.' : 'Nothing to prune.'
            setMessage(pruneStatuses, message)
            await refreshContextGraphStatus()
          } else {
            setMessage(pruneStatuses, '')
            setMessage(syncErrors, result?.message || 'Failed to prune context graph.')
          }
        } catch (error) {
          console.error('Failed to prune context graph', error)
          setMessage(pruneStatuses, '')
          setMessage(syncErrors, 'Failed to prune context graph.')
        } finally {
          setPruneState(false)
        }
      })
    })
  }

  const initialize = async () => {
    showContextGraphLoading()
    const settingsResult = await settingsApi.loadSettings()
    isFirstRun = Boolean(settingsResult?.isFirstRun)
    await refreshContextGraphStatus()
    const defaultSection = isFirstRun ? 'wizard' : 'general'
    setActiveSection(defaultSection)
    updateWizardUI()
  }

  void initialize()
})
