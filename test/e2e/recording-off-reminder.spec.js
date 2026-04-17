const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { test, expect } = require('playwright/test')
const { _electron: electron } = require('playwright')
const { confirmMoveContextFolder } = require('./helpers')

const REMINDER_DELAY_MS = 500

const buildLaunchArgs = () => {
  const launchArgs = ['.']
  if (process.platform === 'linux') {
    launchArgs.push('--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage')
  }
  return launchArgs
}

const launchApp = async ({ contextPath, sourceContextPath, settingsDir, env = {} }) => {
  const appRoot = path.join(__dirname, '../..')
  const resolvedSourceContextPath = sourceContextPath ? path.resolve(sourceContextPath) : ''
  fs.writeFileSync(
    path.join(settingsDir, 'settings.json'),
    JSON.stringify(
      {
        wizardCompleted: true,
        ...(resolvedSourceContextPath ? { contextFolderPath: resolvedSourceContextPath } : {})
      },
      null,
      2
    )
  )
  return electron.launch({
    args: buildLaunchArgs(),
    cwd: appRoot,
    env: {
      ...process.env,
      FAMILIAR_E2E: '1',
      FAMILIAR_E2E_CONTEXT_PATH: contextPath,
      FAMILIAR_SETTINGS_DIR: settingsDir,
      ...env
    }
  })
}

const setIdleSeconds = async (electronApp, idleSeconds) => {
  await electronApp.evaluate((seconds) => {
    const { powerMonitor } = process.mainModule.require('electron')
    Object.defineProperty(powerMonitor, 'getSystemIdleTime', {
      value: () => seconds,
      configurable: true
    })
    return powerMonitor.getSystemIdleTime()
  }, idleSeconds)
}

const ensureRecordingPrereqs = async (window) => {
  const permission = await window.evaluate(() => window.familiar.checkScreenRecordingPermission())
  expect(permission?.permissionStatus).toBe('granted')
}

const setContextFolder = async (window) => {
  await window.getByRole('tab', { name: 'Storage' }).click()
  const confirmDialog = confirmMoveContextFolder(window)
  await window.locator('#recording-move-folder').click()
  await confirmDialog
  await expect(window.locator('#context-folder-status')).toHaveText('Saved.')
}

const enableRecordingToggle = async (window) => {
  await window.getByRole('tab', { name: 'Capture' }).click()
  const result = await window.evaluate(() => window.familiar.saveSettings({ alwaysRecordWhenActive: true }))
  expect(result?.ok).toBe(true)
  await expect
    .poll(async () => {
      const settings = await window.evaluate(() => window.familiar.getSettings())
      return settings?.alwaysRecordWhenActive
    })
    .toBe(true)
}

const disableRecordingToggle = async (window) => {
  await window.getByRole('tab', { name: 'Capture' }).click()
  await expect
    .poll(async () => {
      const settings = await window.evaluate(() => window.familiar.getSettings())
      return settings?.alwaysRecordWhenActive
    })
    .toBe(true)
  const result = await window.evaluate(() => window.familiar.saveSettings({ alwaysRecordWhenActive: false }))
  expect(result?.ok).toBe(true)
  await expect
    .poll(async () => {
      const settings = await window.evaluate(() => window.familiar.getSettings())
      return settings?.alwaysRecordWhenActive
    })
    .toBe(false)
}

const clearToastEvents = async (window) => {
  const response = await window.evaluate(() => window.familiar.getToastEventsForE2E({ clear: true }))
  return response
}

const readToastEvents = async (window) => {
  return window.evaluate(() => window.familiar.getToastEventsForE2E())
}

test('recording-off reminder shows toast after e2e-configured delay', async () => {
  const sourceContextPath = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-context-source-'))
  fs.mkdirSync(path.join(sourceContextPath, 'familiar'), { recursive: true })
  const contextPath = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-context-recording-off-reminder-'))
  const settingsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-settings-e2e-'))

  const electronApp = await launchApp({
    contextPath,
    sourceContextPath,
    settingsDir,
    env: {
      FAMILIAR_RECORDING_OFF_REMINDER_DELAY_MS: String(REMINDER_DELAY_MS)
    }
  })

  try {
    const window = await electronApp.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    await ensureRecordingPrereqs(window)
    await setIdleSeconds(electronApp, 0)
    await setContextFolder(window)
    await enableRecordingToggle(window)
    await clearToastEvents(window)
    await expect
      .poll(async () => {
        const status = await window.evaluate(() => window.familiar.getScreenStillsStatus())
        return status?.enabled === true && status?.state
      }, { timeout: 4000 })
      .toBeTruthy()

    const countdownStartMs = Date.now()
    await disableRecordingToggle(window)
    await expect
      .poll(async () => {
        const status = await window.evaluate(() => window.familiar.getScreenStillsStatus())
        return status?.enabled
      }, { timeout: 4000 })
      .toBe(false)

    await expect
      .poll(
        async () => {
          const { ok, events } = await readToastEvents(window)
          if (!ok || !Array.isArray(events) || events.length === 0) {
            return 0
          }
          return events[events.length - 1].at || 0
        },
        { timeout: 2000, interval: 50 }
      )
      .toBeGreaterThan(0)

    const { ok, events } = await readToastEvents(window)
    const latestToast = ok && Array.isArray(events) && events.length > 0 ? events[events.length - 1] : null
    expect(latestToast).not.toBeNull()
    expect(latestToast.at).toBeGreaterThanOrEqual(countdownStartMs + REMINDER_DELAY_MS - 100)
    expect(latestToast.at).toBeLessThan(countdownStartMs + REMINDER_DELAY_MS + 1200)
    expect(latestToast.title).toBe('Recording is off')
  } finally {
    await electronApp.close()
  }
})
