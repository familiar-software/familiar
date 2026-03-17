const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const {
  loadSettings,
  saveSettings,
  validateContextFolderPath
} = require('../src/settings')
const { SETTINGS_FILE_NAME } = require('../src/const')

test('saveSettings persists contextFolderPath', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-settings-'))
  const settingsDir = path.join(tempRoot, 'settings')
  const contextDir = path.join(tempRoot, 'context')
  fs.mkdirSync(contextDir)

  saveSettings({ contextFolderPath: contextDir }, { settingsDir })

  const loaded = loadSettings({ settingsDir })
  assert.equal(loaded.contextFolderPath, contextDir)
})

test('saveSettings does not rewrite when effective settings are unchanged', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-settings-'))
  const settingsDir = path.join(tempRoot, 'settings')
  const contextDir = path.join(tempRoot, 'context')
  const alternateContextDir = path.join(tempRoot, 'context-alt')
  fs.mkdirSync(contextDir)
  fs.mkdirSync(alternateContextDir)
  const settingsPath = path.join(settingsDir, SETTINGS_FILE_NAME)

  saveSettings({ contextFolderPath: contextDir }, { settingsDir })

  const originalWriteFileSync = fs.writeFileSync
  const writeCalls = []
  fs.writeFileSync = (...writeArgs) => {
    writeCalls.push(writeArgs[0])
    return originalWriteFileSync(...writeArgs)
  }

  try {
    const unchangedResult = saveSettings({ contextFolderPath: contextDir }, { settingsDir })
    assert.equal(unchangedResult, null)
    assert.equal(writeCalls.length, 0)

    const changedResult = saveSettings({ contextFolderPath: alternateContextDir }, { settingsDir })
    assert.equal(changedResult, settingsPath)
    assert.equal(writeCalls.length, 1)
  } finally {
    fs.writeFileSync = originalWriteFileSync
  }

  const loaded = loadSettings({ settingsDir })
  assert.equal(loaded.contextFolderPath, alternateContextDir)
})

test('saveSettings persists familiarSkillInstalledVersion', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-settings-'))
  const settingsDir = path.join(tempRoot, 'settings')

  saveSettings({ familiarSkillInstalledVersion: '2.0.0' }, { settingsDir })

  const loaded = loadSettings({ settingsDir })
  assert.equal(loaded.familiarSkillInstalledVersion, '2.0.0')
})

test('saveSettings preserves familiarSkillInstalledVersion when updating other settings', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-settings-'))
  const settingsDir = path.join(tempRoot, 'settings')

  saveSettings({ familiarSkillInstalledVersion: '2.0.0' }, { settingsDir })
  saveSettings({ contextFolderPath: path.join(tempRoot, 'context') }, { settingsDir })

  const loaded = loadSettings({ settingsDir })
  assert.equal(loaded.familiarSkillInstalledVersion, '2.0.0')
})

test('saveSettings normalizes single skillInstaller harness + installPath into arrays', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-settings-'))
  const settingsDir = path.join(tempRoot, 'settings')

  saveSettings({ skillInstaller: { harness: 'codex', installPath: '/tmp/.codex/skills/familiar' } }, { settingsDir })

  const loaded = loadSettings({ settingsDir })
  assert.deepEqual(loaded.skillInstaller?.harness, ['codex'])
  assert.deepEqual(loaded.skillInstaller?.installPath, ['/tmp/.codex/skills/familiar'])
})

test('saveSettings normalizes antigravity single skillInstaller values into arrays', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-settings-'))
  const settingsDir = path.join(tempRoot, 'settings')

  saveSettings({ skillInstaller: { harness: 'antigravity', installPath: '/tmp/.gemini/antigravity/skills/familiar' } }, { settingsDir })

  const loaded = loadSettings({ settingsDir })
  assert.deepEqual(loaded.skillInstaller?.harness, ['antigravity'])
  assert.deepEqual(loaded.skillInstaller?.installPath, ['/tmp/.gemini/antigravity/skills/familiar'])
})

test('saveSettings persists skillInstaller arrays from legacy harnesses/installPaths fields', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-settings-'))
  const settingsDir = path.join(tempRoot, 'settings')

  saveSettings({
    skillInstaller: {
      harnesses: ['codex', 'cursor'],
      installPaths: {
        codex: '/tmp/.codex/skills/familiar',
        cursor: '/tmp/.cursor/skills/familiar'
      }
    }
  }, { settingsDir })

  const loaded = loadSettings({ settingsDir })
  assert.deepEqual(loaded.skillInstaller?.harness, ['codex', 'cursor'])
  assert.deepEqual(
    loaded.skillInstaller?.installPath,
    ['/tmp/.codex/skills/familiar', '/tmp/.cursor/skills/familiar']
  )
})

