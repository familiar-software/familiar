(function (global) {
  const toggleClasses = (element, classes, isActive) => {
    if (!element) {
      return
    }
    classes.forEach((className) => {
      element.classList.toggle(className, isActive)
    })
  }

  const createWizard = (options = {}) => {
    const elements = options.elements || {}
    const getState = typeof options.getState === 'function' ? options.getState : () => ({})
    const onDone = typeof options.onDone === 'function' ? options.onDone : () => {}

    const {
      wizardSection,
      wizardBackButton,
      wizardNextButton,
      wizardDoneButton,
      wizardCompleteStatus,
      wizardStepStatus,
      wizardStepPanels = [],
      wizardStepIndicators = [],
      wizardStepConnectors = []
    } = elements

    const WIZARD_STEP_COUNT = 5
    let wizardStep = 1

    const isWizardStepComplete = (step) => {
      const state = getState()
      switch (step) {
        case 1:
          return Boolean(state.currentContextFolderPath)
        case 2:
          return Boolean(state.currentContextFolderPath)
        case 3:
          return Boolean(state.currentLlmProviderName && state.currentLlmApiKey && state.isLlmApiKeySaved)
        case 4:
          return Boolean(state.hasCompletedSync || state.isContextGraphSynced)
        case 5:
          return Boolean(state.currentCaptureHotkey || state.currentClipboardHotkey || state.currentRecordingHotkey)
        default:
          return false
      }
    }

    const updateWizardUI = () => {
      if (!wizardSection) {
        return
      }

      wizardStepPanels.forEach((panel) => {
        const step = Number(panel.dataset.wizardStep)
        panel.classList.toggle('hidden', step !== wizardStep)
      })

      const canAdvance = isWizardStepComplete(wizardStep)

      if (wizardBackButton) {
        wizardBackButton.disabled = wizardStep <= 1
      }

      if (wizardNextButton) {
        wizardNextButton.classList.toggle('hidden', wizardStep >= WIZARD_STEP_COUNT)
        wizardNextButton.disabled = !canAdvance
      }

      if (wizardDoneButton) {
        const isDoneStep = wizardStep >= WIZARD_STEP_COUNT
        wizardDoneButton.classList.toggle('hidden', !isDoneStep)
        wizardDoneButton.disabled = !canAdvance
      }

      if (wizardCompleteStatus) {
        wizardCompleteStatus.classList.toggle('hidden', !(wizardStep === WIZARD_STEP_COUNT && canAdvance))
      }

      if (wizardStepStatus) {
        const needsAction = !canAdvance
        wizardStepStatus.textContent = needsAction ? 'Complete this step to continue.' : ''
        wizardStepStatus.classList.toggle('hidden', !needsAction)
      }

      wizardStepIndicators.forEach((indicator) => {
        const step = Number(indicator.dataset.wizardStepIndicator)
        const isActive = step === wizardStep
        const isComplete = step < wizardStep
        const circle = indicator.querySelector('[data-wizard-step-circle]')
        const label = indicator.querySelector('[data-wizard-step-label]')

        toggleClasses(circle, ['border-indigo-600', 'text-indigo-600', 'bg-indigo-50', 'dark:bg-indigo-900/30'], isActive)
        toggleClasses(circle, ['bg-indigo-600', 'text-white', 'border-indigo-600'], isComplete)
        toggleClasses(circle, ['border-zinc-200', 'dark:border-zinc-700', 'text-zinc-500'], !isActive && !isComplete)

        toggleClasses(label, ['text-zinc-900', 'dark:text-zinc-100', 'font-semibold'], isActive)
        toggleClasses(label, ['text-indigo-600', 'dark:text-indigo-400'], isComplete)
        toggleClasses(label, ['text-zinc-500', 'dark:text-zinc-400'], !isActive && !isComplete)
      })

      wizardStepConnectors.forEach((connector) => {
        const stepIndex = Number(connector.dataset.wizardStepConnector)
        connector.style.width = wizardStep > stepIndex ? '100%' : '0%'
      })
    }

    const setWizardStep = (step) => {
      const nextStep = Math.max(1, Math.min(WIZARD_STEP_COUNT, Number(step) || 1))
      wizardStep = nextStep
      console.log('Wizard step changed', { step: wizardStep })
      updateWizardUI()
    }

    if (wizardBackButton) {
      wizardBackButton.addEventListener('click', () => {
        setWizardStep(wizardStep - 1)
      })
    }

    if (wizardNextButton) {
      wizardNextButton.addEventListener('click', () => {
        if (!isWizardStepComplete(wizardStep)) {
          updateWizardUI()
          return
        }
        setWizardStep(wizardStep + 1)
      })
    }

    if (wizardDoneButton) {
      wizardDoneButton.addEventListener('click', () => {
        if (!isWizardStepComplete(wizardStep)) {
          updateWizardUI()
          return
        }
        setWizardStep(1)
        onDone()
      })
    }

    return {
      getWizardStep: () => wizardStep,
      setWizardStep,
      updateWizardUI
    }
  }

  const registry = global.JiminyWizard || {}
  registry.createWizard = createWizard
  global.JiminyWizard = registry

  // Export for Node/CommonJS so tests can require this module; browsers ignore this.
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = registry
  }
})(window)
