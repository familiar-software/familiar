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
    const setStillsMarkdownExtractorType = typeof options.setStillsMarkdownExtractorType === 'function'
      ? options.setStillsMarkdownExtractorType
      : () => {}
    const setAlwaysRecordWhenActiveValue = typeof options.setAlwaysRecordWhenActiveValue === 'function'
      ? options.setAlwaysRecordWhenActiveValue
      : () => {}
    const setHotkeys = typeof options.setHotkeys === 'function' ? options.setHotkeys : () => {}
    const setMessage = typeof options.setMessage === 'function' ? options.setMessage : () => {}
    const updateWizardUI = typeof options.updateWizardUI === 'function' ? options.updateWizardUI : () => {}

    const {
      contextFolderChooseButtons = [],
      contextFolderErrors = [],
      contextFolderStatuses = [],
      copyLogButtons = [],
      copyLogErrors = [],
      copyLogStatuses = [],
      llmProviderSelects = [],
      llmProviderErrors = [],
      llmKeyInputs = [],
      llmKeyErrors = [],
      llmKeyStatuses = [],
      stillsMarkdownExtractorSelects = [],
      stillsMarkdownExtractorErrors = [],
      stillsMarkdownExtractorStatuses = [],
      alwaysRecordWhenActiveInputs = [],
      alwaysRecordWhenActiveErrors = [],
      alwaysRecordWhenActiveStatuses = [],
      hotkeysErrors = [],
      hotkeysStatuses = []
    } = elements

    const DEFAULT_RECORDING_HOTKEY = defaults.recording || 'CommandOrControl+R'

    const isReady = Boolean(jiminy.pickContextFolder && jiminy.saveSettings && jiminy.getSettings)
    const canCopyLog = typeof jiminy.copyCurrentLogToClipboard === 'function'

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

    const saveStillsMarkdownExtractorTypeSelection = async (extractorType) => {
      if (!isReady) {
        return false
      }

      setMessage(stillsMarkdownExtractorStatuses, 'Saving...')
      setMessage(stillsMarkdownExtractorErrors, '')

      const nextValue = extractorType || 'llm'
      try {
        const result = await jiminy.saveSettings({ stillsMarkdownExtractorType: nextValue })
        if (result && result.ok) {
          setMessage(stillsMarkdownExtractorStatuses, 'Saved.')
          setStillsMarkdownExtractorType(nextValue)
          console.log('Stills markdown extractor saved', { type: nextValue })
          return true
        }
        setMessage(stillsMarkdownExtractorStatuses, '')
        setMessage(stillsMarkdownExtractorErrors, result?.message || 'Failed to save setting.')
      } catch (error) {
        console.error('Failed to save stills markdown extractor', error)
        setMessage(stillsMarkdownExtractorStatuses, '')
        setMessage(stillsMarkdownExtractorErrors, 'Failed to save setting.')
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
        setStillsMarkdownExtractorType(result.stillsMarkdownExtractorType || 'llm')
        setAlwaysRecordWhenActiveValue(result.alwaysRecordWhenActive === true)
        setHotkeys({
          recording: result.recordingHotkey || DEFAULT_RECORDING_HOTKEY
        })
        setMessage(contextFolderErrors, result.validationMessage || '')
        setMessage(contextFolderStatuses, '')
        setMessage(llmProviderErrors, '')
        setMessage(llmKeyErrors, '')
        setMessage(llmKeyStatuses, '')
        setMessage(stillsMarkdownExtractorErrors, '')
        setMessage(stillsMarkdownExtractorStatuses, '')
        setMessage(alwaysRecordWhenActiveErrors, '')
        setMessage(alwaysRecordWhenActiveStatuses, '')
        setMessage(copyLogErrors, '')
        setMessage(copyLogStatuses, '')
        setMessage(hotkeysErrors, '')
        setMessage(hotkeysStatuses, '')
        return result
      } catch (error) {
        console.error('Failed to load settings', error)
        setMessage(contextFolderErrors, 'Failed to load settings.')
        setMessage(llmProviderErrors, 'Failed to load settings.')
        setMessage(llmKeyErrors, 'Failed to load settings.')
        setMessage(stillsMarkdownExtractorErrors, 'Failed to load settings.')
        setMessage(hotkeysErrors, 'Failed to load settings.')
      }
      return null
    }

    if (!isReady) {
      const message = 'Settings bridge unavailable. Restart the app.'
      setMessage(contextFolderErrors, message)
      setMessage(llmProviderErrors, message)
      setMessage(llmKeyErrors, message)
      setMessage(stillsMarkdownExtractorErrors, message)
      setMessage(alwaysRecordWhenActiveErrors, message)
      setMessage(copyLogErrors, message)
      setMessage(hotkeysErrors, message)
      copyLogButtons.forEach((button) => {
        button.disabled = true
      })
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

    if (copyLogButtons.length > 0) {
      if (!canCopyLog) {
        setMessage(copyLogErrors, 'Log copy unavailable. Restart the app.')
        copyLogButtons.forEach((button) => {
          button.disabled = true
        })
      } else {
        copyLogButtons.forEach((button) => {
          button.addEventListener('click', async () => {
            button.disabled = true
            setMessage(copyLogStatuses, 'Copying...')
            setMessage(copyLogErrors, '')
            try {
              const result = await jiminy.copyCurrentLogToClipboard()
              if (result && result.ok) {
                setMessage(copyLogStatuses, 'Copied.')
              } else {
                setMessage(copyLogStatuses, '')
                setMessage(copyLogErrors, result?.message || 'Failed to copy log file.')
              }
            } catch (error) {
              console.error('Failed to copy log file', error)
              setMessage(copyLogStatuses, '')
              setMessage(copyLogErrors, 'Failed to copy log file.')
            } finally {
              button.disabled = false
            }
          })
        })
      }
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

    stillsMarkdownExtractorSelects.forEach((select) => {
      select.addEventListener('change', async () => {
        setMessage(stillsMarkdownExtractorErrors, '')
        setMessage(stillsMarkdownExtractorStatuses, '')
        const nextValue = select.value || 'llm'
        stillsMarkdownExtractorSelects.forEach((other) => {
          if (other.value !== nextValue) {
            other.value = nextValue
          }
        })
        await saveStillsMarkdownExtractorTypeSelection(nextValue)
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
