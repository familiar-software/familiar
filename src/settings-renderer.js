document.addEventListener('DOMContentLoaded', () => {
  const jiminy = window.jiminy || {}
  const contextFolderInput = document.getElementById('context-folder-path')
  const chooseButton = document.getElementById('context-folder-choose')
  const errorMessage = document.getElementById('context-folder-error')
  const statusMessage = document.getElementById('context-folder-status')
  const llmKeyInput = document.getElementById('llm-api-key')
  const llmKeySaveButton = document.getElementById('llm-api-key-save')
  const llmKeyError = document.getElementById('llm-api-key-error')
  const llmKeyStatus = document.getElementById('llm-api-key-status')
  const llmProviderSelect = document.getElementById('llm-provider')
  const llmProviderError = document.getElementById('llm-provider-error')
  const syncButton = document.getElementById('context-graph-sync')
  const syncStatus = document.getElementById('context-graph-status')
  const syncStats = document.getElementById('context-graph-stats')
  const syncProgress = document.getElementById('context-graph-progress')
  const syncWarning = document.getElementById('context-graph-warning')
  const syncError = document.getElementById('context-graph-error')
  const pruneButton = document.getElementById('context-graph-prune')
  const pruneStatus = document.getElementById('context-graph-prune-status')
  const advancedToggleBtn = document.getElementById('advanced-toggle-btn')
  const advancedOptions = document.getElementById('advanced-options')
  const exclusionsList = document.getElementById('exclusions-list')
  const addExclusionBtn = document.getElementById('add-exclusion')
  const exclusionsError = document.getElementById('exclusions-error')
  const captureHotkeyBtn = document.getElementById('capture-hotkey')
  const clipboardHotkeyBtn = document.getElementById('clipboard-hotkey')
  const hotkeysSaveButton = document.getElementById('hotkeys-save')
  const hotkeysResetButton = document.getElementById('hotkeys-reset')
  const hotkeysStatus = document.getElementById('hotkeys-status')
  const hotkeysError = document.getElementById('hotkeys-error')
  const sectionTitle = document.getElementById('section-title')
  const sectionSubtitle = document.getElementById('section-subtitle')
  const sectionNavButtons = typeof document.querySelectorAll === 'function'
    ? Array.from(document.querySelectorAll('[data-section-target]'))
    : []
  const sectionPanes = typeof document.querySelectorAll === 'function'
    ? Array.from(document.querySelectorAll('[data-section-pane]'))
    : []

  const DEFAULT_CAPTURE_HOTKEY = 'CommandOrControl+Shift+J'
  const DEFAULT_CLIPBOARD_HOTKEY = 'CommandOrControl+J'

  let currentExclusions = []
  let recordingElement = null

  const SECTION_META = {
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

  const setActiveSection = (nextSection) => {
    if (!SECTION_META[nextSection]) {
      console.warn('Unknown settings section', nextSection)
      return
    }

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
  const updateHotkeyDisplay = (button, accelerator) => {
    if (!button) return
    button.dataset.hotkey = accelerator || ''
    button.textContent = formatAcceleratorForDisplay(accelerator)
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
        setMessage(hotkeysError, 'Failed to suspend hotkeys. Try again or restart the app.')
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
    updateHotkeyDisplay(button, button.dataset.hotkey)

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
        setMessage(hotkeysError, 'Failed to resume hotkeys. Restart the app.')
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
        setMessage(hotkeysError, '')
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

  setupHotkeyRecorder(captureHotkeyBtn)
  setupHotkeyRecorder(clipboardHotkeyBtn)

  if (sectionNavButtons.length > 0) {
    sectionNavButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const target = button.dataset.sectionTarget
        if (target) {
          setActiveSection(target)
        }
      })
    })
    setActiveSection('general')
  }

  let isSyncing = false
  let isMaxNodesExceeded = false
  let isPruning = false

  const setMessage = (element, message) => {
    if (!element) {
      return
    }

    element.textContent = message || ''
    element.classList.toggle('hidden', !message)
  }

  const updateSyncButtonState = () => {
    if (!syncButton) {
      return
    }

    syncButton.disabled = isSyncing || isPruning || isMaxNodesExceeded
  }

  const updatePruneButtonState = () => {
    if (!pruneButton) {
      return
    }

    const hasContextPath = Boolean(contextFolderInput?.value)
    pruneButton.disabled = isSyncing || isPruning || !hasContextPath
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
    if (syncButton) {
      syncButton.hidden = true
    }
    setMessage(syncStats, '')
    setMessage(syncProgress, 'Loading...')
  }

  const showContextGraphCounts = ({ syncedNodes, outOfSyncNodes, newNodes, totalNodes }) => {
    if (syncButton) {
      syncButton.hidden = false
    }
    const statsText = `Synced: ${syncedNodes}/${totalNodes} | Out of sync: ${outOfSyncNodes}/${totalNodes} | New: ${newNodes}`
    setMessage(syncStats, statsText)
    setMessage(syncProgress, '')
  }

  const refreshContextGraphStatus = async (options = {}) => {
    if (!jiminy.getContextGraphStatus) {
      setMessage(syncError, 'Context graph status bridge unavailable. Restart the app.')
      if (syncButton) {
        syncButton.hidden = false
      }
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
        : contextFolderInput?.value || ''
      const exclusions = Array.isArray(options.exclusions) ? options.exclusions : currentExclusions
      const result = await jiminy.getContextGraphStatus({ contextFolderPath, exclusions })
      const syncedNodes = Number(result?.syncedNodes ?? 0)
      const outOfSyncNodes = Number(result?.outOfSyncNodes ?? 0)
      const newNodes = Number(result?.newNodes ?? 0)
      const totalNodes = Number(result?.totalNodes ?? 0)
      isMaxNodesExceeded = Boolean(result?.maxNodesExceeded)

      if (isMaxNodesExceeded) {
        setMessage(syncError, result?.message || 'Context graph exceeds MAX_NODES.')
      } else {
        setMessage(syncError, '')
      }

      showContextGraphCounts({ syncedNodes, outOfSyncNodes, newNodes, totalNodes })
    } catch (error) {
      console.error('Failed to load context graph status', error)
      isMaxNodesExceeded = false
      setMessage(syncError, 'Failed to load context graph status.')
      showContextGraphCounts({ syncedNodes: 0, outOfSyncNodes: 0, newNodes: 0, totalNodes: 0 })
    } finally {
      updateSyncButtonState()
    }
  }

  const renderExclusions = () => {
    if (!exclusionsList) return

    exclusionsList.innerHTML = ''
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
      exclusionsList.appendChild(li)
    }
  }

  const saveExclusions = async () => {
    if (!jiminy.saveSettings) return

    try {
      await jiminy.saveSettings({ exclusions: currentExclusions })
      console.log('Exclusions saved', currentExclusions)
      setMessage(exclusionsError, '')
      await refreshContextGraphStatus()
    } catch (error) {
      console.error('Failed to save exclusions', error)
      setMessage(exclusionsError, 'Failed to save exclusions.')
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

    setMessage(statusMessage, 'Saving...')
    setMessage(errorMessage, '')

    try {
      const result = await jiminy.saveSettings({ contextFolderPath })
      if (result && result.ok) {
        setMessage(statusMessage, 'Saved.')
        console.log('Context folder saved', contextFolderPath)
        return true
      }
      setMessage(statusMessage, '')
      setMessage(errorMessage, result?.message || 'Failed to save settings.')
    } catch (error) {
      console.error('Failed to save settings', error)
      setMessage(statusMessage, '')
      setMessage(errorMessage, 'Failed to save settings.')
    }

    return false
  }

  const saveLlmProviderSelection = async (providerName) => {
    if (!jiminy.saveSettings) {
      return false
    }

    if (!providerName) {
      setMessage(llmProviderError, 'Select an LLM provider.')
      return false
    }

    try {
      const result = await jiminy.saveSettings({ llmProviderName: providerName })
      if (result && result.ok) {
        console.log('LLM provider saved', { provider: providerName })
        return true
      }
      setMessage(llmProviderError, result?.message || 'Failed to save LLM provider.')
    } catch (error) {
      console.error('Failed to save LLM provider', error)
      setMessage(llmProviderError, 'Failed to save LLM provider.')
    }

    return false
  }

  const loadSettings = async () => {
    if (!jiminy.getSettings || !contextFolderInput) {
      return
    }

    try {
      const result = await jiminy.getSettings()
      contextFolderInput.value = result.contextFolderPath || ''
      if (llmKeyInput) {
        llmKeyInput.value = result.llmProviderApiKey || ''
      }
      if (llmProviderSelect) {
        llmProviderSelect.value = result.llmProviderName || ''
      }
      if (captureHotkeyBtn) {
        updateHotkeyDisplay(captureHotkeyBtn, result.captureHotkey || DEFAULT_CAPTURE_HOTKEY)
      }
      if (clipboardHotkeyBtn) {
        updateHotkeyDisplay(clipboardHotkeyBtn, result.clipboardHotkey || DEFAULT_CLIPBOARD_HOTKEY)
      }
      currentExclusions = Array.isArray(result.exclusions) ? [...result.exclusions] : []
      renderExclusions()
      setMessage(errorMessage, result.validationMessage || '')
      setMessage(statusMessage, '')
      setMessage(llmProviderError, '')
      setMessage(llmKeyError, '')
      setMessage(llmKeyStatus, '')
      setMessage(hotkeysError, '')
      setMessage(hotkeysStatus, '')
      updatePruneButtonState()
      return result
    } catch (error) {
      console.error('Failed to load settings', error)
      setMessage(errorMessage, 'Failed to load settings.')
      setMessage(llmProviderError, 'Failed to load settings.')
      setMessage(llmKeyError, 'Failed to load settings.')
      setMessage(hotkeysError, 'Failed to load settings.')
    }
    return null
  }

  if (!jiminy.pickContextFolder || !jiminy.saveSettings || !jiminy.getSettings) {
    setMessage(errorMessage, 'Settings bridge unavailable. Restart the app.')
    setMessage(llmProviderError, 'Settings bridge unavailable. Restart the app.')
    setMessage(llmKeyError, 'Settings bridge unavailable. Restart the app.')
    setMessage(hotkeysError, 'Settings bridge unavailable. Restart the app.')
    updatePruneButtonState()
    return
  }

  if (jiminy.onContextGraphProgress && syncProgress) {
    jiminy.onContextGraphProgress((payload) => {
      if (!payload) {
        return
      }

      const progressText = `${payload.completed}/${payload.total}` +
        (payload.relativePath ? ` • ${payload.relativePath}` : '')
      setMessage(syncProgress, progressText)
    })
  }

  if (chooseButton) {
    chooseButton.addEventListener('click', async () => {
      try {
        setMessage(statusMessage, 'Opening folder picker...')
        const result = await jiminy.pickContextFolder()
        if (result && !result.canceled && result.path && contextFolderInput) {
          contextFolderInput.value = result.path
          setMessage(errorMessage, '')
          setMessage(statusMessage, '')
          updatePruneButtonState()
          const saved = await saveContextFolderPath(result.path)
          if (saved) {
            await refreshContextGraphStatus({ contextFolderPath: result.path, exclusions: currentExclusions })
          }
        } else if (result && result.error) {
          setMessage(statusMessage, '')
          setMessage(errorMessage, result.error)
        } else {
          setMessage(statusMessage, '')
        }
      } catch (error) {
        console.error('Failed to pick context folder', error)
        setMessage(statusMessage, '')
        setMessage(errorMessage, 'Failed to open folder picker.')
      }
    })
  }

  if (llmKeySaveButton) {
    llmKeySaveButton.addEventListener('click', async () => {
      if (!llmKeyInput || !llmProviderSelect) {
        return
      }

      setMessage(llmKeyStatus, 'Saving...')
      setMessage(llmKeyError, '')
      setMessage(llmProviderError, '')

      if (!llmProviderSelect.value) {
        setMessage(llmKeyStatus, '')
        setMessage(llmProviderError, 'Select an LLM provider.')
        return
      }

      try {
        const result = await jiminy.saveSettings({
          llmProviderName: llmProviderSelect.value,
          llmProviderApiKey: llmKeyInput.value
        })
        if (result && result.ok) {
          setMessage(llmKeyStatus, 'Saved.')
        } else {
          setMessage(llmKeyStatus, '')
          setMessage(llmKeyError, result?.message || 'Failed to save LLM key.')
        }
      } catch (error) {
        console.error('Failed to save LLM key', error)
        setMessage(llmKeyStatus, '')
        setMessage(llmKeyError, 'Failed to save LLM key.')
      }
    })
  }

  if (llmProviderSelect) {
    llmProviderSelect.addEventListener('change', async () => {
      setMessage(llmProviderError, '')
      await saveLlmProviderSelection(llmProviderSelect.value)
    })
  }

  if (syncButton) {
    syncButton.addEventListener('click', async () => {
      if (!jiminy.syncContextGraph) {
        setMessage(syncError, 'Sync bridge unavailable. Restart the app.')
        return
      }

      let shouldRefreshStatus = false
      setMessage(syncError, '')
      setMessage(syncStatus, 'Syncing...')
      setMessage(syncWarning, '')
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
          setMessage(syncStatus, message)
          if (warnings.length > 0) {
            const warningText = warnings[0]?.path
              ? `Warning: cycle detected at ${warnings[0].path}.`
              : 'Warning: cycle detected in context folder.'
            setMessage(syncWarning, warningText)
          }
          shouldRefreshStatus = true
        } else {
          setMessage(syncStatus, '')
          setMessage(syncWarning, '')
          setMessage(syncError, result?.message || 'Failed to sync context graph.')
        }
      } catch (error) {
        console.error('Failed to sync context graph', error)
        setMessage(syncStatus, '')
        setMessage(syncWarning, '')
        setMessage(syncError, 'Failed to sync context graph.')
      } finally {
        setSyncState(false)
        if (shouldRefreshStatus) {
          await refreshContextGraphStatus()
        }
      }
    })
  }

  if (pruneButton) {
    pruneButton.addEventListener('click', async () => {
      if (!jiminy.pruneContextGraph) {
        setMessage(syncError, 'Prune bridge unavailable. Restart the app.')
        return
      }

      setMessage(syncError, '')
      setMessage(pruneStatus, 'Pruning...')
      setPruneState(true)

      try {
        const result = await jiminy.pruneContextGraph()
        if (result && result.ok) {
          const message = result.deleted ? 'Pruned.' : 'Nothing to prune.'
          setMessage(pruneStatus, message)
          await refreshContextGraphStatus()
        } else {
          setMessage(pruneStatus, '')
          setMessage(syncError, result?.message || 'Failed to prune context graph.')
        }
      } catch (error) {
        console.error('Failed to prune context graph', error)
        setMessage(pruneStatus, '')
        setMessage(syncError, 'Failed to prune context graph.')
      } finally {
        setPruneState(false)
      }
    })
  }

  if (advancedToggleBtn && advancedOptions) {
    advancedToggleBtn.addEventListener('click', () => {
      const isHidden = advancedOptions.classList.contains('hidden')
      advancedOptions.classList.toggle('hidden', !isHidden)
      const arrow = document.getElementById('toggle-arrow')
      if (arrow) {
        arrow.classList.toggle('rotate-90', isHidden)
      }
    })
  }

  if (addExclusionBtn) {
    addExclusionBtn.addEventListener('click', async () => {
      if (!jiminy.pickExclusion) {
        console.error('pickExclusion not available')
        setMessage(exclusionsError, 'Exclusion picker unavailable. Restart the app.')
        return
      }

      const contextPath = contextFolderInput?.value || ''
      if (!contextPath) {
        console.warn('No context folder selected')
        setMessage(exclusionsError, 'Select a context folder before adding exclusions.')
        return
      }

      try {
        const result = await jiminy.pickExclusion(contextPath)
        if (result && !result.canceled && result.path) {
          setMessage(exclusionsError, '')
          addExclusion(result.path)
        } else if (result && result.error) {
          console.error('Failed to pick exclusion:', result.error)
          setMessage(exclusionsError, result.error)
        }
      } catch (error) {
        console.error('Failed to pick exclusion', error)
        setMessage(exclusionsError, 'Failed to open exclusion picker.')
      }
    })
  }

  if (hotkeysSaveButton) {
    hotkeysSaveButton.addEventListener('click', async () => {
      if (!captureHotkeyBtn || !clipboardHotkeyBtn) {
        return
      }

      setMessage(hotkeysStatus, 'Saving...')
      setMessage(hotkeysError, '')

      const captureHotkey = captureHotkeyBtn.dataset.hotkey || ''
      const clipboardHotkey = clipboardHotkeyBtn.dataset.hotkey || ''

      if (!captureHotkey && !clipboardHotkey) {
        setMessage(hotkeysStatus, '')
        setMessage(hotkeysError, 'At least one hotkey is required.')
        return
      }

      try {
        const result = await jiminy.saveSettings({ captureHotkey, clipboardHotkey })
        if (result && result.ok) {
          // Re-register hotkeys with the new values
          if (jiminy.reregisterHotkeys) {
            const reregisterResult = await jiminy.reregisterHotkeys()
            if (reregisterResult && reregisterResult.ok) {
              setMessage(hotkeysStatus, 'Saved and applied.')
            } else {
              const captureError = reregisterResult?.captureHotkey?.ok === false
              const clipboardError = reregisterResult?.clipboardHotkey?.ok === false
              if (captureError || clipboardError) {
                const errorParts = []
                if (captureError) errorParts.push('capture')
                if (clipboardError) errorParts.push('clipboard')
                setMessage(hotkeysStatus, 'Saved.')
                setMessage(hotkeysError, `Failed to register ${errorParts.join(' and ')} hotkey. The shortcut may be in use by another app.`)
              } else {
                setMessage(hotkeysStatus, 'Saved.')
              }
            }
          } else {
            setMessage(hotkeysStatus, 'Saved. Restart to apply.')
          }
        } else {
          setMessage(hotkeysStatus, '')
          setMessage(hotkeysError, result?.message || 'Failed to save hotkeys.')
        }
      } catch (error) {
        console.error('Failed to save hotkeys', error)
        setMessage(hotkeysStatus, '')
        setMessage(hotkeysError, 'Failed to save hotkeys.')
      }
    })
  }

  if (hotkeysResetButton) {
    hotkeysResetButton.addEventListener('click', () => {
      if (captureHotkeyBtn) {
        updateHotkeyDisplay(captureHotkeyBtn, DEFAULT_CAPTURE_HOTKEY)
      }
      if (clipboardHotkeyBtn) {
        updateHotkeyDisplay(clipboardHotkeyBtn, DEFAULT_CLIPBOARD_HOTKEY)
      }
      setMessage(hotkeysStatus, '')
      setMessage(hotkeysError, '')
    })
  }

  const initialize = async () => {
    showContextGraphLoading()
    await loadSettings()
    await refreshContextGraphStatus()
  }

  void initialize()
})
