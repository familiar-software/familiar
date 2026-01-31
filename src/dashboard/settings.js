(function (global) {
  const createSettings = (options = {}) => {
    const elements = options.elements || {}
    const jiminy = options.jiminy || {}
    const defaults = options.defaults || {}
    const getState = typeof options.getState === 'function' ? options.getState : () => ({})
    const setContextFolderValue = typeof options.setContextFolderValue === 'function'
      ? options.setContextFolderValue
      : () => {}
    const setLlmProviderValue = typeof options.setLlmProviderValue === 'function'
      ? options.setLlmProviderValue
      : () => {}
    const setLlmApiKeyPending = typeof options.setLlmApiKeyPending === 'function'
      ? options.setLlmApiKeyPending
      : () => {}
    const setLlmApiKeySaved = typeof options.setLlmApiKeySaved === 'function'
      ? options.setLlmApiKeySaved
      : () => {}
    const setAlwaysRecordWhenActiveValue = typeof options.setAlwaysRecordWhenActiveValue === 'function'
      ? options.setAlwaysRecordWhenActiveValue
      : () => {}
    const setHotkeys = typeof options.setHotkeys === 'function' ? options.setHotkeys : () => {}
    const setExclusions = typeof options.setExclusions === 'function' ? options.setExclusions : () => {}
    const setMessage = typeof options.setMessage === 'function' ? options.setMessage : () => {}
    const refreshContextGraphStatus = typeof options.refreshContextGraphStatus === 'function'
      ? options.refreshContextGraphStatus
      : async () => {}
    const updatePruneButtonState = typeof options.updatePruneButtonState === 'function'
      ? options.updatePruneButtonState
      : () => {}
    const updateWizardUI = typeof options.updateWizardUI === 'function' ? options.updateWizardUI : () => {}

    const {
      contextFolderChooseButtons = [],
      contextFolderErrors = [],
      contextFolderStatuses = [],
      llmProviderSelects = [],
      llmProviderErrors = [],
      llmKeyInputs = [],
      llmKeyErrors = [],
      llmKeyStatuses = [],
      alwaysRecordWhenActiveInputs = [],
      alwaysRecordWhenActiveErrors = [],
      alwaysRecordWhenActiveStatuses = [],
      hotkeysErrors = [],
      hotkeysStatuses = []
    } = elements

    const DEFAULT_CAPTURE_HOTKEY = defaults.capture || 'CommandOrControl+Shift+J'
    const DEFAULT_CLIPBOARD_HOTKEY = defaults.clipboard || 'CommandOrControl+J'
    const DEFAULT_RECORDING_HOTKEY = defaults.recording || 'CommandOrControl+R'

    const isReady = Boolean(jiminy.pickContextFolder && jiminy.saveSettings && jiminy.getSettings)

    const saveContextFolderPath = async (contextFolderPath) => {
      if (!isReady) {
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

    const saveLlmApiKey = async (apiKey) => {
      if (!isReady) {
        return false
      }

      setMessage(llmKeyStatuses, 'Saving...')
      setMessage(llmKeyErrors, '')
      setMessage(llmProviderErrors, '')

      const { currentLlmProviderName } = getState()
      if (!currentLlmProviderName) {
        setMessage(llmKeyStatuses, '')
        setMessage(llmProviderErrors, 'Select an LLM provider.')
        return false
      }

      try {
        const result = await jiminy.saveSettings({
          llmProviderName: currentLlmProviderName,
          llmProviderApiKey: apiKey
        })
        if (result && result.ok) {
          setMessage(llmKeyStatuses, 'Saved.')
          setLlmApiKeySaved(apiKey)
          console.log('LLM API key saved', { provider: currentLlmProviderName, hasKey: Boolean(apiKey) })
          return true
        }
        setMessage(llmKeyStatuses, '')
        setMessage(llmKeyErrors, result?.message || 'Failed to save LLM key.')
      } catch (error) {
        console.error('Failed to save LLM key', error)
        setMessage(llmKeyStatuses, '')
        setMessage(llmKeyErrors, 'Failed to save LLM key.')
      }

      return false
    }

    const saveLlmProviderSelection = async (providerName) => {
      if (!isReady) {
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
          const { pendingLlmApiKey, currentLlmApiKey } = getState()
          if (pendingLlmApiKey !== currentLlmApiKey) {
            await saveLlmApiKey(pendingLlmApiKey)
          }
          return true
        }
        setMessage(llmProviderErrors, result?.message || 'Failed to save LLM provider.')
      } catch (error) {
        console.error('Failed to save LLM provider', error)
        setMessage(llmProviderErrors, 'Failed to save LLM provider.')
      }

      return false
    }

    const saveAlwaysRecordWhenActive = async (enabled) => {
      if (!isReady) {
        return false
      }

      setMessage(alwaysRecordWhenActiveStatuses, 'Saving...')
      setMessage(alwaysRecordWhenActiveErrors, '')

      try {
        const result = await jiminy.saveSettings({ alwaysRecordWhenActive: enabled })
        if (result && result.ok) {
          setMessage(alwaysRecordWhenActiveStatuses, 'Saved.')
          setAlwaysRecordWhenActiveValue(enabled)
          console.log('Always record when active saved', { enabled })
          return true
        }
        setMessage(alwaysRecordWhenActiveStatuses, '')
        setMessage(alwaysRecordWhenActiveErrors, result?.message || 'Failed to save setting.')
      } catch (error) {
        console.error('Failed to save always record setting', error)
        setMessage(alwaysRecordWhenActiveStatuses, '')
        setMessage(alwaysRecordWhenActiveErrors, 'Failed to save setting.')
      }

      return false
    }

    const loadSettings = async () => {
      if (!isReady) {
        return null
      }

      try {
        const result = await jiminy.getSettings()
        setContextFolderValue(result.contextFolderPath || '')
        setLlmProviderValue(result.llmProviderName || '')
        setLlmApiKeySaved(result.llmProviderApiKey || '')
        setAlwaysRecordWhenActiveValue(result.alwaysRecordWhenActive === true)
        setHotkeys({
          capture: result.captureHotkey || DEFAULT_CAPTURE_HOTKEY,
          clipboard: result.clipboardHotkey || DEFAULT_CLIPBOARD_HOTKEY,
          recording: result.recordingHotkey || DEFAULT_RECORDING_HOTKEY
        })
        setExclusions(result.exclusions)
        setMessage(contextFolderErrors, result.validationMessage || '')
        setMessage(contextFolderStatuses, '')
        setMessage(llmProviderErrors, '')
        setMessage(llmKeyErrors, '')
        setMessage(llmKeyStatuses, '')
        setMessage(alwaysRecordWhenActiveErrors, '')
        setMessage(alwaysRecordWhenActiveStatuses, '')
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

    if (!isReady) {
      const message = 'Settings bridge unavailable. Restart the app.'
      setMessage(contextFolderErrors, message)
      setMessage(llmProviderErrors, message)
      setMessage(llmKeyErrors, message)
      setMessage(alwaysRecordWhenActiveErrors, message)
      setMessage(hotkeysErrors, message)
      updatePruneButtonState()
      return {
        isReady,
        loadSettings
      }
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
                const { currentExclusions } = getState()
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

      input.addEventListener('change', async (event) => {
        const nextValue = event.target.value || ''
        const { pendingLlmApiKey, currentLlmApiKey } = getState()
        if (pendingLlmApiKey !== nextValue) {
          setLlmApiKeyPending(nextValue)
        }
        if (nextValue === currentLlmApiKey) {
          return
        }
        await saveLlmApiKey(nextValue)
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

    alwaysRecordWhenActiveInputs.forEach((input) => {
      input.addEventListener('change', async (event) => {
        const nextValue = Boolean(event.target.checked)
        const { currentAlwaysRecordWhenActive } = getState()
        if (nextValue === currentAlwaysRecordWhenActive) {
          return
        }
        const saved = await saveAlwaysRecordWhenActive(nextValue)
        if (!saved) {
          setAlwaysRecordWhenActiveValue(currentAlwaysRecordWhenActive)
        }
      })
    })

    return {
      isReady,
      loadSettings
    }
  }

  const registry = global.JiminySettings || {}
  registry.createSettings = createSettings
  global.JiminySettings = registry

  // Export for Node/CommonJS so tests can require this module; browsers ignore this.
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = registry
  }
})(window)