test('saveSettings preserves skillInstaller when updating other settings', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-settings-'))
  const settingsDir = path.join(tempRoot, 'settings')
  const contextDir = path.join(tempRoot, 'context')
  fs.mkdirSync(contextDir)

  saveSettings({ skillInstaller: { harness: 'cursor', installPath: '/tmp/.cursor/skills/familiar' } }, { settingsDir })
  saveSettings({ contextFolderPath: contextDir }, { settingsDir })

  const loaded = loadSettings({ settingsDir })
  assert.equal(loaded.contextFolderPath, contextDir)
  assert.deepEqual(loaded.skillInstaller?.harness, ['cursor'])
  assert.deepEqual(loaded.skillInstaller?.installPath, ['/tmp/.cursor/skills/familiar'])
})

test('saveSettings migrates legacy on-disk single skillInstaller values to arrays on next save', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-settings-'))
  const settingsDir = path.join(tempRoot, 'settings')
  fs.mkdirSync(settingsDir, { recursive: true })
  const settingsPath = path.join(settingsDir, SETTINGS_FILE_NAME)

  fs.writeFileSync(
    settingsPath,
    JSON.stringify(
      {
        contextFolderPath: '',
        skillInstaller: {
          harness: 'codex',
          installPath: '/tmp/.codex/skills/familiar'
        }
      },
      null,
      2
    ),
    'utf-8'
  )

  saveSettings({ wizardCompleted: true }, { settingsDir })
  const loaded = loadSettings({ settingsDir })

  assert.equal(loaded.wizardCompleted, true)
  assert.deepEqual(loaded.skillInstaller?.harness, ['codex'])
  assert.deepEqual(loaded.skillInstaller?.installPath, ['/tmp/.codex/skills/familiar'])
})

test('validateContextFolderPath rejects missing directory', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-settings-'))
  const missingPath = path.join(tempRoot, 'missing')

  const result = validateContextFolderPath(missingPath)
  assert.equal(result.ok, false)
  assert.equal(result.message, 'Selected path does not exist.')
})

test('validateContextFolderPath rejects file path', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-settings-'))
  const filePath = path.join(tempRoot, 'not-a-dir.txt')
  fs.writeFileSync(filePath, 'nope', 'utf-8')

  const result = validateContextFolderPath(filePath)
  assert.equal(result.ok, false)
  assert.equal(result.message, 'Selected path is not a directory.')
})

test('saveSettings preserves updateLastCheckedAt when updating other settings', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-settings-'))
  const settingsDir = path.join(tempRoot, 'settings')
  const contextDir = path.join(tempRoot, 'context')
  fs.mkdirSync(contextDir)

  saveSettings({ updateLastCheckedAt: 1711111111111 }, { settingsDir })
  saveSettings({ contextFolderPath: contextDir }, { settingsDir })

  const loaded = loadSettings({ settingsDir })
  assert.equal(loaded.updateLastCheckedAt, 1711111111111)
  assert.equal(loaded.contextFolderPath, contextDir)
})

test('saveSettings persists storage auto cleanup retention days', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-settings-'))
  const settingsDir = path.join(tempRoot, 'settings')

  saveSettings({ storageAutoCleanupRetentionDays: 2 }, { settingsDir })
  const loaded = loadSettings({ settingsDir })
  assert.equal(loaded.storageAutoCleanupRetentionDays, 2)
})

test('saveSettings normalizes invalid storage auto cleanup retention days to 2', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-settings-'))
  const settingsDir = path.join(tempRoot, 'settings')

  saveSettings({ storageAutoCleanupRetentionDays: 9 }, { settingsDir })
  const loaded = loadSettings({ settingsDir })
  assert.equal(loaded.storageAutoCleanupRetentionDays, 2)
})

test('saveSettings preserves storage auto cleanup retention days when updating other settings', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-settings-'))
  const settingsDir = path.join(tempRoot, 'settings')
  const contextDir = path.join(tempRoot, 'context')
  fs.mkdirSync(contextDir)

  saveSettings({ storageAutoCleanupRetentionDays: 2 }, { settingsDir })
  saveSettings({ contextFolderPath: contextDir }, { settingsDir })
  const loaded = loadSettings({ settingsDir })
  assert.equal(loaded.storageAutoCleanupRetentionDays, 2)
  assert.equal(loaded.contextFolderPath, contextDir)
})

