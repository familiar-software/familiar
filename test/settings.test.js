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

test('saveSettings drops legacy heartbeats when rewriting settings', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-settings-'))
  const settingsDir = path.join(tempRoot, 'settings')
  const contextDir = path.join(tempRoot, 'context')
  fs.mkdirSync(contextDir)

  saveSettings({
    heartbeats: {
      items: [
        {
          id: 'hb-1',
          topic: 'daily_summary',
          prompt: 'Summarize',
          runner: 'codex',
          outputFolderPath: path.join(tempRoot, 'heartbeat-output'),
          schedule: {
            frequency: 'daily',
            time: '09:00',
            timezone: 'UTC'
          }
        }
      ]
    }
  }, { settingsDir })
  saveSettings({ contextFolderPath: contextDir }, { settingsDir })

  const loaded = loadSettings({ settingsDir })
  assert.equal(Object.prototype.hasOwnProperty.call(loaded, 'heartbeats'), false)
  assert.equal(loaded.contextFolderPath, contextDir)
})

test('saveSettings drops legacy skill installer metadata when rewriting settings', () => {
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
          harness: ['codex'],
          installPath: ['/tmp/.codex/skills/familiar']
        },
        familiarSkillInstalledVersion: '2.0.0'
      },
      null,
      2
    ),
    'utf-8'
  )

  saveSettings({ wizardCompleted: true }, { settingsDir })
  const loaded = loadSettings({ settingsDir })

  assert.equal(loaded.wizardCompleted, true)
  assert.equal(Object.prototype.hasOwnProperty.call(loaded, 'skillInstaller'), false)
  assert.equal(Object.prototype.hasOwnProperty.call(loaded, 'familiarSkillInstalledVersion'), false)
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
