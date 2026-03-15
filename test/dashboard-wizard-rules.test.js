const test = require('node:test')
const assert = require('node:assert/strict')

const {
  resolveInitialWizardStep,
  isWizardStepComplete,
  nextWizardStep,
  previousWizardStep,
  isValidWizardStep
} = require('../src/dashboard/components/dashboard/dashboardWizardRules.cjs')

test('initial wizard step starts at permissions when context folder path is already set', () => {
  assert.equal(resolveInitialWizardStep({ settings: { contextFolderPath: '/tmp/context' } }), 2)
  assert.equal(resolveInitialWizardStep({ settings: { contextFolderPath: '' } }), 1)
  assert.equal(resolveInitialWizardStep(), 1)
})

test('step 1 is complete only when context folder path is set', () => {
  assert.equal(
    isWizardStepComplete({
      step: 1,
      settings: { contextFolderPath: '' },
      isSkillInstalled: false,
      getHarnessesFromState: () => []
    }),
    false
  )
  assert.equal(
    isWizardStepComplete({
      step: 1,
      settings: { contextFolderPath: '/tmp/context' },
      isSkillInstalled: false,
      getHarnessesFromState: () => []
    }),
    true
  )
})

test('step 2 is complete only when capture while active is true', () => {
  assert.equal(
    isWizardStepComplete({
      step: 2,
      settings: { alwaysRecordWhenActive: false },
      isSkillInstalled: false,
      getHarnessesFromState: () => []
    }),
    false
  )
  assert.equal(
    isWizardStepComplete({
      step: 2,
      settings: { alwaysRecordWhenActive: true },
      isSkillInstalled: false,
      getHarnessesFromState: () => []
    }),
    true
  )
})

test('step 3 requires at least one selected harness and installed state', () => {
  assert.equal(
    isWizardStepComplete({
      step: 3,
      settings: {},
      isSkillInstalled: false,
      getHarnessesFromState: () => ['codex']
    }),
    false
  )
  assert.equal(
    isWizardStepComplete({
      step: 3,
      settings: {},
      isSkillInstalled: true,
      getHarnessesFromState: () => ['codex']
    }),
    true
  )
  assert.equal(
    isWizardStepComplete({
      step: 3,
      settings: {},
      isSkillInstalled: true,
      getHarnessesFromState: () => []
    }),
    false
  )
})

test('step 3 ignores non-array harness state and requires installed state', () => {
  assert.equal(
    isWizardStepComplete({
      step: 3,
      settings: {},
      isSkillInstalled: true,
      getHarnessesFromState: () => null
    }),
    false
  )
})

test('step 4 requires skill installed', () => {
  assert.equal(
    isWizardStepComplete({ step: 4, settings: {}, isSkillInstalled: false, getHarnessesFromState: () => ['codex'] }),
    false
  )
  assert.equal(
    isWizardStepComplete({ step: 4, settings: {}, isSkillInstalled: true, getHarnessesFromState: () => [] }),
    true
  )
})

test('nextWizardStep advances within bounds', () => {
  assert.equal(nextWizardStep(1), 2)
  assert.equal(nextWizardStep(4), 4)
  assert.equal(nextWizardStep(0), 1)
  assert.equal(nextWizardStep('bad'), 1)
})

test('previousWizardStep moves backward within bounds', () => {
  assert.equal(previousWizardStep(4), 3)
  assert.equal(previousWizardStep(1), 1)
  assert.equal(previousWizardStep(0), 1)
  assert.equal(previousWizardStep('bad'), 1)
})

test('isValidWizardStep recognizes legal wizard steps', () => {
  assert.equal(isValidWizardStep(1), true)
  assert.equal(isValidWizardStep(4), true)
  assert.equal(isValidWizardStep(5), false)
  assert.equal(isValidWizardStep('bad'), false)
})

test('step completion returns false for an invalid step', () => {
  assert.equal(
    isWizardStepComplete({
      step: 99,
      settings: {
        contextFolderPath: '/tmp/context',
        alwaysRecordWhenActive: true
      },
      isSkillInstalled: true,
      getHarnessesFromState: () => ['codex']
    }),
    false
  )
})
