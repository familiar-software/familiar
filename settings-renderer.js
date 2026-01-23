document.addEventListener('DOMContentLoaded', () => {
  const jiminy = window.jiminy || {}
  const contextFolderInput = document.getElementById('context-folder-path')
  const chooseButton = document.getElementById('context-folder-choose')
  const saveButton = document.getElementById('context-folder-save')
  const errorMessage = document.getElementById('context-folder-error')
  const statusMessage = document.getElementById('context-folder-status')
  const llmKeyInput = document.getElementById('llm-api-key')
  const llmKeySaveButton = document.getElementById('llm-api-key-save')
  const llmKeyError = document.getElementById('llm-api-key-error')
  const llmKeyStatus = document.getElementById('llm-api-key-status')
  const syncButton = document.getElementById('context-graph-sync')
  const syncStatus = document.getElementById('context-graph-status')
  const syncProgress = document.getElementById('context-graph-progress')
  const syncWarning = document.getElementById('context-graph-warning')
  const syncError = document.getElementById('context-graph-error')
  const pruneButton = document.getElementById('context-graph-prune')
  const pruneStatus = document.getElementById('context-graph-prune-status')
  const advancedToggleBtn = document.getElementById('advanced-toggle-btn')
  const advancedOptions = document.getElementById('advanced-options')
  const exclusionsList = document.getElementById('exclusions-list')
  const addExclusionBtn = document.getElementById('add-exclusion')

  let currentExclusions = []
  let isSyncing = false
  let isMaxNodesExceeded = false
  let isPruning = false

  const setMessage = (element, message) => {
    if (!element) {
      return
    }

    element.textContent = message || ''
    element.style.display = message ? 'block' : 'none'
  }

  const updateSaveState = () => {
    if (!saveButton || !contextFolderInput) {
      return
    }
    saveButton.disabled = !contextFolderInput.value
    updatePruneButtonState()
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
    setMessage(syncProgress, 'Loading...')
  }

  const showContextGraphCounts = (syncedNodes, totalNodes) => {
    if (syncButton) {
      syncButton.hidden = false
    }
    setMessage(syncProgress, `Synced nodes ${syncedNodes}/${totalNodes}`)
  }

  const refreshContextGraphStatus = async (options = {}) => {
    if (!jiminy.getContextGraphStatus) {
      setMessage(syncError, 'Context graph status bridge unavailable. Restart the app.')
      if (syncButton) {
        syncButton.hidden = false
      }
      setMessage(syncProgress, 'Synced nodes 0/0')
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
      const totalNodes = Number(result?.totalNodes ?? 0)
      isMaxNodesExceeded = Boolean(result?.maxNodesExceeded)

      if (isMaxNodesExceeded) {
        setMessage(syncError, result?.message || 'Context graph exceeds MAX_NODES.')
      } else {
        setMessage(syncError, '')
      }

      showContextGraphCounts(syncedNodes, totalNodes)
    } catch (error) {
      console.error('Failed to load context graph status', error)
      isMaxNodesExceeded = false
      setMessage(syncError, 'Failed to load context graph status.')
      showContextGraphCounts(0, 0)
    } finally {
      updateSyncButtonState()
    }
  }

  const renderExclusions = () => {
    if (!exclusionsList) return

    exclusionsList.innerHTML = ''
    for (const exclusion of currentExclusions) {
      const li = document.createElement('li')
      li.className = 'exclusion-item'

      const pathSpan = document.createElement('span')
      pathSpan.className = 'exclusion-path'
      pathSpan.textContent = exclusion
      pathSpan.title = exclusion

      const removeBtn = document.createElement('button')
      removeBtn.className = 'exclusion-remove'
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
      await refreshContextGraphStatus()
    } catch (error) {
      console.error('Failed to save exclusions', error)
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
      currentExclusions = Array.isArray(result.exclusions) ? [...result.exclusions] : []
      renderExclusions()
      setMessage(errorMessage, result.validationMessage || '')
      setMessage(statusMessage, '')
      setMessage(llmKeyError, '')
      setMessage(llmKeyStatus, '')
      updateSaveState()
      return result
    } catch (error) {
      console.error('Failed to load settings', error)
      setMessage(errorMessage, 'Failed to load settings.')
      setMessage(llmKeyError, 'Failed to load settings.')
    }
    return null
  }

  if (!jiminy.pickContextFolder || !jiminy.saveSettings || !jiminy.getSettings) {
    setMessage(errorMessage, 'Settings bridge unavailable. Restart the app.')
    setMessage(llmKeyError, 'Settings bridge unavailable. Restart the app.')
    updateSaveState()
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
          updateSaveState()
          await refreshContextGraphStatus({ contextFolderPath: result.path, exclusions: currentExclusions })
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

  if (saveButton) {
    saveButton.addEventListener('click', async () => {
      if (!contextFolderInput) {
        return
      }

      setMessage(statusMessage, 'Saving...')
      setMessage(errorMessage, '')

      try {
        const result = await jiminy.saveSettings({ contextFolderPath: contextFolderInput.value })
        if (result && result.ok) {
          setMessage(statusMessage, 'Saved.')
          await refreshContextGraphStatus()
        } else {
          setMessage(statusMessage, '')
          setMessage(errorMessage, result?.message || 'Failed to save settings.')
        }
      } catch (error) {
        console.error('Failed to save settings', error)
        setMessage(statusMessage, '')
        setMessage(errorMessage, 'Failed to save settings.')
      }
    })
  }

  if (llmKeySaveButton) {
    llmKeySaveButton.addEventListener('click', async () => {
      if (!llmKeyInput) {
        return
      }

      setMessage(llmKeyStatus, 'Saving...')
      setMessage(llmKeyError, '')

      try {
        const result = await jiminy.saveSettings({ llmProviderApiKey: llmKeyInput.value })
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
      const isHidden = advancedOptions.hidden
      advancedOptions.hidden = !isHidden
      const arrow = advancedToggleBtn.querySelector('.toggle-arrow')
      if (arrow) {
        arrow.classList.toggle('open', isHidden)
      }
    })
  }

  if (addExclusionBtn) {
    addExclusionBtn.addEventListener('click', async () => {
      if (!jiminy.pickExclusion) {
        console.error('pickExclusion not available')
        return
      }

      const contextPath = contextFolderInput?.value || ''
      if (!contextPath) {
        console.warn('No context folder selected')
        return
      }

      try {
        const result = await jiminy.pickExclusion(contextPath)
        if (result && !result.canceled && result.path) {
          addExclusion(result.path)
        } else if (result && result.error) {
          console.error('Failed to pick exclusion:', result.error)
        }
      } catch (error) {
        console.error('Failed to pick exclusion', error)
      }
    })
  }

  const initialize = async () => {
    showContextGraphLoading()
    await loadSettings()
    await refreshContextGraphStatus()
  }

  void initialize()
})
