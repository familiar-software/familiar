(function (global) {
  const createWizardSkill = (options = {}) => {
    const elements = options.elements || {}
    const familiar = options.familiar || {}
    const getState = typeof options.getState === 'function' ? options.getState : () => ({})
    const setSkillHarness = typeof options.setSkillHarness === 'function' ? options.setSkillHarness : () => {}
    const setSkillInstalled = typeof options.setSkillInstalled === 'function' ? options.setSkillInstalled : () => {}
    const setMessage = typeof options.setMessage === 'function' ? options.setMessage : () => {}
    const updateWizardUI = typeof options.updateWizardUI === 'function' ? options.updateWizardUI : () => {}

    const {
      skillHarnessInputs = [],
      skillInstallButtons = [],
      skillInstallStatuses = [],
      skillInstallErrors = [],
      skillInstallPaths = [],
      skillCursorRestartNotes = [],
      skillInstallButton,
      skillInstallStatus,
      skillInstallError,
      skillInstallPath,
      skillCursorRestartNote
    } = elements

    const toArray = (value) => {
      if (Array.isArray(value)) {
        return value.filter(Boolean)
      }
      return value ? [value] : []
    }

    const allSkillInstallButtons = [
      ...toArray(skillInstallButtons),
      ...toArray(skillInstallButton)
    ]
    const allSkillInstallStatuses = [
      ...toArray(skillInstallStatuses),
      ...toArray(skillInstallStatus)
    ]
    const allSkillInstallErrors = [
      ...toArray(skillInstallErrors),
      ...toArray(skillInstallError)
    ]
    const allSkillInstallPaths = [
      ...toArray(skillInstallPaths),
      ...toArray(skillInstallPath)
    ]
    const allSkillCursorRestartNotes = [
      ...toArray(skillCursorRestartNotes),
      ...toArray(skillCursorRestartNote)
    ]

    const isReady = Boolean(familiar.installSkill && familiar.getSkillInstallStatus)
    const canPersist = typeof familiar.saveSettings === 'function'

    const setStatus = (message) => setMessage(allSkillInstallStatuses, message)
    const setError = (message) => setMessage(allSkillInstallErrors, message)
    const setPath = (message) => {
      for (const pathElement of allSkillInstallPaths) {
        const value = message || ''
        pathElement.textContent = value ? `Install path: ${value}` : ''
        pathElement.classList.toggle('hidden', !value)
      }
    }
    const setCursorRestartNoteVisibility = (harness) => {
      const shouldShow = harness === 'cursor'
      for (const note of allSkillCursorRestartNotes) {
        note.classList.toggle('hidden', !shouldShow)
      }
    }

    const persistSkillInstaller = async ({ harness, installPath } = {}) => {
      if (!canPersist || !harness) {
        return
      }
      try {
        await familiar.saveSettings({ skillInstaller: { harness, installPath: installPath || '' } })
      } catch (error) {
        console.warn('Failed to persist skill installer settings', error)
      }
    }

    const clearMessages = () => {
      setStatus('')
      setError('')
    }

    const updateInstallButtonState = () => {
      const { currentSkillHarness } = getState()
      for (const button of allSkillInstallButtons) {
        button.disabled = !isReady || !currentSkillHarness
      }
    }

    const syncHarnessSelection = (value) => {
      for (const input of skillHarnessInputs) {
        input.checked = input.value === value
      }
    }

    const checkInstallStatus = async (harness) => {
      setCursorRestartNoteVisibility(harness)
      if (!isReady || !harness) {
        setPath('')
        return { ok: false }
      }

      syncHarnessSelection(harness)
      try {
        const result = await familiar.getSkillInstallStatus({ harness })
        if (result && result.ok) {
          setPath(result.path || '')
          setSkillInstalled(Boolean(result.installed))
          if (result.installed && result.path) {
            setStatus(`Installed at ${result.path}`)
          } else {
            setStatus('')
          }
          return { ok: true, installed: Boolean(result.installed), path: result.path || '' }
        }
        setPath('')
        setSkillInstalled(false)
        setStatus('')
        setPath(result?.path || '')
        setError(result?.message || 'Failed to check skill installation.')
        return { ok: false, path: result?.path || '' }
      } catch (error) {
        console.error('Failed to check skill status', error)
        setPath('')
        setSkillInstalled(false)
        setStatus('')
        setError('Failed to check skill installation.')
        return { ok: false }
      } finally {
        updateInstallButtonState()
        updateWizardUI()
      }
    }

    const handleHarnessChange = async (event) => {
      const harness = event?.target?.value || ''
      setCursorRestartNoteVisibility(harness)
      clearMessages()
      setPath('')
      setSkillInstalled(false)
      setSkillHarness(harness)
      updateInstallButtonState()
      if (!isReady) {
        setError('Skill installer unavailable. Restart the app.')
        return
      }
      if (!harness) {
        return
      }
      console.log('Wizard skill harness selected', { harness })
      const status = await checkInstallStatus(harness)
      if (status && status.ok) {
        await persistSkillInstaller({ harness, installPath: status.path })
      }
    }

    const handleInstallClick = async () => {
      if (!isReady) {
        setError('Skill installer unavailable. Restart the app.')
        return
      }
      const { currentSkillHarness } = getState()
      if (!currentSkillHarness) {
        setError('Choose a harness first.')
        return
      }

      clearMessages()
      setStatus('Installing...')
      setSkillInstalled(false)
      updateInstallButtonState()

      try {
        const result = await familiar.installSkill({ harness: currentSkillHarness })
	        if (result && result.ok) {
	          setSkillInstalled(true)
	          if (result.path) {
	            setPath(result.path)
	            setStatus(`Installed at ${result.path}`)
          } else {
            setStatus('Installed.')
	          }
	          console.log('Skill installed', { harness: currentSkillHarness, path: result.path })
	          await persistSkillInstaller({ harness: currentSkillHarness, installPath: result.path || '' })
	          return
	        }
	        setSkillInstalled(false)
	        setStatus('')
        setError(result?.message || 'Failed to install skill.')
      } catch (error) {
        console.error('Failed to install skill', error)
        setSkillInstalled(false)
        setStatus('')
        setError('Failed to install skill.')
      } finally {
        updateInstallButtonState()
        updateWizardUI()
      }
    }

    if (!isReady) {
      setError('Skill installer unavailable. Restart the app.')
    }

    skillHarnessInputs.forEach((input) => {
      input.addEventListener('change', handleHarnessChange)
    })

    allSkillInstallButtons.forEach((button) => {
      button.addEventListener('click', () => {
        void handleInstallClick()
      })
    })

    const { currentSkillHarness } = getState()
    setCursorRestartNoteVisibility(currentSkillHarness)
    if (currentSkillHarness) {
      syncHarnessSelection(currentSkillHarness)
      void checkInstallStatus(currentSkillHarness)
    } else {
      updateInstallButtonState()
    }

    return {
      checkInstallStatus
    }
  }

  const registry = global.FamiliarWizardSkill || {}
  registry.createWizardSkill = createWizardSkill
  global.FamiliarWizardSkill = registry

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = registry
  }
})(window)
