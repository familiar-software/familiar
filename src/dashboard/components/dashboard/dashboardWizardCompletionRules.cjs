const getString = (candidate, fallback = '') => {
  return typeof candidate === 'string' && candidate.length > 0 ? candidate : fallback
}

const resolveWizardCompletion = async ({
  wizardStep,
  isWizardStepComplete,
  saveSettings,
  mc = {}
}) => {
  if (typeof isWizardStepComplete !== 'function') {
    return {
      ok: false,
      error: getString(
        mc.dashboard?.settings?.errors?.failedToSaveSetting,
        'Failed to complete wizard.'
      ),
      showError: true,
      persist: false
    }
  }

  if (!isWizardStepComplete(wizardStep)) {
    return {
      ok: false,
      error: getString(
        mc.dashboard?.wizard?.completeStepToContinue,
        'Please complete the setup wizard first.'
      ),
      showError: true,
      persist: false
    }
  }

  if (typeof saveSettings !== 'function') {
    return {
      ok: false,
      error: getString(
        mc.dashboard?.settings?.errors?.failedToSaveSetting,
        'Failed to save wizard completion.'
      ),
      showError: true,
      persist: false
    }
  }

  const payload = { wizardCompleted: true }
  const result = await saveSettings(payload)
  const isPersisted =
    typeof result === 'boolean'
      ? result
      : result && result.ok === true
  if (!isPersisted) {
    return {
      ok: false,
      error: getString(
        mc.dashboard?.settings?.errors?.failedToSaveSetting,
        'Failed to save wizard completion.'
      ),
      showError: true,
      persist: false
    }
  }

  return {
    ok: true,
    persist: true,
    nextSection: 'complete',
    completed: true,
    message: 'Wizard completed.',
    clearError: true,
    error: '',
    payload
  }
}

module.exports = {
  resolveWizardCompletion
}
