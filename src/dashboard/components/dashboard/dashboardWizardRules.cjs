const WIZARD_STEPS = [1, 2, 3, 4, 5]

// Walk forward from step 1, returning the first step that isn't yet
// complete. Keeps users from being trapped on a step they've already
// satisfied (e.g. permissions granted in a previous session) while
// still parking them at the first incomplete step if any remain.
const resolveInitialWizardStep = ({
  settings = {},
  isSkillInstalled = false,
  getHarnessesFromState = () => []
} = {}) => {
  for (const step of WIZARD_STEPS) {
    const complete = isWizardStepComplete({
      step,
      settings,
      isSkillInstalled,
      getHarnessesFromState
    })
    if (!complete) {
      return step
    }
  }
  return WIZARD_STEPS[WIZARD_STEPS.length - 1]
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
