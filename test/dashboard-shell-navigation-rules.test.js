const test = require('node:test')
const assert = require('node:assert/strict')

const {
  resolveInitialActiveSection,
  resolveSectionSelection
} = require('../src/dashboard/components/dashboard/dashboardShellNavigationRules.cjs')

test('uses wizard as initial section when wizardCompleted is missing', () => {
  assert.equal(resolveInitialActiveSection(undefined), 'wizard')
})

test('uses wizard as initial section when wizardCompleted is false', () => {
  assert.equal(resolveInitialActiveSection(false), 'wizard')
})

test('uses storage as initial section when wizardCompleted is true', () => {
  assert.equal(resolveInitialActiveSection(true), 'storage')
})

test('blocks section navigation when wizard is incomplete', () => {
  const result = resolveSectionSelection({ isWizardCompleted: false, nextSection: 'storage' })
  assert.equal(result.allowed, false)
  assert.equal(result.showError, true)
})

test('allows wizard section while wizard is incomplete', () => {
  const result = resolveSectionSelection({ isWizardCompleted: false, nextSection: 'wizard' })
  assert.equal(result.allowed, true)
  assert.equal(result.showError, false)
})

test('blocks returning to wizard after completion', () => {
  const result = resolveSectionSelection({ isWizardCompleted: true, nextSection: 'wizard' })
  assert.equal(result.allowed, false)
  assert.equal(result.showError, false)
})

test('allows non-wizard sections after completion', () => {
  const result = resolveSectionSelection({ isWizardCompleted: true, nextSection: 'storage' })
  assert.equal(result.allowed, true)
  assert.equal(result.showError, false)
})

test('blocks missing section target while wizard is incomplete', () => {
  const result = resolveSectionSelection({
    isWizardCompleted: false,
    nextSection: undefined,
    availableSectionIds: ['wizard', 'storage']
  })
  assert.equal(result.allowed, false)
  assert.equal(result.showError, false)
})

test('blocks unavailable section target when section is omitted from navigation', () => {
  const result = resolveSectionSelection({
    isWizardCompleted: true,
    nextSection: 'missing-section',
    availableSectionIds: ['storage', 'recording', 'install-skill']
  })
  assert.equal(result.allowed, false)
  assert.equal(result.showError, false)
})

test('treats unknown section as allowed when section availability is not provided', () => {
  const result = resolveSectionSelection({ isWizardCompleted: true, nextSection: 'unknown' })
  assert.equal(result.allowed, true)
  assert.equal(result.showError, false)
})
