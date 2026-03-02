const test = require('node:test')
const assert = require('node:assert/strict')

const {
  ensureFamiliarSkillAlignment,
  shouldReinstallFamiliarSkill
} = require('../src/skills/familiar-skill-alignment')
const { SKILL_MARKER_VERSION_UNKNOWN } = require('../src/skills/familiar-skill-version')

const noopLogger = {
  log: () => {},
  warn: () => {},
  error: () => {}
}

test('familiar-alignment', async (t) => {
  await t.test('shouldReinstallFamiliarSkill marks unknown source versions for reinstall', () => {
    assert.equal(shouldReinstallFamiliarSkill({ sourceVersion: '1.0.0', installedVersion: '1.0.0' }), false)
    assert.equal(shouldReinstallFamiliarSkill({ sourceVersion: '1.0.0', installedVersion: '2.0.0' }), true)
    assert.equal(shouldReinstallFamiliarSkill({ sourceVersion: SKILL_MARKER_VERSION_UNKNOWN, installedVersion: '1.0.0' }), true)
    assert.equal(shouldReinstallFamiliarSkill({ sourceVersion: SKILL_MARKER_VERSION_UNKNOWN, installedVersion: null }), true)
  })

  await t.test('skips alignment when no harnesses are configured', async () => {
    let installed = null
    const result = await ensureFamiliarSkillAlignment({
      settingsLoader: () => ({}),
      resolveHarnesses: () => [],
      sourceVersionResolver: async () => '1.0.0',
      installSkill: async () => {
        installed = '1.0.0'
        return { path: '/tmp' }
      },
      settingsSaver: async () => {
        installed = 'saved'
      },
      logger: noopLogger
    })

    assert.equal(result.status, 'skipped-no-harnesses')
    assert.equal(installed, null)
  })

  await t.test('skips alignment when source and installed versions match', async () => {
    let installs = 0
    let saveCalls = 0
    const result = await ensureFamiliarSkillAlignment({
      settingsLoader: () => ({
        skillInstaller: { harness: ['codex'] },
        familiarSkillInstalledVersion: '1.0.0'
      }),
      sourceVersionResolver: async () => '1.0.0',
      installSkill: async () => {
        installs += 1
        return { path: '/tmp' }
      },
      settingsSaver: () => {
        saveCalls += 1
      },
      logger: noopLogger
    })

    assert.equal(result.status, 'already-aligned')
    assert.equal(installs, 0)
    assert.equal(saveCalls, 0)
  })

  await t.test('installs and saves version when source version differs', async () => {
    let savedVersion = null
    const installedHarnesses = []
    const result = await ensureFamiliarSkillAlignment({
      settingsLoader: () => ({
        skillInstaller: { harness: ['codex', 'cursor'] },
        familiarSkillInstalledVersion: '1.0.0'
      }),
      sourceVersionResolver: async () => '2.0.0',
      installSkill: async ({ harness }) => {
        installedHarnesses.push(harness)
        return { path: `/tmp/${harness}` }
      },
      settingsSaver: ({ familiarSkillInstalledVersion }) => {
        savedVersion = familiarSkillInstalledVersion
      },
      logger: noopLogger
    })

    assert.equal(result.status, 'installed')
    assert.equal(savedVersion, '2.0.0')
    assert.equal(installedHarnesses.length, 2)
    assert.deepEqual(installedHarnesses, ['codex', 'cursor'])
  })

  await t.test('reinstalls when source version is missing', async () => {
    let installs = 0
    let savedVersion = null
    const result = await ensureFamiliarSkillAlignment({
      settingsLoader: () => ({
        skillInstaller: { harness: ['codex'] },
        familiarSkillInstalledVersion: '2.0.0'
      }),
      sourceVersionResolver: async () => SKILL_MARKER_VERSION_UNKNOWN,
      installSkill: async () => {
        installs += 1
        return { path: '/tmp/codex' }
      },
      settingsSaver: ({ familiarSkillInstalledVersion }) => {
        savedVersion = familiarSkillInstalledVersion
      },
      logger: noopLogger
    })

    assert.equal(result.status, 'installed')
    assert.equal(installs, 1)
    assert.equal(savedVersion, SKILL_MARKER_VERSION_UNKNOWN)
  })

  await t.test('returns failed status and does not save version when any install fails', async () => {
    let saveCalls = 0
    const result = await ensureFamiliarSkillAlignment({
      settingsLoader: () => ({
        skillInstaller: { harness: ['codex', 'cursor'] },
        familiarSkillInstalledVersion: '1.0.0'
      }),
      sourceVersionResolver: async () => '2.0.0',
      installSkill: async ({ harness }) => {
        if (harness === 'cursor') {
          const error = new Error('Install failure')
          error.code = 'EFAIL'
          throw error
        }
        return { path: '/tmp/codex' }
      },
      settingsSaver: () => {
        saveCalls += 1
      },
      logger: noopLogger
    })

    assert.equal(result.status, 'failed')
    assert.equal(saveCalls, 0)
    assert.equal(result.failures.length, 1)
    assert.equal(result.failures[0].harness, 'cursor')
  })
})
