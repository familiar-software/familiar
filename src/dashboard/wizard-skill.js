(function (global) {
  const microcopyModule = global?.FamiliarMicrocopy || (typeof require === 'function' ? require('../microcopy') : null)
  if (!microcopyModule || !microcopyModule.microcopy || !microcopyModule.formatters) {
    throw new Error('Familiar microcopy is unavailable')
  }
  const { microcopy, formatters } = microcopyModule
  const MANUAL_GUIDE_HARNESSES = new Set(['cloud-cowork'])

  const createWizardSkill = (options = {}) => {
    const elements = options.elements || {}
    const familiar = options.familiar || {}
    const getState = typeof options.getState === 'function' ? options.getState : () => ({})
    const setSkillHarness = typeof options.setSkillHarness === 'function' ? options.setSkillHarness : () => {}
    const setSkillHarnesses = typeof options.setSkillHarnesses === 'function' ? options.setSkillHarnesses : () => {}
    const setSkillInstalled = typeof options.setSkillInstalled === 'function' ? options.setSkillInstalled : () => {}
    const cloudCoWorkGuide = options.cloudCoWorkGuide || null
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

    const hasInstallerApi = Boolean(familiar.installSkill && familiar.getSkillInstallStatus)
    const hasCloudCoWorkGuide = Boolean(
      cloudCoWorkGuide && typeof cloudCoWorkGuide.openGuide === 'function'
    )
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
        return microcopy.dashboard.wizardSkill.harnessNames.claude
      }
      if (harness === 'codex') {
        return microcopy.dashboard.wizardSkill.harnessNames.codex
      }
      if (harness === 'antigravity') {
        return microcopy.dashboard.wizardSkill.harnessNames.antigravity
      }
      if (harness === 'cursor') {
        return microcopy.dashboard.wizardSkill.harnessNames.cursor
      }
      if (harness === 'cloud-cowork') {
        return microcopy.dashboard.wizardSkill.harnessNames.cloudCowork
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
    const getInstallableHarnesses = (harnessesInput) =>
      normalizeHarnesses(harnessesInput).filter((harness) => !MANUAL_GUIDE_HARNESSES.has(harness))
    const getManualGuideHarnesses = (harnessesInput) =>
      normalizeHarnesses(harnessesInput).filter((harness) => MANUAL_GUIDE_HARNESSES.has(harness))
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
      const selectedHarnesses = getInstallableHarnesses(harnesses)
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
      const installableHarnesses = getInstallableHarnesses(selectedHarnesses)
      const manualHarnesses = getManualGuideHarnesses(selectedHarnesses)
      const canInstall =
        selectedHarnesses.length > 0 &&
        ((installableHarnesses.length > 0 && hasInstallerApi) ||
          (manualHarnesses.length > 0 && hasCloudCoWorkGuide))
      for (const button of allSkillInstallButtons) {
        button.disabled = !canInstall
      }
    }

    const checkInstallStatus = async (harnessesInput) => {
      const selectedHarnesses = normalizeHarnesses(harnessesInput)
      const installableHarnesses = getInstallableHarnesses(selectedHarnesses)
      setCursorRestartNoteVisibility(selectedHarnesses)
      syncHarnessSelection(selectedHarnesses)
      if (selectedHarnesses.length === 0) {
        clearInstallPath()
        clearMessages()
        setSkillInstalled(false)
        updateInstallButtonState()
        updateWizardUI()
        return { ok: true, installed: false, installPaths: {} }
      }
      if (installableHarnesses.length === 0) {
        clearInstallPath()
        clearMessages()
        setSkillInstalled(false)
        updateInstallButtonState()
        updateWizardUI()
        return { ok: true, installed: false, installPaths: {} }
      }
      if (!hasInstallerApi) {
        setError(microcopy.dashboard.wizardSkill.messages.installerUnavailableRestart)
        updateInstallButtonState()
        updateWizardUI()
        return { ok: false }
      }

      try {
        const results = await Promise.all(
          installableHarnesses.map(async (harness) => {
            const result = await familiar.getSkillInstallStatus({ harness })
            return { harness, result }
          })
        )
        const failed = results.filter((entry) => !entry.result || !entry.result.ok)
        if (failed.length > 0) {
          clearInstallPath()
          setSkillInstalled(false)
          setStatus('')
          setError(
            failed[0]?.result?.message || microcopy.dashboard.wizardSkill.messages.failedToCheckSkillInstallation
          )
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
          if (installableHarnesses.length === 1) {
            const singleHarness = installableHarnesses[0]
            const installedPath = installPaths[singleHarness]
            if (installedPath) {
              setStatus(formatters.wizardSkillInstalledAt(installedPath))
            } else {
              setStatus(microcopy.dashboard.wizardSkill.messages.installed)
            }
          } else {
            setStatus(formatters.wizardSkillInstalledFor(formatHarnessList(installableHarnesses)))
          }
        } else {
          const missingLines = missing
            .map((harness) => {
              const pathText = installPaths[harness] || microcopy.dashboard.wizardSkill.messages.pathUnavailable
              return `${formatHarnessName(harness)}: ${pathText}`
            })
            .join('\n')
          setInstallPath(`${microcopy.dashboard.wizardSkill.messages.installPathsHeader}\n${missingLines}`)
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
        setError(microcopy.dashboard.wizardSkill.messages.failedToCheckSkillInstallation)
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
      if (!hasInstallerApi && getInstallableHarnesses(selectedHarnesses).length > 0) {
        setError(microcopy.dashboard.wizardSkill.messages.installerUnavailableRestart)
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
      const selectedHarnesses = getCurrentHarnesses()
      const installableHarnesses = getInstallableHarnesses(selectedHarnesses)
      const manualHarnesses = getManualGuideHarnesses(selectedHarnesses)
      if (selectedHarnesses.length === 0) {
        setError(microcopy.dashboard.wizardSkill.messages.chooseHarnessFirst)
        return
      }
      if (installableHarnesses.length > 0 && !hasInstallerApi) {
        setError(microcopy.dashboard.wizardSkill.messages.installerUnavailableRestart)
        return
      }
      if (manualHarnesses.length > 0 && !hasCloudCoWorkGuide) {
        setError(microcopy.dashboard.wizardSkill.messages.cloudCoworkGuideUnavailableRestart)
        return
      }

      clearMessages()
      clearInstallPath()
      setSkillInstalled(false)
      updateInstallButtonState()

      try {
        const installResults = []
        let cloudCoWorkGuideOpened = false
        let cloudCoWorkGuideErrorMessage = ''
        if (manualHarnesses.length > 0) {
          try {
            const guideResult = cloudCoWorkGuide.openGuide()
            cloudCoWorkGuideOpened = Boolean(guideResult && guideResult.ok)
          } catch (error) {
            console.error('Failed to open Claude Cowork guide', error)
            cloudCoWorkGuideOpened = false
            cloudCoWorkGuideErrorMessage = microcopy.dashboard.wizardSkill.messages.failedToOpenCloudCoworkGuide
          }
        }
        if (installableHarnesses.length > 0) {
          setStatus(microcopy.dashboard.wizardSkill.messages.installing)
          const installableResults = await Promise.all(
            installableHarnesses.map(async (harness) => {
              const result = await familiar.installSkill({ harness })
              return { harness, result }
            })
          )
          installResults.push(...installableResults)
        }

        const failed = installResults.filter((entry) => !entry.result || !entry.result.ok)
        const succeeded = installResults.filter((entry) => entry.result && entry.result.ok)
        const installPaths = {}
        succeeded.forEach((entry) => {
          if (entry.result.path) {
            installPaths[entry.harness] = entry.result.path
          }
        })

        if (failed.length === 0 && (manualHarnesses.length === 0 || cloudCoWorkGuideOpened)) {
          setSkillInstalled(installableHarnesses.length > 0 || cloudCoWorkGuideOpened)
          if (installableHarnesses.length === 0 && manualHarnesses.length > 0) {
            setStatus(microcopy.dashboard.wizardSkill.messages.openedCloudCoworkGuide)
            await persistSkillInstaller({ harnesses: [] })
            return
          }
          let installedStatusMessage = ''
          if (installableHarnesses.length === 1) {
            const singleHarness = installableHarnesses[0]
            const singlePath = installPaths[singleHarness]
            if (singlePath) {
              installedStatusMessage = formatters.wizardSkillInstalledAt(singlePath)
            } else {
              installedStatusMessage = microcopy.dashboard.wizardSkill.messages.installed
            }
          } else {
            installedStatusMessage = formatters.wizardSkillInstalledFor(formatHarnessList(installableHarnesses))
          }
          if (manualHarnesses.length > 0) {
            setStatus(formatters.wizardSkillOpenedCloudCoworkGuideCombined(installedStatusMessage).trim())
          } else {
            setStatus(installedStatusMessage)
          }
          console.log('Skills installed', { harnesses: installableHarnesses, installPaths })
          await persistSkillInstaller({ harnesses: installableHarnesses, installPaths })
          return
        }
        setSkillInstalled(false)
        setStatus('')
        const failedHarnessNames = failed.map((entry) => formatHarnessName(entry.harness))
        let failedMessage = failed[0]?.result?.message || microcopy.dashboard.wizardSkill.messages.failedToInstallSkill
        if (manualHarnesses.length > 0 && !cloudCoWorkGuideOpened) {
          failedMessage = cloudCoWorkGuideErrorMessage || microcopy.dashboard.wizardSkill.messages.failedToOpenCloudCoworkGuide
        }
        if (succeeded.length > 0 && failedHarnessNames.length > 0) {
          setError(
            formatters.wizardSkillInstalledAndFailed({
              succeededHarnesses: formatHarnessList(succeeded.map((entry) => entry.harness)),
              failedHarnesses: failedHarnessNames.join(', '),
              message: failedMessage
            })
          )
        } else if (succeeded.length > 0 && manualHarnesses.length > 0 && !cloudCoWorkGuideOpened) {
          setError(
            formatters.wizardSkillInstalledAndAdditionalFailure({
              succeededHarnesses: formatHarnessList(succeeded.map((entry) => entry.harness)),
              message: failedMessage
            })
          )
        } else {
          setError(failedMessage)
        }
      } catch (error) {
        console.error('Failed to install skill', error)
        setSkillInstalled(false)
        setStatus('')
        setError(microcopy.dashboard.wizardSkill.messages.failedToInstallSkill)
      } finally {
        updateInstallButtonState()
        updateWizardUI()
      }
    }

    if (!hasInstallerApi && !hasCloudCoWorkGuide) {
      setError(microcopy.dashboard.wizardSkill.messages.installerUnavailableRestart)
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
