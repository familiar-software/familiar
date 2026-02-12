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

  return { wizard, wizardNextButton }
}

test('wizard step 2 is complete in Local mode without provider/key', () => {
  const { wizard, wizardNextButton } = createWizardHarness({
    getState: () => ({
      currentStillsMarkdownExtractorType: 'apple_vision_ocr',
      currentLlmProviderName: '',
      currentLlmApiKey: '',
      isLlmApiKeySaved: false
    })
  })

  wizard.setWizardStep(2)
  assert.equal(wizardNextButton.disabled, false)
})

test('wizard step 2 requires provider + saved API key in Cloud mode', () => {
  {
    const { wizard, wizardNextButton } = createWizardHarness({
      getState: () => ({
        currentStillsMarkdownExtractorType: 'llm',
        currentLlmProviderName: '',
        currentLlmApiKey: '',
        isLlmApiKeySaved: false
      })
    })
    wizard.setWizardStep(2)
    assert.equal(wizardNextButton.disabled, true)
  }

  {
    const { wizard, wizardNextButton } = createWizardHarness({
      getState: () => ({
        currentStillsMarkdownExtractorType: 'llm',
        currentLlmProviderName: 'openai',
        currentLlmApiKey: 'sk-test',
        isLlmApiKeySaved: false
      })
    })
    wizard.setWizardStep(2)
    assert.equal(wizardNextButton.disabled, true)
  }

  {
    const { wizard, wizardNextButton } = createWizardHarness({
      getState: () => ({
        currentStillsMarkdownExtractorType: 'llm',
        currentLlmProviderName: 'openai',
        currentLlmApiKey: 'sk-test',
        isLlmApiKeySaved: true
      })
    })
    wizard.setWizardStep(2)
    assert.equal(wizardNextButton.disabled, false)
  }
})

test('wizard step 3 requires recording toggle to be enabled', () => {
  const { wizard, wizardNextButton } = createWizardHarness({
    getState: () => ({
      currentAlwaysRecordWhenActive: false
    })
  })

  wizard.setWizardStep(3)
  assert.equal(wizardNextButton.disabled, true)
})

test('wizard step 3 is complete when recording toggle is enabled', () => {
  const { wizard, wizardNextButton } = createWizardHarness({
    getState: () => ({
      currentAlwaysRecordWhenActive: true
    })
  })

  wizard.setWizardStep(3)
  assert.equal(wizardNextButton.disabled, false)
})
