const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { test, expect } = require('playwright/test')
const { _electron: electron } = require('playwright')

const { getSettingsWindow } = require('./helpers')

test('audio settings explains unavailable automatic system-audio capture', async () => {
  const appRoot = path.join(__dirname, '../..')
  const contextPath = path.join(appRoot, 'test', 'fixtures', 'context')
  const settingsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-settings-audio-e2e-'))
  const unavailableReason = 'Screen Recording access is required for automatic capture.'
  fs.writeFileSync(
    path.join(settingsDir, 'settings.json'),
    JSON.stringify({ wizardCompleted: true })
  )
  const launchArgs = ['.', '--open-settings']
  if (process.platform === 'linux') {
    launchArgs.push('--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage')
  }

  const electronApp = await electron.launch({
    args: launchArgs,
    cwd: appRoot,
    env: {
      ...process.env,
      FAMILIAR_E2E: '1',
      FAMILIAR_E2E_CONTEXT_PATH: contextPath,
      FAMILIAR_SETTINGS_DIR: settingsDir,
      FAMILIAR_E2E_SPEECH_HELPER_PATH: path.join(__dirname, 'fake-speech-helper.js'),
      FAMILIAR_E2E_SYSTEM_AUDIO_UNAVAILABLE_REASON: unavailableReason
    }
  })

  try {
    const window = await getSettingsWindow(electronApp)
    await window.waitForLoadState('domcontentloaded')
    await window.getByRole('tab', { name: 'Audio' }).click()

    await expect(window.locator('#audio-automatic-source')).toHaveText('Automatic')
    await expect(window.locator('#audio-automatic-source-status')).toHaveText(
      unavailableReason
    )
    await expect(window.locator('#audio-capture-profile')).toHaveCount(0)
  } finally {
    await electronApp.close()
  }
})
