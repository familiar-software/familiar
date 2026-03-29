const WIZARD_STEPS = [1, 2, 3, 4, 5]

const resolveInitialWizardStep = ({ settings = {} } = {}) => {
  if (Boolean(settings.contextFolderPath)) {
    return 2
  }
  return 1
}

const isWizardStepComplete = ({ step, settings = {}, isSkillInstalled = false, getHarnessesFromState }) => {
  switch (step) {
    case 1:
      return Boolean(settings.contextFolderPath)
    case 2:
      return Boolean(settings.alwaysRecordWhenActive)
    case 3: {
      const harnesses = typeof getHarnessesFromState === 'function' ? getHarnessesFromState() : []
      return Array.isArray(harnesses) && harnesses.length > 0 && isSkillInstalled
    }
    case 4:
      return true
    case 5:
      return true
    default:
      return false
  }
}

const nextWizardStep = (step) => {
  const parsed = Number(step)
  if (!Number.isFinite(parsed)) {
    return 1
  }
  return Math.min(5, Math.max(1, Math.round(parsed) + 1))
}

const previousWizardStep = (step) => {
  const parsed = Number(step)
  if (!Number.isFinite(parsed)) {
    return 1
  }
  return Math.max(1, Math.round(parsed) - 1)
}

const isValidWizardStep = (step) => {
  return WIZARD_STEPS.includes(Number(step))
}

module.exports = {
  WIZARD_STEPS,
  resolveInitialWizardStep,
  isWizardStepComplete,
  nextWizardStep,
  previousWizardStep,
  isValidWizardStep
}
