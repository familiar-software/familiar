const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { test, expect } = require('playwright/test')
const { _electron: electron } = require('playwright')

test('hotkeys save regular and option combinations', async () => {
  const appRoot = path.join(__dirname, '../..')
  const settingsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jiminy-settings-e2e-'))
  const launchArgs = ['.']
  if (process.platform === 'linux' || process.env.CI) {
    launchArgs.push('--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage')
  }

  const electronApp = await electron.launch({
    args: launchArgs,
    cwd: appRoot,
    env: {
      ...process.env,
      JIMINY_E2E: '1',
      JIMINY_SETTINGS_DIR: settingsDir
    }
  })

  try {
    const window = await electronApp.firstWindow()
    await window.waitForLoadState('domcontentloaded')
    await window.getByRole('tab', { name: 'Hotkeys' }).click()

    const recordingButton = window.locator('#recording-hotkey')

    await recordingButton.click()
    await recordingButton.dispatchEvent('keydown', {
      key: 'o',
      code: 'KeyO',
      metaKey: true,
      shiftKey: true
    })

    await window.locator('#hotkeys-save').click()
    await expect(window.locator('#hotkeys-status')).toHaveText(/Saved/)

    const settingsPath = path.join(settingsDir, 'settings.json')
    const stored = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
    expect(stored.recordingHotkey).toBe('CommandOrControl+Shift+O')
  } finally {
    await electronApp.close()
  }
})
