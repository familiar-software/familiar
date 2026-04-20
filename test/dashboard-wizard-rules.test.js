const test = require('node:test')
const assert = require('node:assert/strict')

const {
  resolveInitialWizardStep,
  isWizardStepComplete,
  nextWizardStep,
  previousWizardStep,
  isValidWizardStep
} = require('../src/dashboard/components/dashboard/dashboardWizardRules.cjs')

test('initial wizard step starts at context when permissions already granted', () => {
  // Step 1 = permissions; if alwaysRecordWhenActive is true (i.e. macOS
  // screen-recording grant persisted), advance to step 2 (context).
  assert.equal(resolveInitialWizardStep({ settings: { alwaysRecordWhenActive: true } }), 2)
  assert.equal(resolveInitialWizardStep({ settings: { alwaysRecordWhenActive: false } }), 1)
  assert.equal(resolveInitialWizardStep(), 1)
})

test('initial wizard step stays on context after permissions are already granted', () => {
  // Relaunch after macOS permission changes should resume at step 2 even
  // if the context folder was already auto-filled earlier in the flow.
  assert.equal(
    resolveInitialWizardStep({
      settings: { contextFolderPath: '/tmp/context', alwaysRecordWhenActive: true },
      isSkillInstalled: false,
      getHarnessesFromState: () => []
    }),
    2
  )

  assert.equal(
    resolveInitialWizardStep({
      settings: { contextFolderPath: '/tmp/context', alwaysRecordWhenActive: true },
      isSkillInstalled: true,
      getHarnessesFromState: () => ['codex']
    }),
    2
  )
})

test('step 1 (permissions) is complete only when capture while active is true', () => {
  assert.equal(
    isWizardStepComplete({
      step: 1,
      settings: { alwaysRecordWhenActive: false },
      isSkillInstalled: false,
      getHarnessesFromState: () => []
    }),
    false
  )
  assert.equal(
    isWizardStepComplete({
      step: 1,
      settings: { alwaysRecordWhenActive: true },
      isSkillInstalled: false,
      getHarnessesFromState: () => []
    }),
    true
  )
})

test('step 2 (context) is complete only when context folder path is set', () => {
  assert.equal(
    isWizardStepComplete({
      step: 2,
      settings: { contextFolderPath: '' },
      isSkillInstalled: false,
      getHarnessesFromState: () => []
    }),
    false
  )
  assert.equal(
    isWizardStepComplete({
      step: 2,
      settings: { contextFolderPath: '/tmp/context' },
      isSkillInstalled: false,
      getHarnessesFromState: () => []
    }),
    true
  )
})

test('step 3 (agents) is always complete — installation is optional', () => {
  // The per-row install UI gives immediate feedback on each agent, and
  // users without any listed agent installed should still be able to
  // advance. Next is always enabled on this step.
  assert.equal(
    isWizardStepComplete({
      step: 3,
      settings: {},
      isSkillInstalled: false,
      getHarnessesFromState: () => []
    }),
    true
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
      isSkillInstalled: false,
      getHarnessesFromState: () => null
    }),
    true
  )
})

test('step 4 is an informational step and is always complete', () => {
  assert.equal(
    isWizardStepComplete({ step: 4, settings: {}, isSkillInstalled: false, getHarnessesFromState: () => ['codex'] }),
    true
  )
  assert.equal(
    isWizardStepComplete({ step: 4, settings: {}, isSkillInstalled: true, getHarnessesFromState: () => [] }),
    true
  )
})

test('step 5 is the final completion step and is always complete', () => {
  assert.equal(
    isWizardStepComplete({ step: 5, settings: {}, isSkillInstalled: false, getHarnessesFromState: () => [] }),
    true
  )
})

test('nextWizardStep advances within bounds', () => {
  assert.equal(nextWizardStep(1), 2)
  assert.equal(nextWizardStep(4), 5)
  assert.equal(nextWizardStep(5), 5)
  assert.equal(nextWizardStep(0), 1)
  assert.equal(nextWizardStep('bad'), 1)
})

test('previousWizardStep moves backward within bounds', () => {
  assert.equal(previousWizardStep(5), 4)
  assert.equal(previousWizardStep(1), 1)
  assert.equal(previousWizardStep(0), 1)
  assert.equal(previousWizardStep('bad'), 1)
})

test('isValidWizardStep recognizes legal wizard steps', () => {
  assert.equal(isValidWizardStep(1), true)
  assert.equal(isValidWizardStep(4), true)
  assert.equal(isValidWizardStep(5), true)
  assert.equal(isValidWizardStep(6), false)
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
