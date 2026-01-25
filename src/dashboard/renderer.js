document.addEventListener('DOMContentLoaded', () => {
  const jiminy = window.jiminy || {}
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
  const wizardStepCircles = selectAll('[data-wizard-step-circle]')
  const wizardStepLabels = selectAll('[data-wizard-step-label]')
  const wizardStepConnectors = selectAll('[data-wizard-step-connector]')

  const contextFolderInputs = selectAll('[data-setting="context-folder-path"]')
  const contextFolderChooseButtons = selectAll('[data-action="context-folder-choose"]')
  const contextFolderErrors = selectAll('[data-setting-error="context-folder-error"]')
  const contextFolderStatuses = selectAll('[data-setting-status="context-folder-status"]')

  const llmProviderSelects = selectAll('[data-setting="llm-provider"]')
  const llmProviderErrors = selectAll('[data-setting-error="llm-provider-error"]')
  const llmKeyInputs = selectAll('[data-setting="llm-api-key"]')
  const llmKeySaveButtons = selectAll('[data-action="llm-api-key-save"]')
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

  const DEFAULT_CAPTURE_HOTKEY = 'CommandOrControl+Shift+J'
  const DEFAULT_CLIPBOARD_HOTKEY = 'CommandOrControl+J'

  const WIZARD_STEP_COUNT = 5

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
  let wizardStep = 1
  let isFirstRun = false
  let recordingElement = null

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
    }
  }

  const isWizardStepComplete = (step) => {
    switch (step) {
      case 1:
        return Boolean(currentContextFolderPath)
      case 2:
        return Boolean(currentContextFolderPath)
      case 3:
        return Boolean(currentLlmProviderName && currentLlmApiKey && isLlmApiKeySaved)
      case 4:
        return Boolean(hasCompletedSync || isContextGraphSynced)
      case 5:
        return Boolean(currentCaptureHotkey || currentClipboardHotkey)
      default:
        return false
    }
  }

  const setWizardStep = (step) => {
    const nextStep = Math.max(1, Math.min(WIZARD_STEP_COUNT, Number(step) || 1))
    wizardStep = nextStep
    console.log('Wizard step changed', { step: wizardStep })
    updateWizardUI()
  }

  const updateWizardUI = () => {
    if (!wizardSection) {
      return
    }

    wizardStepPanels.forEach((panel) => {
      const step = Number(panel.dataset.wizardStep)
      panel.classList.toggle('hidden', step !== wizardStep)
    })

    const canAdvance = isWizardStepComplete(wizardStep)

    if (wizardBackButton) {
      wizardBackButton.disabled = wizardStep <= 1
    }

    if (wizardNextButton) {
      wizardNextButton.classList.toggle('hidden', wizardStep >= WIZARD_STEP_COUNT)
      wizardNextButton.disabled = !canAdvance
    }

    if (wizardDoneButton) {
      const isDoneStep = wizardStep >= WIZARD_STEP_COUNT
      wizardDoneButton.classList.toggle('hidden', !isDoneStep)
      wizardDoneButton.disabled = !canAdvance
    }

    if (wizardCompleteStatus) {
      wizardCompleteStatus.classList.toggle('hidden', !(wizardStep === WIZARD_STEP_COUNT && canAdvance))
    }

    if (wizardStepStatus) {
      const needsAction = !canAdvance
      wizardStepStatus.textContent = needsAction ? 'Complete this step to continue.' : ''
      wizardStepStatus.classList.toggle('hidden', !needsAction)
    }

    wizardStepIndicators.forEach((indicator) => {
      const step = Number(indicator.dataset.wizardStepIndicator)
      const isActive = step === wizardStep
      const isComplete = step < wizardStep
      const circle = indicator.querySelector('[data-wizard-step-circle]')
      const label = indicator.querySelector('[data-wizard-step-label]')

      toggleClasses(circle, ['border-indigo-600', 'text-indigo-600', 'bg-indigo-50', 'dark:bg-indigo-900/30'], isActive)
      toggleClasses(circle, ['bg-indigo-600', 'text-white', 'border-indigo-600'], isComplete)
      toggleClasses(circle, ['border-zinc-200', 'dark:border-zinc-700', 'text-zinc-500'], !isActive && !isComplete)

      toggleClasses(label, ['text-zinc-900', 'dark:text-zinc-100', 'font-semibold'], isActive)
      toggleClasses(label, ['text-indigo-600', 'dark:text-indigo-400'], isComplete)
      toggleClasses(label, ['text-zinc-500', 'dark:text-zinc-400'], !isActive && !isComplete)
    })

    wizardStepConnectors.forEach((connector) => {
      const stepIndex = Number(connector.dataset.wizardStepConnector)
      connector.style.width = wizardStep > stepIndex ? '100%' : '0%'
    })
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

    console.log('Settings section changed', { section: nextSection })
  }

  /**
   * Convert a KeyboardEvent to an Electron accelerator string
   */
  const keyEventToAccelerator = (event) => {
    const parts = []

    // Modifiers - use CommandOrControl for cross-platform compatibility
    if (event.metaKey || event.ctrlKey) {
      parts.push('CommandOrControl')
    }
    if (event.altKey) {
      parts.push('Alt')
    }
    if (event.shiftKey) {
      parts.push('Shift')
    }

    // Get the actual key
    let key = event.key

    // Skip if only modifier keys are pressed
    if (['Meta', 'Control', 'Alt', 'Shift'].includes(key)) {
      return null
    }

    // Map special keys to Electron accelerator names
    const keyMap = {
      ' ': 'Space',
      'ArrowUp': 'Up',
      'ArrowDown': 'Down',
      'ArrowLeft': 'Left',
      'ArrowRight': 'Right',
      'Escape': 'Escape',
      'Enter': 'Return',
      'Backspace': 'Backspace',
      'Delete': 'Delete',
      'Tab': 'Tab',
      'Home': 'Home',
      'End': 'End',
      'PageUp': 'PageUp',
      'PageDown': 'PageDown',
      'Insert': 'Insert'
    }

    if (keyMap[key]) {
      key = keyMap[key]
    } else if (key.length === 1) {
      // Single character - uppercase it
      key = key.toUpperCase()
    } else if (key.startsWith('F') && /^F\d+$/.test(key)) {
      // Function keys (F1-F12) - keep as is
    } else {
      // Unknown key
      return null
    }

    // Must have at least one modifier for a global hotkey
    if (parts.length === 0) {
      return null
    }

    parts.push(key)
    return parts.join('+')
  }

  /**
   * Format an accelerator string for display
   */
  const formatAcceleratorForDisplay = (accelerator) => {
    if (!accelerator) return 'Click to set...'

    // Replace CommandOrControl with platform-specific symbol
    const isMac = jiminy.platform === 'darwin'
    return accelerator
      .replace(/CommandOrControl/g, isMac ? '⌘' : 'Ctrl')
      .replace(/Command/g, '⌘')
      .replace(/Control/g, 'Ctrl')
      .replace(/Alt/g, isMac ? '⌥' : 'Alt')
      .replace(/Shift/g, isMac ? '⇧' : 'Shift')
      .replace(/\+/g, ' + ')
  }

  /**
   * Update a hotkey button's display
   */
  const updateHotkeyDisplay = (role, accelerator) => {
    const buttons = role === 'capture' ? captureHotkeyButtons : clipboardHotkeyButtons
    const value = accelerator || ''
    buttons.forEach((button) => {
      button.dataset.hotkey = value
      button.textContent = formatAcceleratorForDisplay(value)
    })
    if (role === 'capture') {
      currentCaptureHotkey = value
    } else {
      currentClipboardHotkey = value
    }
    updateWizardUI()
  }

  /**
   * Start recording mode for a hotkey button
   */
  const startRecording = async (button) => {
    if (recordingElement) {
      await stopRecording(recordingElement)
    }

    // Suspend global hotkeys so they don't trigger during recording
    if (jiminy.suspendHotkeys) {
      try {
        await jiminy.suspendHotkeys()
        console.log('Global hotkeys suspended for recording')
      } catch (error) {
        console.error('Failed to suspend hotkeys', error)
        setMessage(hotkeysErrors, 'Failed to suspend hotkeys. Try again or restart the app.')
      }
    }

    recordingElement = button
    button.textContent = 'Press keys...'
    button.classList.add('ring-2', 'ring-indigo-500', 'bg-indigo-50', 'dark:bg-indigo-900/30')
  }

  /**
   * Stop recording mode for a hotkey button
   */
  const stopRecording = async (button) => {
    if (!button) return true
    button.classList.remove('ring-2', 'ring-indigo-500', 'bg-indigo-50', 'dark:bg-indigo-900/30')
    const role = button.dataset.hotkeyRole || 'capture'
    updateHotkeyDisplay(role, button.dataset.hotkey)

    const wasRecording = recordingElement === button
    if (wasRecording) {
      recordingElement = null
    }

    let resumeOk = true
    // Resume global hotkeys after recording ends
    if (wasRecording && jiminy.resumeHotkeys) {
      try {
        await jiminy.resumeHotkeys()
        console.log('Global hotkeys resumed after recording')
      } catch (error) {
        console.error('Failed to resume hotkeys', error)
        setMessage(hotkeysErrors, 'Failed to resume hotkeys. Restart the app.')
        resumeOk = false
      }
    }

    return resumeOk
  }

  /**
   * Handle keydown during recording
   */
  const handleHotkeyKeydown = async (event) => {
    if (!recordingElement) return

    event.preventDefault()
    event.stopPropagation()

    const accelerator = keyEventToAccelerator(event)
    if (accelerator) {
      const button = recordingElement
      button.dataset.hotkey = accelerator
      const resumeOk = await stopRecording(button)
      if (resumeOk) {
        setMessage(hotkeysErrors, '')
      }
    }
  }

  // Set up hotkey recording
  const setupHotkeyRecorder = (button) => {
    if (!button) return

    button.addEventListener('click', () => {
      void startRecording(button)
    })

    button.addEventListener('blur', () => {
      // Small delay to allow keydown to process first
      setTimeout(() => {
        if (recordingElement === button) {
          void stopRecording(button)
        }
      }, 100)
    })

    button.addEventListener('keydown', (event) => {
      void handleHotkeyKeydown(event)
    })
  }

  hotkeyButtons.forEach((button) => setupHotkeyRecorder(button))

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

  if (wizardBackButton) {
    wizardBackButton.addEventListener('click', () => {
      setWizardStep(wizardStep - 1)
    })
  }

  if (wizardNextButton) {
    wizardNextButton.addEventListener('click', () => {
      if (!isWizardStepComplete(wizardStep)) {
        updateWizardUI()
        return
      }
      setWizardStep(wizardStep + 1)
    })
  }

  if (wizardDoneButton) {
    wizardDoneButton.addEventListener('click', () => {
      if (!isWizardStepComplete(wizardStep)) {
        updateWizardUI()
        return
      }
      setWizardStep(1)
      setActiveSection('general')
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

  const setInputValues = (elements, value) => {
    elements.forEach((element) => {
      if (element.value !== value) {
        element.value = value
      }
    })
  }

  const toggleClasses = (element, classes, isActive) => {
    if (!element) {
      return
    }
    classes.forEach((className) => {
      element.classList.toggle(className, isActive)
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

  const renderExclusions = () => {
    exclusionsLists.forEach((list) => {
      list.innerHTML = ''
      for (const exclusion of currentExclusions) {
        const li = document.createElement('li')
        li.className = 'flex items-center justify-between px-3 py-2 rounded-lg bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 text-[11px] text-zinc-700 dark:text-zinc-300 group'

        const pathSpan = document.createElement('span')
        pathSpan.className = 'truncate'
        pathSpan.textContent = exclusion
        pathSpan.title = exclusion

        const removeBtn = document.createElement('button')
        removeBtn.className = 'ml-2 px-1.5 py-0.5 rounded text-[11px] text-zinc-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-zinc-200 dark:hover:bg-zinc-800 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer'
        removeBtn.textContent = '×'
        removeBtn.title = 'Remove exclusion'
        removeBtn.addEventListener('click', () => removeExclusion(exclusion))

        li.appendChild(pathSpan)
        li.appendChild(removeBtn)
        list.appendChild(li)
      }
    })
  }

  const saveExclusions = async () => {
    if (!jiminy.saveSettings) return

    try {
      await jiminy.saveSettings({ exclusions: currentExclusions })
      console.log('Exclusions saved', currentExclusions)
      setMessage(exclusionsErrors, '')
      await refreshContextGraphStatus()
    } catch (error) {
      console.error('Failed to save exclusions', error)
      setMessage(exclusionsErrors, 'Failed to save exclusions.')
    }
  }

  const addExclusion = (path) => {
    if (!path || currentExclusions.includes(path)) return
    currentExclusions.push(path)
    currentExclusions.sort()
    renderExclusions()
    saveExclusions()
  }

  const removeExclusion = (path) => {
    currentExclusions = currentExclusions.filter((p) => p !== path)
    renderExclusions()
    saveExclusions()
  }

  const saveContextFolderPath = async (contextFolderPath) => {
    if (!jiminy.saveSettings) {
      return false
    }

    setMessage(contextFolderStatuses, 'Saving...')
    setMessage(contextFolderErrors, '')

    try {
      const result = await jiminy.saveSettings({ contextFolderPath })
      if (result && result.ok) {
        setMessage(contextFolderStatuses, 'Saved.')
        console.log('Context folder saved', contextFolderPath)
        return true
      }
      setMessage(contextFolderStatuses, '')
      setMessage(contextFolderErrors, result?.message || 'Failed to save settings.')
    } catch (error) {
      console.error('Failed to save settings', error)
      setMessage(contextFolderStatuses, '')
      setMessage(contextFolderErrors, 'Failed to save settings.')
    }

    return false
  }

  const saveLlmProviderSelection = async (providerName) => {
    if (!jiminy.saveSettings) {
      return false
    }

    if (!providerName) {
      setMessage(llmProviderErrors, 'Select an LLM provider.')
      updateWizardUI()
      return false
    }

    try {
      const result = await jiminy.saveSettings({ llmProviderName: providerName })
      if (result && result.ok) {
        console.log('LLM provider saved', { provider: providerName })
        setMessage(llmProviderErrors, '')
        setLlmProviderValue(providerName)
        return true
      }
      setMessage(llmProviderErrors, result?.message || 'Failed to save LLM provider.')
    } catch (error) {
      console.error('Failed to save LLM provider', error)
      setMessage(llmProviderErrors, 'Failed to save LLM provider.')
    }

    return false
  }

  const loadSettings = async () => {
    if (!jiminy.getSettings) {
      return
    }

    try {
      const result = await jiminy.getSettings()
      isFirstRun = Boolean(result?.isFirstRun)
      setContextFolderValue(result.contextFolderPath || '')
      setLlmProviderValue(result.llmProviderName || '')
      setLlmApiKeySaved(result.llmProviderApiKey || '')
      updateHotkeyDisplay('capture', result.captureHotkey || DEFAULT_CAPTURE_HOTKEY)
      updateHotkeyDisplay('clipboard', result.clipboardHotkey || DEFAULT_CLIPBOARD_HOTKEY)
      currentExclusions = Array.isArray(result.exclusions) ? [...result.exclusions] : []
      renderExclusions()
      setMessage(contextFolderErrors, result.validationMessage || '')
      setMessage(contextFolderStatuses, '')
      setMessage(llmProviderErrors, '')
      setMessage(llmKeyErrors, '')
      setMessage(llmKeyStatuses, '')
      setMessage(hotkeysErrors, '')
      setMessage(hotkeysStatuses, '')
      updatePruneButtonState()
      return result
    } catch (error) {
      console.error('Failed to load settings', error)
      setMessage(contextFolderErrors, 'Failed to load settings.')
      setMessage(llmProviderErrors, 'Failed to load settings.')
      setMessage(llmKeyErrors, 'Failed to load settings.')
      setMessage(hotkeysErrors, 'Failed to load settings.')
    }
    return null
  }

  if (!jiminy.pickContextFolder || !jiminy.saveSettings || !jiminy.getSettings) {
    setMessage(contextFolderErrors, 'Settings bridge unavailable. Restart the app.')
    setMessage(llmProviderErrors, 'Settings bridge unavailable. Restart the app.')
    setMessage(llmKeyErrors, 'Settings bridge unavailable. Restart the app.')
    setMessage(hotkeysErrors, 'Settings bridge unavailable. Restart the app.')
    updatePruneButtonState()
    return
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

  if (contextFolderChooseButtons.length > 0) {
    contextFolderChooseButtons.forEach((button) => {
      button.addEventListener('click', async () => {
        try {
          setMessage(contextFolderStatuses, 'Opening folder picker...')
          const result = await jiminy.pickContextFolder()
          if (result && !result.canceled && result.path) {
            setContextFolderValue(result.path)
            setMessage(contextFolderErrors, '')
            setMessage(contextFolderStatuses, '')
            const saved = await saveContextFolderPath(result.path)
            if (saved) {
              await refreshContextGraphStatus({ contextFolderPath: result.path, exclusions: currentExclusions })
            }
          } else if (result && result.error) {
            setMessage(contextFolderStatuses, '')
            setMessage(contextFolderErrors, result.error)
          } else {
            setMessage(contextFolderStatuses, '')
          }
        } catch (error) {
          console.error('Failed to pick context folder', error)
          setMessage(contextFolderStatuses, '')
          setMessage(contextFolderErrors, 'Failed to open folder picker.')
        }
      })
    })
  }

  llmKeyInputs.forEach((input) => {
    input.addEventListener('input', (event) => {
      setLlmApiKeyPending(event.target.value)
      setMessage(llmKeyStatuses, '')
      setMessage(llmKeyErrors, '')
    })
  })

  llmKeySaveButtons.forEach((button) => {
    button.addEventListener('click', async () => {
      setMessage(llmKeyStatuses, 'Saving...')
      setMessage(llmKeyErrors, '')
      setMessage(llmProviderErrors, '')

      if (!currentLlmProviderName) {
        setMessage(llmKeyStatuses, '')
        setMessage(llmProviderErrors, 'Select an LLM provider.')
        return
      }

      try {
        const result = await jiminy.saveSettings({
          llmProviderName: currentLlmProviderName,
          llmProviderApiKey: pendingLlmApiKey
        })
        if (result && result.ok) {
          setMessage(llmKeyStatuses, 'Saved.')
          setLlmApiKeySaved(pendingLlmApiKey)
        } else {
          setMessage(llmKeyStatuses, '')
          setMessage(llmKeyErrors, result?.message || 'Failed to save LLM key.')
        }
      } catch (error) {
        console.error('Failed to save LLM key', error)
        setMessage(llmKeyStatuses, '')
        setMessage(llmKeyErrors, 'Failed to save LLM key.')
      }
    })
  })

  llmProviderSelects.forEach((select) => {
    select.addEventListener('change', async () => {
      setMessage(llmProviderErrors, '')
      const nextValue = select.value
      llmProviderSelects.forEach((other) => {
        if (other.value !== nextValue) {
          other.value = nextValue
        }
      })
      await saveLlmProviderSelection(nextValue)
    })
  })

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

  if (addExclusionButtons.length > 0) {
    addExclusionButtons.forEach((button) => {
      button.addEventListener('click', async () => {
        if (!jiminy.pickExclusion) {
          console.error('pickExclusion not available')
          setMessage(exclusionsErrors, 'Exclusion picker unavailable. Restart the app.')
          return
        }

        const contextPath = currentContextFolderPath || ''
        if (!contextPath) {
          console.warn('No context folder selected')
          setMessage(exclusionsErrors, 'Select a context folder before adding exclusions.')
          return
        }

        try {
          const result = await jiminy.pickExclusion(contextPath)
          if (result && !result.canceled && result.path) {
            setMessage(exclusionsErrors, '')
            addExclusion(result.path)
          } else if (result && result.error) {
            console.error('Failed to pick exclusion:', result.error)
            setMessage(exclusionsErrors, result.error)
          }
        } catch (error) {
          console.error('Failed to pick exclusion', error)
          setMessage(exclusionsErrors, 'Failed to open exclusion picker.')
        }
      })
    })
  }

  if (hotkeysSaveButtons.length > 0) {
    hotkeysSaveButtons.forEach((button) => {
      button.addEventListener('click', async () => {
        setMessage(hotkeysStatuses, 'Saving...')
        setMessage(hotkeysErrors, '')

        const captureHotkey = currentCaptureHotkey
        const clipboardHotkey = currentClipboardHotkey

        if (!captureHotkey && !clipboardHotkey) {
          setMessage(hotkeysStatuses, '')
          setMessage(hotkeysErrors, 'At least one hotkey is required.')
          return
        }

        try {
          const result = await jiminy.saveSettings({ captureHotkey, clipboardHotkey })
          if (result && result.ok) {
            // Re-register hotkeys with the new values
            if (jiminy.reregisterHotkeys) {
              const reregisterResult = await jiminy.reregisterHotkeys()
              if (reregisterResult && reregisterResult.ok) {
                setMessage(hotkeysStatuses, 'Saved and applied.')
              } else {
                const captureError = reregisterResult?.captureHotkey?.ok === false
                const clipboardError = reregisterResult?.clipboardHotkey?.ok === false
                if (captureError || clipboardError) {
                  const errorParts = []
                  if (captureError) errorParts.push('capture')
                  if (clipboardError) errorParts.push('clipboard')
                  setMessage(hotkeysStatuses, 'Saved.')
                  setMessage(hotkeysErrors, `Failed to register ${errorParts.join(' and ')} hotkey. The shortcut may be in use by another app.`)
                } else {
                  setMessage(hotkeysStatuses, 'Saved.')
                }
              }
            } else {
              setMessage(hotkeysStatuses, 'Saved. Restart to apply.')
            }
          } else {
            setMessage(hotkeysStatuses, '')
            setMessage(hotkeysErrors, result?.message || 'Failed to save hotkeys.')
          }
        } catch (error) {
          console.error('Failed to save hotkeys', error)
          setMessage(hotkeysStatuses, '')
          setMessage(hotkeysErrors, 'Failed to save hotkeys.')
        }
      })
    })
  }

  if (hotkeysResetButtons.length > 0) {
    hotkeysResetButtons.forEach((button) => {
      button.addEventListener('click', () => {
        updateHotkeyDisplay('capture', DEFAULT_CAPTURE_HOTKEY)
        updateHotkeyDisplay('clipboard', DEFAULT_CLIPBOARD_HOTKEY)
        setMessage(hotkeysStatuses, '')
        setMessage(hotkeysErrors, '')
      })
    })
  }

  const initialize = async () => {
    showContextGraphLoading()
    await loadSettings()
    await refreshContextGraphStatus()
    const defaultSection = isFirstRun ? 'wizard' : 'general'
    setActiveSection(defaultSection)
    updateWizardUI()
  }

  void initialize()
})
