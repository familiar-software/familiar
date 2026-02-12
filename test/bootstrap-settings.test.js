const assert = require('node:assert/strict')
const { test } = require('node:test')

test('bootstrapSettings forwards setSkillHarness to FamiliarSettings.createSettings', () => {
  const { bootstrapSettings } = require('../src/dashboard/bootstrap/settings')

  let receivedOptions = null
  const window = {
    FamiliarSettings: {
      createSettings: (options) => {
        receivedOptions = options
        return { isReady: true, loadSettings: async () => ({}) }
      }
    }
  }

  const setSkillHarness = () => {}

  const result = bootstrapSettings({
    window,
    elements: {},
    familiar: {},
    defaults: {},
    getState: () => ({}),
    setContextFolderValue: () => {},
    setSkillHarness,
    setLlmProviderValue: () => {},
    setLlmApiKeyPending: () => {},
    setLlmApiKeySaved: () => {},
    setStillsMarkdownExtractorType: () => {},
    setAlwaysRecordWhenActiveValue: () => {},
    setMessage: () => {},
    updateWizardUI: () => {}
  })

  assert.ok(result, 'expected bootstrapSettings to return a settings api')
  assert.ok(receivedOptions, 'expected createSettings to be called')
  assert.equal(receivedOptions.setSkillHarness, setSkillHarness)
})
