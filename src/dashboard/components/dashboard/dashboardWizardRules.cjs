const WIZARD_STEPS = [1, 2, 3, 4, 5]

// On relaunch, once permissions are granted we intentionally reopen on
// step 2 so the user always sees the storage step next, even if a
// default context folder was already auto-applied before the app quit.
// Otherwise walk forward from step 1 and return the first incomplete
// step.
const resolveInitialWizardStep = ({
  settings = {},
  isSkillInstalled = false,
  getHarnessesFromState = () => []
} = {}) => {
  if (Boolean(settings.alwaysRecordWhenActive)) {
    return 2
  }

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
      // Permissions: capturing requires the OS-granted Screen Recording
      // permission, which we record as alwaysRecordWhenActive once the
      // user has granted (see useWizardPermissionFlow).
      return Boolean(settings.alwaysRecordWhenActive)
    case 2:
      // Context: where Familiar stores screenshots/markdown. Auto-defaults
      // to $HOME on step entry so most users see ~/familiar/ and just
      // click Next.
      return Boolean(settings.contextFolderPath)
    case 3:
      // Agents: install Familiar into one or more agents (Claude Code,
      // Cursor, etc.). Always considered complete — the user can skip
      // installation entirely if none of their agents is listed, or come
      // back via Settings later. Per-row install success is reflected in
      // the UI directly; no gating needed.
      return true
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
