const test = require('node:test')
const assert = require('node:assert/strict')

const { resolveWizardCompletion } = require('../src/dashboard/components/dashboard/dashboardWizardCompletionRules.cjs')

const createMicrocopy = (overrides = {}) => ({
  dashboard: {
    wizard: {
      completeStepToContinue: 'Complete each step before continuing.'
    },
    settings: {
      errors: {
        failedToSaveSetting: 'Failed to save setting.'
      }
    },
    ...overrides
  }
})

test('completion fails when current wizard step is incomplete', async () => {
  const result = await resolveWizardCompletion({
    wizardStep: 2,
    isWizardStepComplete: () => false,
    saveSettings: async () => ({ ok: true }),
    mc: createMicrocopy()
  })

  assert.equal(result.ok, false)
  assert.equal(result.error, 'Complete each step before continuing.')
  assert.equal(result.showError, true)
  assert.equal(result.persist, false)
})

test('completion fails when saveSettings is unavailable', async () => {
  const result = await resolveWizardCompletion({
    wizardStep: 2,
    isWizardStepComplete: () => true,
    mc: createMicrocopy()
  })

  assert.equal(result.ok, false)
  assert.equal(result.error, 'Failed to save setting.')
  assert.equal(result.showError, true)
  assert.equal(result.persist, false)
})

test('completion fails when persistence rejects save result', async () => {
  const result = await resolveWizardCompletion({
    wizardStep: 2,
    isWizardStepComplete: () => true,
    saveSettings: async () => false,
    mc: createMicrocopy()
  })

  assert.equal(result.ok, false)
  assert.equal(result.error, 'Failed to save setting.')
  assert.equal(result.showError, true)
  assert.equal(result.persist, false)
})

test('completion fails when save result returns {ok: false}', async () => {
  const result = await resolveWizardCompletion({
    wizardStep: 2,
    isWizardStepComplete: () => true,
    saveSettings: async () => ({ ok: false }),
    mc: createMicrocopy()
  })

  assert.equal(result.ok, false)
  assert.equal(result.error, 'Failed to save setting.')
  assert.equal(result.showError, true)
  assert.equal(result.persist, false)
})

test('completion succeeds and requests storage navigation', async () => {
  const saveCalls = []
  const result = await resolveWizardCompletion({
    wizardStep: 2,
    isWizardStepComplete: () => true,
    saveSettings: async (payload) => {
      saveCalls.push(payload)
      return { ok: true }
    },
    mc: createMicrocopy()
  })

  assert.equal(result.ok, true)
  assert.equal(result.persist, true)
  assert.equal(result.nextSection, 'storage')
  assert.equal(result.completed, true)
  assert.equal(result.message, 'Wizard completed.')
  assert.equal(result.clearError, true)
  assert.deepEqual(saveCalls[0], { wizardCompleted: true })
})

test('completion succeeds when microcopy is missing', async () => {
  const result = await resolveWizardCompletion({
    wizardStep: 5,
    isWizardStepComplete: () => true,
    saveSettings: async () => ({ ok: true }),
    mc: {}
  })

  assert.equal(result.ok, true)
  assert.equal(result.message, 'Wizard completed.')
})
