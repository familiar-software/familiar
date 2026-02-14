const test = require('node:test')
const assert = require('node:assert/strict')

const { createWizard } = require('../src/dashboard/wizard')

function createNoopClassList() {
  return {
    toggle: () => {}
  }
}

function createWizardHarness({ getState }) {
  const makeButton = () => ({
    disabled: false,
    classList: createNoopClassList(),
    addEventListener: () => {}
  })

  const wizardBackButton = makeButton()
  const wizardNextButton = makeButton()
  const wizardDoneButton = makeButton()
  const wizardCompleteStatus = { classList: createNoopClassList() }
  const wizardStepStatus = { textContent: '', classList: createNoopClassList() }

  const wizardStepPanels = [
    { dataset: { wizardStep: '1' }, classList: createNoopClassList() },
    { dataset: { wizardStep: '2' }, classList: createNoopClassList() },
    { dataset: { wizardStep: '3' }, classList: createNoopClassList() },
    { dataset: { wizardStep: '4' }, classList: createNoopClassList() }
  ]

  const wizard = createWizard({
    elements: {
      wizardSection: {},
      wizardBackButton,
      wizardNextButton,
      wizardDoneButton,
      wizardCompleteStatus,
      wizardStepStatus,
      wizardStepPanels,
      wizardStepIndicators: [],
      wizardStepConnectors: []
    },
    getState,
    onDone: () => {}
  })

  return { wizard, wizardNextButton, wizardDoneButton }
}

test('wizard step 1 requires a context folder path', () => {
  const { wizard, wizardNextButton } = createWizardHarness({
    getState: () => ({
      currentContextFolderPath: ''
    })
  })

  wizard.setWizardStep(1)
  assert.equal(wizardNextButton.disabled, true)
})

test('wizard step 1 is complete when context folder path is set', () => {
  const { wizard, wizardNextButton } = createWizardHarness({
    getState: () => ({
      currentContextFolderPath: '/tmp/context'
    })
  })

  wizard.setWizardStep(1)
  assert.equal(wizardNextButton.disabled, false)
})

test('wizard step 2 requires recording toggle to be enabled', () => {
  const { wizard, wizardNextButton } = createWizardHarness({
    getState: () => ({
      currentAlwaysRecordWhenActive: false
    })
  })

  wizard.setWizardStep(2)
  assert.equal(wizardNextButton.disabled, true)
})

test('wizard step 2 is complete when recording toggle is enabled', () => {
  const { wizard, wizardNextButton } = createWizardHarness({
    getState: () => ({
      currentAlwaysRecordWhenActive: true
    })
  })

  wizard.setWizardStep(2)
  assert.equal(wizardNextButton.disabled, false)
})

test('wizard step 3 requires skill installation', () => {
  const { wizard, wizardNextButton } = createWizardHarness({
    getState: () => ({
      isSkillInstalled: false
    })
  })

  wizard.setWizardStep(3)
  assert.equal(wizardNextButton.disabled, true)
})

test('wizard step 3 is complete when skill is installed', () => {
  const { wizard, wizardNextButton } = createWizardHarness({
    getState: () => ({
      isSkillInstalled: true
    })
  })

  wizard.setWizardStep(3)
  assert.equal(wizardNextButton.disabled, false)
})

test('wizard step 4 requires skill installation', () => {
  const { wizard, wizardDoneButton } = createWizardHarness({
    getState: () => ({
      isSkillInstalled: false
    })
  })

  wizard.setWizardStep(4)
  assert.equal(wizardDoneButton.disabled, true)
})

test('wizard step 4 is complete after skill is installed', () => {
  const { wizard, wizardDoneButton } = createWizardHarness({
    getState: () => ({
      isSkillInstalled: true
    })
  })

  wizard.setWizardStep(4)
  assert.equal(wizardDoneButton.disabled, false)
})