test('saveSettings persists storage auto cleanup last run timestamp', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-settings-'))
  const settingsDir = path.join(tempRoot, 'settings')
  const expected = Date.parse('2026-02-20T11:00:00.000Z')

  saveSettings({ storageAutoCleanupLastRunAt: expected }, { settingsDir })
  const loaded = loadSettings({ settingsDir })
  assert.equal(loaded.storageAutoCleanupLastRunAt, expected)
})

test('saveSettings persists alwaysRecordWhenActive', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-settings-'))
  const settingsDir = path.join(tempRoot, 'settings')

  saveSettings({ alwaysRecordWhenActive: true }, { settingsDir })

  const loaded = loadSettings({ settingsDir })
  assert.equal(loaded.alwaysRecordWhenActive, true)
})

test('saveSettings preserves heartbeat outputFolderPath values', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-settings-'))
  const settingsDir = path.join(tempRoot, 'settings')
  const outputFolderPath = path.join(tempRoot, 'heartbeat-output')
  fs.mkdirSync(outputFolderPath)

  saveSettings({
    heartbeats: {
      items: [
        {
          id: 'hb-1',
          topic: 'daily_summary',
          prompt: 'Summarize',
          runner: 'codex',
          outputFolderPath,
          schedule: {
            frequency: 'daily',
            time: '09:00',
            timezone: 'UTC'
          }
        }
      ]
    }
  }, { settingsDir })

  const loaded = loadSettings({ settingsDir })
  assert.equal(loaded.heartbeats.items[0].outputFolderPath, outputFolderPath)
})

test('saveSettings persists normalized capturePrivacy.blacklistedApps', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-settings-'))
  const settingsDir = path.join(tempRoot, 'settings')

  saveSettings({
    capturePrivacy: {
      blacklistedApps: [
        { bundleId: 'com.apple.MobileSMS', name: 'Messages' },
        { bundleId: 'com.apple.MobileSMS', name: 'Messages duplicate' },
        { name: ' Slack ' }
      ]
    }
  }, { settingsDir })

  const loaded = loadSettings({ settingsDir })
  assert.deepEqual(loaded.capturePrivacy, {
    blacklistedApps: [
      { bundleId: 'com.apple.MobileSMS', name: 'Messages' },
      { bundleId: null, name: 'Slack' }
    ]
  })
})

test('saveSettings preserves alwaysRecordWhenActive when updating other settings', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-settings-'))
  const settingsDir = path.join(tempRoot, 'settings')
  const contextDir = path.join(tempRoot, 'context')
  fs.mkdirSync(contextDir)

  saveSettings({ alwaysRecordWhenActive: true }, { settingsDir })
  saveSettings({ contextFolderPath: contextDir }, { settingsDir })

  const loaded = loadSettings({ settingsDir })
  assert.equal(loaded.alwaysRecordWhenActive, true)
  assert.equal(loaded.contextFolderPath, contextDir)
})

test('saveSettings persists wizardCompleted', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-settings-'))
  const settingsDir = path.join(tempRoot, 'settings')

  saveSettings({ wizardCompleted: true }, { settingsDir })

  const loaded = loadSettings({ settingsDir })
  assert.equal(loaded.wizardCompleted, true)
})

test('saveSettings preserves wizardCompleted when updating other settings', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-settings-'))
  const settingsDir = path.join(tempRoot, 'settings')
  const contextDir = path.join(tempRoot, 'context')
  fs.mkdirSync(contextDir)

  saveSettings({ wizardCompleted: true }, { settingsDir })
  saveSettings({ contextFolderPath: contextDir }, { settingsDir })

  const loaded = loadSettings({ settingsDir })
  assert.equal(loaded.wizardCompleted, true)
  assert.equal(loaded.contextFolderPath, contextDir)
})

test('loadSettings exposes parse errors for diagnostics', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-settings-'))
  const settingsDir = path.join(tempRoot, 'settings')
  fs.mkdirSync(settingsDir, { recursive: true })

  const settingsPath = path.join(settingsDir, SETTINGS_FILE_NAME)
  fs.writeFileSync(settingsPath, '{not-json', 'utf-8')

  const loaded = loadSettings({ settingsDir })
  assert.ok(loaded.__loadError)
  assert.equal(loaded.__loadError.path, settingsPath)
  assert.equal(typeof loaded.__loadError.message, 'string')
  assert.ok(loaded.__loadError.message.length > 0)
})
