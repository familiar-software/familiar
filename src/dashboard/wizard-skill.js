(function (global) {
  const createWizardSkill = (options = {}) => {
    const elements = options.elements || {}
    const familiar = options.familiar || {}
    const getState = typeof options.getState === 'function' ? options.getState : () => ({})
    const setSkillHarness = typeof options.setSkillHarness === 'function' ? options.setSkillHarness : () => {}
    const setSkillHarnesses = typeof options.setSkillHarnesses === 'function' ? options.setSkillHarnesses : () => {}
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
    const allSkillInstallCursorRestartNotes = [
      ...toArray(skillCursorRestartNotes),
      ...toArray(skillCursorRestartNote)
    ]

    const isReady = Boolean(familiar.installSkill && familiar.getSkillInstallStatus)
    const canPersist = typeof familiar.saveSettings === 'function'

    const getCurrentHarnesses = () => {
      const state = getState()
      if (Array.isArray(state.currentSkillHarnesses)) {
        return state.currentSkillHarnesses.filter((value) => typeof value === 'string' && value.length > 0)
      }
      if (state.currentSkillHarness) {
        return [state.currentSkillHarness]
      }
      return []
    }

    const normalizeHarnesses = (value) => {
      if (Array.isArray(value)) {
        return Array.from(new Set(value.filter((entry) => typeof entry === 'string' && entry.length > 0)))
      }
      if (typeof value === 'string' && value.length > 0) {
        return [value]
      }
      return getCurrentHarnesses()
    }

    const setStatus = (message) => setMessage(allSkillInstallStatuses, message)
    const setError = (message) => setMessage(allSkillInstallErrors, message)
    const formatHarnessName = (harness) => {
      if (harness === 'claude') {
        return 'Claude Code'
      }
      if (harness === 'codex') {
        return 'Codex'
      }
      if (harness === 'antigravity') {
        return 'Antigravity'
      }
      if (harness === 'cursor') {
        return 'Cursor'
      }
      return harness
    }
    const formatHarnessList = (harnesses) => harnesses.map((harness) => formatHarnessName(harness)).join(', ')
    const setInstallPath = (value) => {
      const text = value || ''
      for (const pathElement of allSkillInstallPaths) {
        pathElement.textContent = text
        pathElement.classList.toggle('hidden', !text)
      }
    }
    const clearInstallPath = () => setInstallPath('')
    const setCursorRestartNoteVisibility = (harnesses) => {
      const shouldShow = normalizeHarnesses(harnesses).includes('cursor')
      for (const note of allSkillInstallCursorRestartNotes) {
        note.classList.toggle('hidden', !shouldShow)
      }
    }

    const getNextHarnesses = (eventTarget) => {
      const nextHarnesses = new Set(getCurrentHarnesses())
      if (eventTarget && typeof eventTarget.value === 'string' && eventTarget.value.length > 0) {
        if (Boolean(eventTarget.checked)) {
          nextHarnesses.add(eventTarget.value)
        } else {
          nextHarnesses.delete(eventTarget.value)
        }
      }
      return Array.from(nextHarnesses).filter((value) => value.length > 0)
    }

    const syncHarnessSelection = (harnesses) => {
      const selected = new Set(normalizeHarnesses(harnesses))
      for (const input of skillHarnessInputs) {
        input.checked = selected.has(input.value)
      }
    }

    const persistSkillInstaller = async ({ harnesses, installPaths } = {}) => {
      const selectedHarnesses = normalizeHarnesses(harnesses)
      if (!canPersist) {
        return
      }
      const pathMap = installPaths && typeof installPaths === 'object' ? installPaths : {}
      const orderedInstallPaths = selectedHarnesses
        .map((harness) => (typeof pathMap[harness] === 'string' ? pathMap[harness] : ''))
      try {
        await familiar.saveSettings({
          skillInstaller: {
            harness: selectedHarnesses,
            installPath: orderedInstallPaths
          }
        })
      } catch (error) {
        console.warn('Failed to persist skill installer settings', error)
      }
    }

    const clearMessages = () => {
      setStatus('')
      setError('')
    }

    const updateInstallButtonState = () => {
      const selectedHarnesses = getCurrentHarnesses()
      for (const button of allSkillInstallButtons) {
        button.disabled = !isReady || selectedHarnesses.length === 0
      }
    }

    const checkInstallStatus = async (harnessesInput) => {
      const selectedHarnesses = normalizeHarnesses(harnessesInput)
      setCursorRestartNoteVisibility(selectedHarnesses)
      if (!isReady || selectedHarnesses.length === 0) {
        clearInstallPath()
        setSkillInstalled(false)
        updateInstallButtonState()
        updateWizardUI()
        return { ok: false }
      }

      syncHarnessSelection(selectedHarnesses)
      try {
        const results = await Promise.all(
          selectedHarnesses.map(async (harness) => {
            const result = await familiar.getSkillInstallStatus({ harness })
            return { harness, result }
          })
        )
        const failed = results.filter((entry) => !entry.result || !entry.result.ok)
        if (failed.length > 0) {
          clearInstallPath()
          setSkillInstalled(false)
          setStatus('')
          setError(failed[0]?.result?.message || 'Failed to check skill installation.')
          return { ok: false }
        }

        const installPaths = {}
        const missing = []
        const installed = []
        results.forEach((entry) => {
          const result = entry.result || {}
          if (result.path) {
            installPaths[entry.harness] = result.path
          }
          if (result.installed) {
            installed.push(entry.harness)
          } else {
            missing.push(entry.harness)
          }
        })

        if (missing.length === 0) {
          clearInstallPath()
          setSkillInstalled(true)
          if (selectedHarnesses.length === 1) {
            const singleHarness = selectedHarnesses[0]
            const installedPath = installPaths[singleHarness]
            if (installedPath) {
              setStatus(`Installed at ${installedPath}`)
            } else {
              setStatus('Installed.')
            }
          } else {
            setStatus(`Installed for ${formatHarnessList(selectedHarnesses)}.`)
          }
        } else {
          const missingLines = missing
            .map((harness) => `${formatHarnessName(harness)}: ${installPaths[harness] || '(path unavailable)'}`)
            .join('\n')
          setInstallPath(`Install paths:\n${missingLines}`)
          setStatus('')
          setSkillInstalled(false)
        }
        return {
          ok: true,
          installed: missing.length === 0,
          installPaths
        }
      } catch (error) {
        console.error('Failed to check skill status', error)
        clearInstallPath()
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
      if (event?.target) {
        event.target.checked = Boolean(event.target.checked)
      }
      const selectedHarnesses = getNextHarnesses(event?.target)
      setCursorRestartNoteVisibility(selectedHarnesses)
      clearMessages()
      clearInstallPath()
      setSkillInstalled(false)
      if (selectedHarnesses.length > 0) {
        setSkillHarnesses(selectedHarnesses)
      } else {
        setSkillHarness('')
      }
      syncHarnessSelection(selectedHarnesses)
      updateInstallButtonState()
      if (!isReady) {
        setError('Skill installer unavailable. Restart the app.')
        return
      }
      if (selectedHarnesses.length > 0) {
        console.log('Wizard skill harnesses selected', { harnesses: selectedHarnesses })
        const status = await checkInstallStatus(selectedHarnesses)
        if (status && status.ok) {
          await persistSkillInstaller({ harnesses: selectedHarnesses, installPaths: status.installPaths || {} })
        }
      } else {
        await persistSkillInstaller({ harnesses: [] })
      }
    }

    const handleInstallClick = async () => {
      if (!isReady) {
        setError('Skill installer unavailable. Restart the app.')
        return
      }
      const selectedHarnesses = getCurrentHarnesses()
      if (selectedHarnesses.length === 0) {
        setError('Choose at least one harness first.')
        return
      }

      clearMessages()
      clearInstallPath()
      setStatus('Installing...')
      setSkillInstalled(false)
      updateInstallButtonState()

      try {
        const installResults = await Promise.all(
          selectedHarnesses.map(async (harness) => {
            const result = await familiar.installSkill({ harness })
            return { harness, result }
          })
        )
        const failed = installResults.filter((entry) => !entry.result || !entry.result.ok)
        const succeeded = installResults.filter((entry) => entry.result && entry.result.ok)
        const installPaths = {}
        succeeded.forEach((entry) => {
          if (entry.result.path) {
            installPaths[entry.harness] = entry.result.path
          }
        })

        if (failed.length === 0) {
          setSkillInstalled(true)
          if (selectedHarnesses.length === 1) {
            const singleHarness = selectedHarnesses[0]
            const singlePath = installPaths[singleHarness]
            if (singlePath) {
              setStatus(`Installed at ${singlePath}`)
            } else {
              setStatus('Installed.')
            }
          } else {
            setStatus(`Installed for ${formatHarnessList(selectedHarnesses)}.`)
          }
          console.log('Skills installed', { harnesses: selectedHarnesses, installPaths })
          await persistSkillInstaller({ harnesses: selectedHarnesses, installPaths })
          return
        }
        setSkillInstalled(false)
        setStatus('')
        const failedHarnessNames = failed.map((entry) => formatHarnessName(entry.harness))
        const failedMessage = failed[0]?.result?.message || 'Failed to install skill.'
        if (succeeded.length > 0) {
          setError(`Installed for ${formatHarnessList(succeeded.map((entry) => entry.harness))}. Failed for ${failedHarnessNames.join(', ')}: ${failedMessage}`)
        } else {
          setError(failedMessage)
        }
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

    const initialHarnesses = getCurrentHarnesses()
    setCursorRestartNoteVisibility(initialHarnesses)
    if (initialHarnesses.length > 0) {
      syncHarnessSelection(initialHarnesses)
      void checkInstallStatus(initialHarnesses)
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
