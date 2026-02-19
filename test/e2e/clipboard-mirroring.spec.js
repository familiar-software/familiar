const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { test, expect } = require('playwright/test')
const { _electron: electron } = require('playwright')

const { FAMILIAR_BEHIND_THE_SCENES_DIR_NAME, STILLS_DIR_NAME, STILLS_MARKDOWN_DIR_NAME } = require('../../src/const')

test.describe('clipboard mirroring', () => {
  test('mirrors clipboard text into the current stills-markdown session while recording', async () => {
    const appRoot = path.join(__dirname, '../..')
    const contextPath = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-context-clipboard-'))
    const settingsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-settings-e2e-'))
    fs.writeFileSync(
      path.join(settingsDir, 'settings.json'),
      JSON.stringify(
        {
          wizardCompleted: true
        },
        null,
        2
      )
    )
    const launchArgs = ['.']

    const electronApp = await electron.launch({
      args: launchArgs,
      cwd: appRoot,
      env: {
        ...process.env,
        FAMILIAR_E2E: '1',
        FAMILIAR_E2E_CONTEXT_PATH: contextPath,
        FAMILIAR_SETTINGS_DIR: settingsDir
      }
    })

    try {
      await electronApp.evaluate(({ clipboard }) => {
        globalThis.__FAMILIAR_TEST_CLIPBOARD_TEXT = ''
        clipboard.readText = () => globalThis.__FAMILIAR_TEST_CLIPBOARD_TEXT
      })

      const window = await electronApp.firstWindow()
      await window.waitForLoadState('domcontentloaded')

      // Configure context folder.
      await window.getByRole('tab', { name: 'Storage' }).click()
      await window.locator('#context-folder-choose').click()
      await expect(window.locator('#context-folder-status')).toHaveText('Saved.')

      // Enable recording while active (required for manual start).
      const enableResult = await window.evaluate(() => window.familiar.saveSettings({ alwaysRecordWhenActive: true }))
      expect(enableResult?.ok).toBe(true)

      const startResult = await window.evaluate(() => window.familiar.startScreenStills())
      expect(startResult?.ok).toBe(true)

      const stillsRoot = path.join(contextPath, FAMILIAR_BEHIND_THE_SCENES_DIR_NAME, STILLS_DIR_NAME)
      await expect.poll(() => {
        if (!fs.existsSync(stillsRoot)) return []
        return fs.readdirSync(stillsRoot).filter((name) => name.startsWith('session-'))
      }).toHaveLength(1)

      const [sessionId] = fs.readdirSync(stillsRoot).filter((name) => name.startsWith('session-'))
      const markdownSessionDir = path.join(
        contextPath,
        FAMILIAR_BEHIND_THE_SCENES_DIR_NAME,
        STILLS_MARKDOWN_DIR_NAME,
        sessionId
      )

      await electronApp.evaluate(() => {
        globalThis.__FAMILIAR_TEST_CLIPBOARD_TEXT = 'hello from clipboard'
      })

      await expect.poll(() => {
        if (!fs.existsSync(markdownSessionDir)) return []
        return fs.readdirSync(markdownSessionDir).filter((name) => name.endsWith('.clipboard.txt'))
      }).toHaveLength(1)

      const [clipboardFile] = fs.readdirSync(markdownSessionDir).filter((name) => name.endsWith('.clipboard.txt'))
      const contents = fs.readFileSync(path.join(markdownSessionDir, clipboardFile), 'utf-8')
      expect(contents).toBe('hello from clipboard')
    } finally {
      await electronApp.close()
    }
  })

  test('does not mirror one-word clipboard text while recording', async () => {
    const appRoot = path.join(__dirname, '../..')
    const contextPath = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-context-clipboard-single-word-'))
    const settingsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-settings-e2e-'))
    fs.writeFileSync(
      path.join(settingsDir, 'settings.json'),
      JSON.stringify(
        {
          wizardCompleted: true
        },
        null,
        2
      )
    )
    const launchArgs = ['.']

    const electronApp = await electron.launch({
      args: launchArgs,
      cwd: appRoot,
      env: {
        ...process.env,
        FAMILIAR_E2E: '1',
        FAMILIAR_E2E_CONTEXT_PATH: contextPath,
        FAMILIAR_SETTINGS_DIR: settingsDir
      }
    })

    try {
      await electronApp.evaluate(({ clipboard }) => {
        globalThis.__FAMILIAR_TEST_CLIPBOARD_TEXT = ''
        clipboard.readText = () => globalThis.__FAMILIAR_TEST_CLIPBOARD_TEXT
      })

      const window = await electronApp.firstWindow()
      await window.waitForLoadState('domcontentloaded')

      await window.getByRole('tab', { name: 'Storage' }).click()
      await window.locator('#context-folder-choose').click()
      await expect(window.locator('#context-folder-status')).toHaveText('Saved.')

      const enableResult = await window.evaluate(() => window.familiar.saveSettings({ alwaysRecordWhenActive: true }))
      expect(enableResult?.ok).toBe(true)

      const startResult = await window.evaluate(() => window.familiar.startScreenStills())
      expect(startResult?.ok).toBe(true)

      const stillsRoot = path.join(contextPath, FAMILIAR_BEHIND_THE_SCENES_DIR_NAME, STILLS_DIR_NAME)
      await expect.poll(() => {
        if (!fs.existsSync(stillsRoot)) return []
        return fs.readdirSync(stillsRoot).filter((name) => name.startsWith('session-'))
      }).toHaveLength(1)

      const [sessionId] = fs.readdirSync(stillsRoot).filter((name) => name.startsWith('session-'))
      const markdownSessionDir = path.join(
        contextPath,
        FAMILIAR_BEHIND_THE_SCENES_DIR_NAME,
        STILLS_MARKDOWN_DIR_NAME,
        sessionId
      )

      await electronApp.evaluate(() => {
        globalThis.__FAMILIAR_TEST_CLIPBOARD_TEXT = 'password123'
      })

      await window.waitForTimeout(1300)

      const mirroredFiles = fs.existsSync(markdownSessionDir)
        ? fs.readdirSync(markdownSessionDir).filter((name) => name.endsWith('.clipboard.txt'))
        : []
      expect(mirroredFiles).toHaveLength(0)
    } finally {
      await electronApp.close()
    }
  })

  test('mirrors clipboard image into stills session and writes .clipboard markdown output', async () => {
    const appRoot = path.join(__dirname, '../..')
    const contextPath = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-context-clipboard-image-'))
    const settingsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-settings-e2e-'))
    fs.writeFileSync(
      path.join(settingsDir, 'settings.json'),
      JSON.stringify(
        {
          wizardCompleted: true
        },
        null,
        2
      )
    )

    const electronApp = await electron.launch({
      args: ['.'],
      cwd: appRoot,
      env: {
        ...process.env,
        FAMILIAR_E2E: '1',
        FAMILIAR_E2E_CONTEXT_PATH: contextPath,
        FAMILIAR_SETTINGS_DIR: settingsDir,
        FAMILIAR_LLM_MOCK: '1',
        FAMILIAR_LLM_MOCK_TEXT: 'mock-image-markdown'
      }
    })

    try {
      await electronApp.evaluate(({ clipboard }) => {
        globalThis.__FAMILIAR_TEST_CLIPBOARD_TEXT = ''
        globalThis.__FAMILIAR_TEST_CLIPBOARD_IMAGE = null
        clipboard.readText = () => globalThis.__FAMILIAR_TEST_CLIPBOARD_TEXT
        clipboard.readImage = () => ({
          isEmpty: () => !globalThis.__FAMILIAR_TEST_CLIPBOARD_IMAGE,
          toPNG: () => globalThis.__FAMILIAR_TEST_CLIPBOARD_IMAGE || Buffer.alloc(0)
        })
      })

      const window = await electronApp.firstWindow()
      await window.waitForLoadState('domcontentloaded')

      await window.getByRole('tab', { name: 'Storage' }).click()
      await window.locator('#context-folder-choose').click()
      await expect(window.locator('#context-folder-status')).toHaveText('Saved.')

      const extractorResult = await window.evaluate(() =>
        window.familiar.saveSettings({
          stillsMarkdownExtractorType: 'llm',
          llmProviderName: 'openai',
          alwaysRecordWhenActive: true
        })
      )
      expect(extractorResult?.ok).toBe(true)

      const startResult = await window.evaluate(() => window.familiar.startScreenStills())
      expect(startResult?.ok).toBe(true)

      const stillsRoot = path.join(contextPath, FAMILIAR_BEHIND_THE_SCENES_DIR_NAME, STILLS_DIR_NAME)
      await expect.poll(() => {
        if (!fs.existsSync(stillsRoot)) return []
        return fs.readdirSync(stillsRoot).filter((name) => name.startsWith('session-'))
      }).toHaveLength(1)

      const [sessionId] = fs.readdirSync(stillsRoot).filter((name) => name.startsWith('session-'))
      const stillsSessionDir = path.join(stillsRoot, sessionId)
      const markdownSessionDir = path.join(
        contextPath,
        FAMILIAR_BEHIND_THE_SCENES_DIR_NAME,
        STILLS_MARKDOWN_DIR_NAME,
        sessionId
      )

      await electronApp.evaluate(() => {
        globalThis.__FAMILIAR_TEST_CLIPBOARD_IMAGE = Buffer.from('clipboard-image-e2e')
      })

      await expect.poll(() => {
        if (!fs.existsSync(stillsSessionDir)) return []
        return fs.readdirSync(stillsSessionDir).filter((name) => name.endsWith('.clipboard.png'))
      }).toHaveLength(1)

      await expect.poll(() => {
        if (!fs.existsSync(markdownSessionDir)) return []
        return fs.readdirSync(markdownSessionDir).filter((name) => name.endsWith('.clipboard.md'))
      }).toHaveLength(1)

      const [markdownFile] = fs.readdirSync(markdownSessionDir).filter((name) => name.endsWith('.clipboard.md'))
      const markdownContents = fs.readFileSync(path.join(markdownSessionDir, markdownFile), 'utf-8')
      expect(markdownContents).toContain('mock-image-markdown')
    } finally {
      await electronApp.close()
    }
  })
})
