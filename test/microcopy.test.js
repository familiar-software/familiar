const test = require('node:test')
const assert = require('node:assert/strict')

const { microcopy, getMicrocopyValue, formatters } = require('../src/microcopy')

function collectKeyPaths(value, parentPath = '') {
  if (!value || typeof value !== 'object') {
    return []
  }
  const paths = []
  for (const key of Object.keys(value)) {
    const fullPath = parentPath ? `${parentPath}.${key}` : key
    paths.push(fullPath)
    paths.push(...collectKeyPaths(value[key], fullPath))
  }
  return paths
}

test('microcopy keys do not contain spaces', () => {
  const keyPaths = collectKeyPaths(microcopy)
  const invalid = keyPaths.find((path) => /\s/.test(path))
  assert.equal(invalid, undefined)
})

test('getMicrocopyValue resolves configured copy', () => {
  assert.equal(getMicrocopyValue('tray.actions.settings'), microcopy.tray.actions.settings)
  assert.equal(getMicrocopyValue('dashboard.sections.storage.title'), microcopy.dashboard.sections.storage.title)
  assert.equal(
    getMicrocopyValue('dashboard.html.wizardFaqTitle'),
    'FAQ'
  )
  assert.equal(
    getMicrocopyValue('dashboard.html.wizardFaqScrollHint'),
    'Scroll down to see all FAQs'
  )
  assert.equal(
    getMicrocopyValue('dashboard.html.wizardChooseContextFolderTitle'),
    'Where Familiar stores context for your AI'
  )
  assert.equal(
    getMicrocopyValue('dashboard.html.wizardChooseContextFolderDescription'),
    'Familiar will create a new folder at that destination called "familiar"'
  )
  assert.equal(
    getMicrocopyValue('dashboard.html.wizardContextFolderSetCta'),
    'Choose folder'
  )
  assert.equal(
    getMicrocopyValue('dashboard.html.wizardFaqQuestionScreenshotFrequency'),
    'How often does it take a screenshot?'
  )
  assert.equal(
    getMicrocopyValue('dashboard.html.wizardFaqAnswerScreenshotFrequency'),
    "Every few seconds, and only while you're active on your computer."
  )
})

test('formatters use configured templates', () => {
  assert.equal(
    formatters.updateAvailable({ currentVersion: '0.0.1', version: '0.0.2' }),
    'Update available: 0.0.1 -> 0.0.2. You will be prompted to download.'
  )
  assert.equal(
    formatters.wizardSkillInstalledAt('/tmp/path'),
    'Installed at /tmp/path'
  )
})
