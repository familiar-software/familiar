(function (global) {
  const createWizardSkill = (options = {}) => {
    const elements = options.elements || {}
    const jiminy = options.jiminy || {}
    const getState = typeof options.getState === 'function' ? options.getState : () => ({})
    const setSkillHarness = typeof options.setSkillHarness === 'function' ? options.setSkillHarness : () => {}
    const setSkillInstalled = typeof options.setSkillInstalled === 'function' ? options.setSkillInstalled : () => {}
    const setMessage = typeof options.setMessage === 'function' ? options.setMessage : () => {}
    const updateWizardUI = typeof options.updateWizardUI === 'function' ? options.updateWizardUI : () => {}

    const {
      skillHarnessInputs = [],
      skillInstallButton,
      skillInstallStatus,
      skillInstallError,
      skillInstallPath
    } = elements

    const isReady = Boolean(jiminy.installSkill && jiminy.getSkillInstallStatus)

    const setStatus = (message) => setMessage(skillInstallStatus, message)
    const setError = (message) => setMessage(skillInstallError, message)
    const setPath = (message) => {
      if (!skillInstallPath) {
        return
      }
      const value = message || ''
      skillInstallPath.textContent = value ? `Install path: ${value}` : ''
      skillInstallPath.classList.toggle('hidden', !value)
    }

    const clearMessages = () => {
      setStatus('')
      setError('')
    }

    const updateInstallButtonState = () => {
      if (!skillInstallButton) {
        return
      }
      const { currentSkillHarness } = getState()
      skillInstallButton.disabled = !isReady || !currentSkillHarness
    }

    const syncHarnessSelection = (value) => {
      for (const input of skillHarnessInputs) {
        if (input.value === value) {
          input.checked = true
        }
      }
    }

    const checkInstallStatus = async (harness) => {
      if (!isReady || !harness) {
        setPath('')
        return
      }

      try {
        const result = await jiminy.getSkillInstallStatus({ harness })
        if (result && result.ok) {
          setPath(result.path || '')
          setSkillInstalled(Boolean(result.installed))
          if (result.installed && result.path) {
            setStatus(`Installed at ${result.path}`)
          } else {
            setStatus('')
          }
          return
        }
        setPath('')
        setSkillInstalled(false)
        setStatus('')
        setPath(result?.path || '')
        setError(result?.message || 'Failed to check skill installation.')
      } catch (error) {
        console.error('Failed to check skill status', error)
        setPath('')
        setSkillInstalled(false)
        setStatus('')
        setError('Failed to check skill installation.')
      } finally {
        updateInstallButtonState()
        updateWizardUI()
      }
    }

    const handleHarnessChange = async (event) => {
      const harness = event?.target?.value || ''
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
      await checkInstallStatus(harness)
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
        const result = await jiminy.installSkill({ harness: currentSkillHarness })
        if (result && result.ok) {
          setSkillInstalled(true)
          if (result.path) {
            setPath(result.path)
            setStatus(`Installed at ${result.path}`)
          } else {
            setStatus('Installed.')
          }
          console.log('Skill installed', { harness: currentSkillHarness, path: result.path })
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

    if (skillInstallButton) {
      skillInstallButton.addEventListener('click', () => {
        void handleInstallClick()
      })
    }

    const { currentSkillHarness } = getState()
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

  const registry = global.JiminyWizardSkill || {}
  registry.createWizardSkill = createWizardSkill
  global.JiminyWizardSkill = registry

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = registry
  }
})(window)
