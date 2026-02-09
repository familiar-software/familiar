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
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jiminy-settings-'))
  const settingsDir = path.join(tempRoot, 'settings')
  const contextDir = path.join(tempRoot, 'context')
  fs.mkdirSync(contextDir)

  saveSettings({ contextFolderPath: contextDir }, { settingsDir })

  const loaded = loadSettings({ settingsDir })
  assert.equal(loaded.contextFolderPath, contextDir)
})

test('saveSettings persists stills_markdown_extractor.llm_provider api_key/provider and preserves context', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jiminy-settings-'))
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

test('saveSettings preserves stills_markdown_extractor.llm_provider api_key/provider when updating context path', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jiminy-settings-'))
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
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jiminy-settings-'))
  const missingPath = path.join(tempRoot, 'missing')

  const result = validateContextFolderPath(missingPath)
  assert.equal(result.ok, false)
  assert.equal(result.message, 'Selected path does not exist.')
})

test('validateContextFolderPath rejects file path', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jiminy-settings-'))
  const filePath = path.join(tempRoot, 'not-a-dir.txt')
  fs.writeFileSync(filePath, 'nope', 'utf-8')

  const result = validateContextFolderPath(filePath)
  assert.equal(result.ok, false)
  assert.equal(result.message, 'Selected path is not a directory.')
})

test('saveSettings persists recordingHotkey', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jiminy-settings-'))
  const settingsDir = path.join(tempRoot, 'settings')

  saveSettings({ recordingHotkey: 'Alt+R' }, { settingsDir })

  const loaded = loadSettings({ settingsDir })
  assert.equal(loaded.recordingHotkey, 'Alt+R')
})

test('saveSettings persists control/option hotkey combinations', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jiminy-settings-'))
  const settingsDir = path.join(tempRoot, 'settings')

  saveSettings(
    { recordingHotkey: 'CommandOrControl+Alt+Shift+R' },
    { settingsDir }
  )

  const loaded = loadSettings({ settingsDir })
  assert.equal(loaded.recordingHotkey, 'CommandOrControl+Alt+Shift+R')
})

test('saveSettings preserves hotkeys when updating other settings', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jiminy-settings-'))
  const settingsDir = path.join(tempRoot, 'settings')
  const contextDir = path.join(tempRoot, 'context')
  fs.mkdirSync(contextDir)

  saveSettings({ recordingHotkey: 'Alt+R' }, { settingsDir })
  saveSettings({ contextFolderPath: contextDir }, { settingsDir })

  const loaded = loadSettings({ settingsDir })
  assert.equal(loaded.recordingHotkey, 'Alt+R')
  assert.equal(loaded.contextFolderPath, contextDir)
})

test('saveSettings preserves other settings when updating hotkeys', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jiminy-settings-'))
  const settingsDir = path.join(tempRoot, 'settings')
  const contextDir = path.join(tempRoot, 'context')
  fs.mkdirSync(contextDir)

  saveSettings({ contextFolderPath: contextDir, llmProviderApiKey: 'key123', llmProviderName: 'openai' }, { settingsDir })
  saveSettings({ recordingHotkey: 'CommandOrControl+Alt+X' }, { settingsDir })

  const loaded = loadSettings({ settingsDir })
  assert.equal(loaded.recordingHotkey, 'CommandOrControl+Alt+X')
  assert.equal(loaded.contextFolderPath, contextDir)
  assert.equal(loaded.stills_markdown_extractor?.llm_provider?.api_key, 'key123')
  assert.equal(loaded.stills_markdown_extractor?.llm_provider?.provider, 'openai')
})

test('saveSettings preserves updateLastCheckedAt when updating other settings', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jiminy-settings-'))
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
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jiminy-settings-'))
  const settingsDir = path.join(tempRoot, 'settings')

  saveSettings({ alwaysRecordWhenActive: true }, { settingsDir })

  const loaded = loadSettings({ settingsDir })
  assert.equal(loaded.alwaysRecordWhenActive, true)
})

test('saveSettings preserves alwaysRecordWhenActive when updating other settings', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jiminy-settings-'))
  const settingsDir = path.join(tempRoot, 'settings')
  const contextDir = path.join(tempRoot, 'context')
  fs.mkdirSync(contextDir)

  saveSettings({ alwaysRecordWhenActive: true }, { settingsDir })
  saveSettings({ contextFolderPath: contextDir }, { settingsDir })

  const loaded = loadSettings({ settingsDir })
  assert.equal(loaded.alwaysRecordWhenActive, true)
  assert.equal(loaded.contextFolderPath, contextDir)
})

test('saveSettings persists stills_markdown_extractor type', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jiminy-settings-'))
  const settingsDir = path.join(tempRoot, 'settings')

  saveSettings({ stillsMarkdownExtractorType: 'apple_vision_ocr' }, { settingsDir })

  const loaded = loadSettings({ settingsDir })
  assert.equal(loaded.stills_markdown_extractor?.type, 'apple_vision_ocr')
  assert.equal(loaded.stills_markdown_extractor?.level, 'accurate')
})

test('saveSettings preserves stills_markdown_extractor when updating other settings', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jiminy-settings-'))
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
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'jiminy-settings-'))
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
