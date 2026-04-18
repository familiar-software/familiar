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
    getMicrocopyValue('dashboard.html.wizardAutomateTitle'),
    "What should your AI auto-update with Familiar's context?"
  )
  assert.equal(
    getMicrocopyValue('dashboard.html.wizardDestMemory'),
    'Native memory'
  )
  assert.equal(
    getMicrocopyValue('dashboard.html.wizardChooseContextFolderTitle'),
    'Every few seconds, Familiar takes a screenshot.'
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
    getMicrocopyValue('dashboard.html.wizardFirstUsecaseTitle'),
    'Paste this in your favorite agent'
  )
  assert.equal(
    getMicrocopyValue('dashboard.html.wizardTryItPinkySwear'),
    "I pinky pinky super swear that I did this because it'd be such a waste if I didn't do this and this is so damn cool and I really would be missing out."
  )
  assert.equal(
    getMicrocopyValue('dashboard.html.wizardHarnessClaudeCowork'),
    'Claude Cowork'
  )
  assert.equal(
    getMicrocopyValue('dashboard.html.wizardHarnessAnyLocalAgent'),
    'Any local agent'
  )
  // Prompt copies the tree URL (broad context for the agent); the
  // "Read the skill" link points directly at SKILL.md (blob URL) so the
  // user can read or PR the actual skill source in one click.
  assert.equal(
    getMicrocopyValue('dashboard.html.wizardSkillInstallPrompt'),
    'Install this skill: https://github.com/familiar-software/familiar/tree/main/src/skills/familiar'
  )
  assert.equal(
    getMicrocopyValue('dashboard.html.wizardReadTheSkillUrl'),
    'https://github.com/familiar-software/familiar/blob/main/src/skills/familiar/SKILL.md'
  )
  assert.equal(getMicrocopyValue('dashboard.html.wizardCopyPasteCopied'), 'Copied!')
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
