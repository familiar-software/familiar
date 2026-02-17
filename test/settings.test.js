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

test('saveSettings persists stills_markdown_extractor.llm_provider api_key/provider and preserves context', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-settings-'))
  const settingsDir = path.join(tempRoot, 'settings')
  const contextDir = path.join(tempRoot, 'context')
  fs.mkdirSync(contextDir)

  saveSettings({ contextFolderPath: contextDir }, { settingsDir })
  saveSettings({ llmProviderApiKey: 'test-key', llmProviderName: 'gemini' }, { settingsDir })

  const loaded = loadSettings({ settingsDir })
  assert.equal(loaded.contextFolderPath, contextDir)
  assert.equal(loaded.stills_markdown_extractor?.llm_provider?.provider, 'gemini')
  assert.equal(loaded.stills_markdown_extractor?.llm_provider?.api_key, 'test-key')
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

test('saveSettings preserves stills_markdown_extractor.llm_provider api_key/provider when updating context path', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-settings-'))
  const settingsDir = path.join(tempRoot, 'settings')
  const contextDir = path.join(tempRoot, 'context')
  fs.mkdirSync(contextDir)

  saveSettings({ llmProviderApiKey: 'keep-me', llmProviderName: 'openai' }, { settingsDir })
  saveSettings({ contextFolderPath: contextDir }, { settingsDir })

  const loaded = loadSettings({ settingsDir })
  assert.equal(loaded.contextFolderPath, contextDir)
  assert.equal(loaded.stills_markdown_extractor?.llm_provider?.provider, 'openai')
  assert.equal(loaded.stills_markdown_extractor?.llm_provider?.api_key, 'keep-me')
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

test('saveSettings persists alwaysRecordWhenActive', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-settings-'))
  const settingsDir = path.join(tempRoot, 'settings')

  saveSettings({ alwaysRecordWhenActive: true }, { settingsDir })

  const loaded = loadSettings({ settingsDir })
  assert.equal(loaded.alwaysRecordWhenActive, true)
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

test('saveSettings persists stills_markdown_extractor type', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-settings-'))
  const settingsDir = path.join(tempRoot, 'settings')

  saveSettings({ stillsMarkdownExtractorType: 'apple_vision_ocr' }, { settingsDir })

  const loaded = loadSettings({ settingsDir })
  assert.equal(loaded.stills_markdown_extractor?.type, 'apple_vision_ocr')
  assert.equal(loaded.stills_markdown_extractor?.level, 'accurate')
})

test('saveSettings preserves stills_markdown_extractor when updating other settings', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-settings-'))
  const settingsDir = path.join(tempRoot, 'settings')
  const contextDir = path.join(tempRoot, 'context')
  fs.mkdirSync(contextDir)

  saveSettings({ stillsMarkdownExtractorType: 'apple_vision_ocr' }, { settingsDir })
  saveSettings({ contextFolderPath: contextDir }, { settingsDir })

  const loaded = loadSettings({ settingsDir })
  assert.equal(loaded.contextFolderPath, contextDir)
  assert.equal(loaded.stills_markdown_extractor?.type, 'apple_vision_ocr')
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
