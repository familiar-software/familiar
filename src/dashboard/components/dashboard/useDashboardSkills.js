import { useCallback } from 'react'

const trimString = (value) => (typeof value === 'string' ? value.trim() : '')

export const useDashboardSkills = (state) => {
  const {
    familiar,
    mc,
    selectedHarnesses,
    setSelectedHarnesses,
    setIsSkillInstalled,
    setSkillInstallPaths,
    setSkillMessage,
    setSkillError,
    getInstallableHarnesses,
    setManualHarnessSelection,
    getHarnessLabel,
    normalizeHarnesses,
    displayFormatters
  } = state

  const getPersistablePaths = (paths = {}, installableHarnesses = []) =>
    installableHarnesses.map((harness) => {
      const storedPath = typeof paths[harness] === 'string' ? paths[harness] : ''
      return storedPath
    })

  const persistSkillInstaller = useCallback(async (harnesses = [], paths = {}) => {
    const installableHarnesses = getInstallableHarnesses(harnesses)
    const orderedPaths = getPersistablePaths(paths, installableHarnesses)
    if (!familiar || typeof familiar.saveSettings !== 'function') {
      return
    }
    await familiar.saveSettings({
      skillInstaller: {
        harness: installableHarnesses,
        installPath: orderedPaths
      }
    })
  }, [familiar, getInstallableHarnesses])

  const checkSkillInstallStatus = useCallback(async (nextSelectedHarnesses = selectedHarnesses) => {
    const selected = normalizeHarnesses(nextSelectedHarnesses)
    if (selected.length === 0) {
      setIsSkillInstalled(false)
      setSkillInstallPaths({})
      setSkillMessage('')
      setSkillError('')
      await persistSkillInstaller([], {})
      return { ok: true, installed: false, installPaths: {} }
    }

    const installableHarnesses = getInstallableHarnesses(selected)
    if (installableHarnesses.length === 0) {
      setIsSkillInstalled(false)
      setSkillInstallPaths({})
      setSkillMessage('')
      setSkillError('')
      await persistSkillInstaller([], {})
      return { ok: true, installed: false, installPaths: {} }
    }

    if (typeof familiar?.getSkillInstallStatus !== 'function') {
      setSkillError(mc.dashboard.wizardSkill.messages.installerUnavailableRestart)
      return { ok: false }
    }

    try {
      const statusChecks = await Promise.all(
        installableHarnesses.map(async (harness) => ({
          harness,
          result: await familiar.getSkillInstallStatus({ harness })
        }))
      )

      const failed = statusChecks.filter((entry) => !entry.result || !entry.result.ok)
      if (failed.length > 0) {
        setSkillError(mc.dashboard.wizardSkill.messages.failedToCheckSkillInstallation)
        setIsSkillInstalled(false)
        return { ok: false }
      }

      const installPaths = {}
      const missing = []
      statusChecks.forEach(({ harness, result }) => {
        if (result.path) {
          installPaths[harness] = result.path
        }
        if (!result.installed) {
          missing.push(harness)
        }
      })

      if (missing.length === 0) {
        setIsSkillInstalled(true)
        if (installableHarnesses.length === 1) {
          const single = installableHarnesses[0]
          const path = installPaths[single]
          setSkillMessage(
            path
              ? displayFormatters.wizardSkillInstalledAt(path)
              : mc.dashboard.wizardSkill.messages.installed
          )
        } else {
          setSkillMessage(
            displayFormatters.wizardSkillInstalledFor(
              installableHarnesses.map((entry) => getHarnessLabel(entry)).join(', ')
            )
          )
        }
      } else {
        const missingLines = missing
          .map((entry) => {
            const nextPath = installPaths[entry] || mc.dashboard.wizardSkill.messages.pathUnavailable
            return `${getHarnessLabel(entry)}: ${nextPath}`
          })
          .join('\n')
        setSkillMessage(`${mc.dashboard.wizardSkill.messages.installPathsHeader}\n${missingLines}`)
        setSkillError('')
        setIsSkillInstalled(false)
      }

      setSkillInstallPaths(installPaths)
      await persistSkillInstaller(selected, installPaths)
      return { ok: true, installed: missing.length === 0, installPaths }
    } catch (error) {
      console.error('Failed to check skill installation', error)
      setSkillError(mc.dashboard.wizardSkill.messages.failedToCheckSkillInstallation)
      setIsSkillInstalled(false)
      return { ok: false }
    }
  }, [
    displayFormatters,
    familiar,
    getHarnessLabel,
    getInstallableHarnesses,
    mc.dashboard.wizardSkill.messages.failedToCheckSkillInstallation,
    mc.dashboard.wizardSkill.messages.installPathsHeader,
    mc.dashboard.wizardSkill.messages.installed,
    mc.dashboard.wizardSkill.messages.installerUnavailableRestart,
    mc.dashboard.wizardSkill.messages.pathUnavailable,
    normalizeHarnesses,
    persistSkillInstaller,
    selectedHarnesses,
    setIsSkillInstalled,
    setSkillError,
    setSkillInstallPaths,
    setSkillMessage
  ])

  const installSelectedHarnesses = useCallback(async (nextSelectedHarnesses = selectedHarnesses) => {
    const selected = normalizeHarnesses(nextSelectedHarnesses)
    const installableHarnesses = getInstallableHarnesses(selected)

    if (selected.length === 0) {
      setSkillError(mc.dashboard.wizardSkill.messages.chooseHarnessFirst)
      return
    }
    if (typeof familiar?.installSkill !== 'function') {
      setSkillError(mc.dashboard.wizardSkill.messages.installerUnavailableRestart)
      return
    }

    setSkillError('')
    setSkillMessage('')
    setSkillMessage(mc.dashboard.wizardSkill.messages.installing)

    try {
      const results = await Promise.all(
        installableHarnesses.map(async (harness) => ({
          harness,
          result: await familiar.installSkill({ harness })
        }))
      )
      const failed = results.filter((entry) => !entry.result || !entry.result.ok)
      const succeeded = results.filter((entry) => entry.result && entry.result.ok)

      const installPaths = {}
      succeeded.forEach(({ harness, result }) => {
        if (result.path) {
          installPaths[harness] = result.path
        }
      })
      setSkillInstallPaths(installPaths)

      if (failed.length === 0) {
        setIsSkillInstalled(true)

        if (installableHarnesses.length === 1) {
          const nextPath = installPaths[installableHarnesses[0]]
          setSkillMessage(
            nextPath
              ? displayFormatters.wizardSkillInstalledAt(nextPath)
              : mc.dashboard.wizardSkill.messages.installed
          )
        } else {
          setSkillMessage(
            displayFormatters.wizardSkillInstalledFor(
              installableHarnesses.map((harness) => getHarnessLabel(harness)).join(', ')
            )
          )
        }

        await persistSkillInstaller(installableHarnesses, installPaths)
        return
      }

      const failedHarnesses = failed.map((entry) => trimString(entry.harness))
        .filter(Boolean)
        .map((harness) => getHarnessLabel(harness))
      const succeededHarnesses = succeeded.map((entry) => getHarnessLabel(entry.harness))
      const failedMessage = failed[0]?.result?.message || mc.dashboard.wizardSkill.messages.failedToInstallSkill

      if (succeededHarnesses.length > 0 && failedHarnesses.length > 0) {
        setSkillError(
          displayFormatters.wizardSkillInstalledAndFailed({
            succeededHarnesses: succeededHarnesses.join(', '),
            failedHarnesses: failedHarnesses.join(', '),
            message: failedMessage
          })
        )
        return
      }

      setSkillError(failedMessage)
    } catch (error) {
      console.error('Failed to install skill', error)
      setSkillError(mc.dashboard.wizardSkill.messages.failedToInstallSkill)
    }
  }, [
    displayFormatters,
    familiar,
    getHarnessLabel,
    getInstallableHarnesses,
    mc.dashboard.wizardSkill.messages.chooseHarnessFirst,
    mc.dashboard.wizardSkill.messages.failedToInstallSkill,
    mc.dashboard.wizardSkill.messages.installing,
    mc.dashboard.wizardSkill.messages.installed,
    mc.dashboard.wizardSkill.messages.installerUnavailableRestart,
    normalizeHarnesses,
    persistSkillInstaller,
    selectedHarnesses,
    setIsSkillInstalled,
    setSkillError,
    setSkillInstallPaths,
    setSkillMessage
  ])

  const handleHarnessChange = useCallback(async (event) => {
    const nextValue = event?.target?.value
    if (!nextValue) {
      return
    }
    const checked = Boolean(event?.target?.checked)
    const nextHarnesses = new Set(selectedHarnesses)
    if (checked) {
      nextHarnesses.add(nextValue)
    } else {
      nextHarnesses.delete(nextValue)
    }
    const nextArray = Array.from(nextHarnesses)

    setManualHarnessSelection(true)
    setSelectedHarnesses(nextArray)
    setSkillError('')
    setSkillInstallPaths({})
    setSkillMessage('')
    setIsSkillInstalled(false)

    if (nextArray.length === 0) {
      await persistSkillInstaller([], {})
      return
    }

    const status = await checkSkillInstallStatus(nextArray)
    if (status?.ok) {
      await installSelectedHarnesses(nextArray)
    }
  }, [
    checkSkillInstallStatus,
    installSelectedHarnesses,
    persistSkillInstaller,
    selectedHarnesses,
    setIsSkillInstalled,
    setManualHarnessSelection,
    setSelectedHarnesses,
    setSkillError,
    setSkillInstallPaths,
    setSkillMessage
  ])

  return {
    checkSkillInstallStatus,
    installSelectedHarnesses,
    handleHarnessChange
  }
}
