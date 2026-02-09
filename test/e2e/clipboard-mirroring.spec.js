const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { test, expect } = require('playwright/test')
const { _electron: electron } = require('playwright')

const { JIMINY_BEHIND_THE_SCENES_DIR_NAME, STILLS_DIR_NAME, STILLS_MARKDOWN_DIR_NAME } = require('../../src/const')

test.describe('clipboard mirroring', () => {
  test('mirrors clipboard text into the current stills-markdown session while recording', async () => {
    test.skip(process.platform !== 'darwin', 'Clipboard mirroring is tied to screen stills recording (macOS-only in E2E).')

    const appRoot = path.join(__dirname, '../..')
    const contextPath = fs.mkdtempSync(path.join(os.tmpdir(), 'jiminy-context-clipboard-'))
    const settingsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jiminy-settings-e2e-'))
    const launchArgs = ['.']

    const electronApp = await electron.launch({
      args: launchArgs,
      cwd: appRoot,
      env: {
        ...process.env,
        JIMINY_E2E: '1',
        JIMINY_E2E_CONTEXT_PATH: contextPath,
        JIMINY_SETTINGS_DIR: settingsDir
      }
    })

    try {
      await electronApp.evaluate(({ clipboard }) => {
        globalThis.__JIMINY_TEST_CLIPBOARD_TEXT = ''
        clipboard.readText = () => globalThis.__JIMINY_TEST_CLIPBOARD_TEXT
      })

      const window = await electronApp.firstWindow()
      await window.waitForLoadState('domcontentloaded')

      // Configure context folder.
      await window.getByRole('tab', { name: 'General' }).click()
      await window.locator('#context-folder-choose').click()
      await expect(window.locator('#context-folder-status')).toHaveText('Saved.')

      // Enable recording while active (required for manual start).
      const enableResult = await window.evaluate(() => window.jiminy.saveSettings({ alwaysRecordWhenActive: true }))
      if (!enableResult || enableResult.ok !== true) {
        test.skip(true, enableResult?.message || 'Unable to enable recording while active in this environment.')
      }

      const startResult = await window.evaluate(() => window.jiminy.startScreenStills())
      if (!startResult || startResult.ok !== true) {
        test.skip(true, startResult?.message || 'Unable to start screen stills in this environment.')
      }

      const stillsRoot = path.join(contextPath, JIMINY_BEHIND_THE_SCENES_DIR_NAME, STILLS_DIR_NAME)
      await expect.poll(() => {
        if (!fs.existsSync(stillsRoot)) return []
        return fs.readdirSync(stillsRoot).filter((name) => name.startsWith('session-'))
      }).toHaveLength(1)

      const [sessionId] = fs.readdirSync(stillsRoot).filter((name) => name.startsWith('session-'))
      const markdownSessionDir = path.join(
        contextPath,
        JIMINY_BEHIND_THE_SCENES_DIR_NAME,
        STILLS_MARKDOWN_DIR_NAME,
        sessionId
      )

      await electronApp.evaluate(() => {
        globalThis.__JIMINY_TEST_CLIPBOARD_TEXT = 'hello from clipboard'
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
})

