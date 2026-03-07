const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { test, expect } = require('playwright/test')
const { _electron: electron } = require('playwright')
const { confirmMoveContextFolder } = require('./helpers')

const { FAMILIAR_BEHIND_THE_SCENES_DIR_NAME, STILLS_DIR_NAME, STILLS_MARKDOWN_DIR_NAME } = require('../../src/const')

test.describe('clipboard mirroring', () => {
  test('mirrors clipboard text into the current stills-markdown session while recording', async () => {
    const appRoot = path.join(__dirname, '../..')
    const sourceContextPath = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-context-source-'))
    fs.mkdirSync(path.join(sourceContextPath, 'familiar'), { recursive: true })
    const contextPath = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-context-clipboard-'))
    const settingsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-settings-e2e-'))
    fs.writeFileSync(
      path.join(settingsDir, 'settings.json'),
      JSON.stringify(
        {
          wizardCompleted: true,
          contextFolderPath: sourceContextPath
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
      const confirmDialog = confirmMoveContextFolder(window)
      await window.locator('#recording-move-folder').click()
      await confirmDialog
      await expect(window.locator('#context-folder-status')).toHaveText('Saved.')

      // Enable recording while active (required for manual start).
      const enableResult = await window.evaluate(() => window.familiar.saveSettings({ alwaysRecordWhenActive: true }))
      expect(enableResult?.ok).toBe(true)

      const startResult = await window.evaluate(() => window.familiar.startScreenStills())
      expect(startResult?.ok).toBe(true)

      const stillsRoot = path.join(contextPath, FAMILIAR_BEHIND_THE_SCENES_DIR_NAME, STILLS_DIR_NAME)
      await expect
        .poll(() => {
          if (!fs.existsSync(stillsRoot)) return []
          return fs.readdirSync(stillsRoot).filter((name) => name.startsWith('session-'))
        }, { timeout: 15000 })
        .toHaveLength(1)

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

      await expect
        .poll(() => {
          if (!fs.existsSync(markdownSessionDir)) return []
          return fs.readdirSync(markdownSessionDir).filter((name) => name.endsWith('.clipboard.txt'))
        }, { timeout: 15000 })
        .toHaveLength(1)

      const [clipboardFile] = fs.readdirSync(markdownSessionDir).filter((name) => name.endsWith('.clipboard.txt'))
      const contents = fs.readFileSync(path.join(markdownSessionDir, clipboardFile), 'utf-8')
      expect(contents).toBe('hello from clipboard')
    } finally {
      await electronApp.close()
    }
  })

  test('does not mirror one-word clipboard text while recording', async () => {
    const appRoot = path.join(__dirname, '../..')
    const sourceContextPath = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-context-source-'))
    fs.mkdirSync(path.join(sourceContextPath, 'familiar'), { recursive: true })
    const contextPath = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-context-clipboard-single-word-'))
    const settingsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-settings-e2e-'))
    fs.writeFileSync(
      path.join(settingsDir, 'settings.json'),
      JSON.stringify(
        {
          wizardCompleted: true,
          contextFolderPath: sourceContextPath
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
      const confirmDialog = confirmMoveContextFolder(window)
      await window.locator('#recording-move-folder').click()
      await confirmDialog
      await expect(window.locator('#context-folder-status')).toHaveText('Saved.')

      const enableResult = await window.evaluate(() => window.familiar.saveSettings({ alwaysRecordWhenActive: true }))
      expect(enableResult?.ok).toBe(true)

      const startResult = await window.evaluate(() => window.familiar.startScreenStills())
      expect(startResult?.ok).toBe(true)

      const stillsRoot = path.join(contextPath, FAMILIAR_BEHIND_THE_SCENES_DIR_NAME, STILLS_DIR_NAME)
      await expect
        .poll(() => {
          if (!fs.existsSync(stillsRoot)) return []
          return fs.readdirSync(stillsRoot).filter((name) => name.startsWith('session-'))
        }, { timeout: 15000 })
        .toHaveLength(1)

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
})
