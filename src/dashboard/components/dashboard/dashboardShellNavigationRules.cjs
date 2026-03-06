const WIZARD_SECTION = 'wizard'
const STORAGE_SECTION = 'storage'

const resolveInitialActiveSection = (wizardCompleted) => {
  return wizardCompleted === true ? STORAGE_SECTION : WIZARD_SECTION
}

const resolveSectionSelection = ({ isWizardCompleted, nextSection, availableSectionIds = null }) => {
  if (Array.isArray(availableSectionIds) && !availableSectionIds.includes(nextSection)) {
    return { allowed: false, showError: false }
  }

  if (isWizardCompleted === true && nextSection === WIZARD_SECTION) {
    return { allowed: false, showError: false }
  }

  if (!isWizardCompleted && nextSection !== WIZARD_SECTION) {
    return { allowed: false, showError: true }
  }

  return { allowed: true, showError: false }
}

module.exports = {
  resolveInitialActiveSection,
  resolveSectionSelection,
  WIZARD_SECTION,
  STORAGE_SECTION
}
