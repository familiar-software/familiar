const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { test, expect } = require('playwright/test')
const { _electron: electron } = require('playwright')
const {
  JIMINY_BEHIND_THE_SCENES_DIR_NAME,
  STILLS_DIR_NAME
} = require('../../src/const')

const buildLaunchArgs = () => {
  const launchArgs = ['.']
  if (process.platform === 'linux' || process.env.CI) {
    launchArgs.push('--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage')
  }
  return launchArgs
}

const launchApp = async ({ contextPath, settingsDir, env = {} }) => {
  const appRoot = path.join(__dirname, '../..')
  return electron.launch({
    args: buildLaunchArgs(),
    cwd: appRoot,
    env: {
      ...process.env,
      JIMINY_E2E: '1',
      JIMINY_E2E_CONTEXT_PATH: contextPath,
      JIMINY_SETTINGS_DIR: settingsDir,
      ...env
    }
  })
}

const ensureRecordingPrereqs = async (window) => {
  if (process.platform !== 'darwin') {
    test.skip(true, 'Screen capture is only supported on macOS.')
  }

  const permission = await window.evaluate(() => window.jiminy.checkScreenRecordingPermission())
  if (permission?.permissionStatus !== 'granted') {
    test.skip(
      true,
      'Screen Recording permission not granted. Enable it in System Settings -> Privacy & Security -> Screen Recording.'
    )
  }
}

const setContextFolder = async (window) => {
  await window.getByRole('tab', { name: 'General' }).click()
  await window.locator('#context-folder-choose').click()
  await expect(window.locator('#context-folder-status')).toHaveText('Saved.')
}

const enableRecordingToggle = async (window) => {
  await window.getByRole('tab', { name: 'General' }).click()
  await window.locator('label[for="always-record-when-active"]').click({ force: true })
  await expect(window.locator('#always-record-when-active')).toBeChecked()
  await expect(window.locator('#always-record-when-active-status')).toHaveText('Saved.')
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

const getStillsRoot = (contextPath) =>
  path.join(contextPath, JIMINY_BEHIND_THE_SCENES_DIR_NAME, STILLS_DIR_NAME)

const findManifestPath = (stillsRoot) => {
  if (!fs.existsSync(stillsRoot)) {
    return ''
  }
  const sessions = fs.readdirSync(stillsRoot).filter((entry) => entry.startsWith('session-'))
  if (sessions.length === 0) {
    return ''
  }
  const candidate = path.join(stillsRoot, sessions[0], 'manifest.json')
  return fs.existsSync(candidate) ? candidate : ''
}

const waitForManifestPath = async (stillsRoot) => {
  let manifestPath = ''
  await expect.poll(() => {
    manifestPath = findManifestPath(stillsRoot)
    return manifestPath
  }).toBeTruthy()
  return manifestPath
}

const readManifest = (manifestPath) =>
  JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))

const waitForCaptureCount = async (manifestPath, minimumCount) => {
  await expect.poll(() => readManifest(manifestPath).captures.length).toBeGreaterThanOrEqual(minimumCount)
}

const waitForRecordingStopped = async (window) => {
  await expect
    .poll(async () => {
      const status = await window.evaluate(() => window.jiminy.getScreenStillsStatus())
      return status?.isRecording === true
    })
    .toBeFalsy()
}

const assertCaptureFiles = (manifestPath, manifest, options = {}) => {
  const requireNonEmptyCount = Number.isFinite(options.requireNonEmptyCount)
    ? options.requireNonEmptyCount
    : manifest.captures.length
  manifest.captures.forEach((capture, index) => {
    const capturePath = path.join(path.dirname(manifestPath), capture.file)
    expect(fs.existsSync(capturePath)).toBe(true)
    const size = fs.statSync(capturePath).size
    if (index < requireNonEmptyCount) {
      expect(size).toBeGreaterThan(0)
    }
  })
}

test('stills save captures to the stills folder', async () => {
  const contextPath = fs.mkdtempSync(path.join(os.tmpdir(), 'jiminy-context-stills-'))
  const settingsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jiminy-settings-e2e-'))

  const electronApp = await launchApp({ contextPath, settingsDir })

  try {
    const window = await electronApp.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    await ensureRecordingPrereqs(window)
    // Keep the app "active" so presence monitoring doesn't stop the session before
    // the first capture is written (common in CI / headless environments).
    await setIdleSeconds(electronApp, 0)
    await setContextFolder(window)
    await enableRecordingToggle(window)

    const recordingAction = window.locator('#sidebar-recording-action')
    await expect(recordingAction).toBeEnabled()

    await recordingAction.click()
    await expect(window.locator('#sidebar-recording-status')).toHaveText('Recording')
    await expect(recordingAction).toHaveText('Pause (10 min)')

    const stillsRoot = getStillsRoot(contextPath)
    const manifestPath = await waitForManifestPath(stillsRoot)
    await waitForCaptureCount(manifestPath, 1)

    await recordingAction.click()
    await expect(window.locator('#sidebar-recording-status')).toHaveText('Paused')
    await expect(recordingAction).toHaveText('Resume')

    const manifest = readManifest(manifestPath)
    expect(manifest.captures.length).toBeGreaterThan(0)
    assertCaptureFiles(manifestPath, manifest)
  } finally {
    await electronApp.close()
  }
})

test('stills start while recording is active', async () => {
  const contextPath = fs.mkdtempSync(path.join(os.tmpdir(), 'jiminy-context-stills-'))
  const settingsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jiminy-settings-e2e-'))

  const electronApp = await launchApp({ contextPath, settingsDir })

  try {
    const window = await electronApp.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    await ensureRecordingPrereqs(window)
    await setIdleSeconds(electronApp, 0)
    await setContextFolder(window)
    await enableRecordingToggle(window)

    const recordingAction = window.locator('#sidebar-recording-action')
    await expect(recordingAction).toBeEnabled()

    await expect(window.locator('#sidebar-recording-status')).toHaveText('Recording')
    await expect(recordingAction).toHaveText('Pause (10 min)')

    const stillsRoot = getStillsRoot(contextPath)
    const manifestPath = await waitForManifestPath(stillsRoot)
    await waitForCaptureCount(manifestPath, 1)

    await expect
      .poll(async () => {
        const status = await window.evaluate(() => window.jiminy.getScreenStillsStatus())
        return status?.isRecording === true
      })
      .toBeTruthy()

    const manifest = readManifest(manifestPath)
    expect(manifest.captures.length).toBeGreaterThan(0)
    assertCaptureFiles(manifestPath, manifest, { requireNonEmptyCount: 1 })

    await recordingAction.click()
    await expect(window.locator('#sidebar-recording-status')).toHaveText('Paused')
    await expect(recordingAction).toHaveText('Resume')
  } finally {
    await electronApp.close()
  }
})

test('stills capture repeatedly based on the interval', async () => {
  const intervalMs = 700
  const contextPath = fs.mkdtempSync(path.join(os.tmpdir(), 'jiminy-context-stills-'))
  const settingsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jiminy-settings-e2e-'))

  const electronApp = await launchApp({
    contextPath,
    settingsDir,
    env: {
      JIMINY_E2E_STILLS_INTERVAL_MS: String(intervalMs)
    }
  })

  try {
    const window = await electronApp.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    await ensureRecordingPrereqs(window)
    await setContextFolder(window)
    await enableRecordingToggle(window)

    const recordingAction = window.locator('#sidebar-recording-action')
    await expect(recordingAction).toBeEnabled()

    await recordingAction.click()
    await expect(window.locator('#sidebar-recording-status')).toHaveText('Recording')
    await expect(recordingAction).toHaveText('Pause (10 min)')

    const stillsRoot = getStillsRoot(contextPath)
    const manifestPath = await waitForManifestPath(stillsRoot)

    await waitForCaptureCount(manifestPath, 2)

    await recordingAction.click()
    await expect(window.locator('#sidebar-recording-status')).toHaveText('Paused')
    await expect(recordingAction).toHaveText('Resume')

    await waitForCaptureCount(manifestPath, 2)

    const manifest = readManifest(manifestPath)
    expect(manifest.captures.length).toBeGreaterThanOrEqual(2)
    assertCaptureFiles(manifestPath, manifest, { requireNonEmptyCount: 2 })
  } finally {
    await electronApp.close()
  }
})

test('stills stop and save the manifest when the user goes idle', async () => {
  const contextPath = fs.mkdtempSync(path.join(os.tmpdir(), 'jiminy-context-stills-'))
  const settingsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jiminy-settings-e2e-'))

  const electronApp = await launchApp({ contextPath, settingsDir })

  try {
    const window = await electronApp.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    await ensureRecordingPrereqs(window)
    // Prevent the system idle timer from stopping the session before we explicitly simulate idle.
    await setIdleSeconds(electronApp, 0)
    await setContextFolder(window)
    await enableRecordingToggle(window)

    const recordingAction = window.locator('#sidebar-recording-action')
    await expect(recordingAction).toBeEnabled()

    await recordingAction.click()
    await expect(window.locator('#sidebar-recording-status')).toHaveText('Recording')

    const stillsRoot = getStillsRoot(contextPath)
    const manifestPath = await waitForManifestPath(stillsRoot)
    await waitForCaptureCount(manifestPath, 1)

    await window.evaluate(() => window.jiminy.simulateStillsIdle({ idleSeconds: 9999 }))
    await waitForRecordingStopped(window)

    const manifest = readManifest(manifestPath)
    expect(manifest.stopReason).toBe('idle')
    expect(manifest.captures.length).toBeGreaterThanOrEqual(1)
    assertCaptureFiles(manifestPath, manifest)
  } finally {
    await electronApp.close()
  }
})

test('stills resume automatically after the pause window', async () => {
  const contextPath = fs.mkdtempSync(path.join(os.tmpdir(), 'jiminy-context-stills-'))
  const settingsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jiminy-settings-e2e-'))

  const electronApp = await launchApp({
    contextPath,
    settingsDir,
    env: {
      JIMINY_E2E_PAUSE_MS: '200'
    }
  })

  try {
    const window = await electronApp.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    await ensureRecordingPrereqs(window)
    await setIdleSeconds(electronApp, 0)
    await setContextFolder(window)
    await enableRecordingToggle(window)

    const recordingAction = window.locator('#sidebar-recording-action')
    await expect(recordingAction).toBeEnabled()

    await recordingAction.click()
    await expect(window.locator('#sidebar-recording-status')).toHaveText('Recording')

    await recordingAction.click()
    await expect(window.locator('#sidebar-recording-status')).toHaveText('Paused')
    await expect(recordingAction).toHaveText('Resume')

    await expect
      .poll(async () => {
        const status = await window.locator('#sidebar-recording-status').textContent()
        return status
      })
      .toBe('Recording')
    await expect(recordingAction).toHaveText('Pause (10 min)')
  } finally {
    await electronApp.close()
  }
})

test('stills pause and resume with the recording hotkey', async () => {
  const contextPath = fs.mkdtempSync(path.join(os.tmpdir(), 'jiminy-context-stills-'))
  const settingsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jiminy-settings-e2e-'))

  // Keep the default pause window so the dashboard poller (2s) can observe the paused state.
  // With a tiny pause window override (ex: 200ms) the app may auto-resume before the UI refreshes.
  const electronApp = await launchApp({ contextPath, settingsDir })

  try {
    const window = await electronApp.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    await ensureRecordingPrereqs(window)
    await setIdleSeconds(electronApp, 0)
    await setContextFolder(window)
    await enableRecordingToggle(window)

    const recordingAction = window.locator('#sidebar-recording-action')
    await expect(recordingAction).toBeEnabled()

    await recordingAction.click()
    await expect(window.locator('#sidebar-recording-status')).toHaveText('Recording')

    await window.evaluate(() => window.jiminy.simulateStillsHotkey())
    await expect
      .poll(async () => window.locator('#sidebar-recording-status').textContent())
      .toBe('Paused')
    await expect(recordingAction).toHaveText('Resume')

    await window.evaluate(() => window.jiminy.simulateStillsHotkey())
    await expect
      .poll(async () => window.locator('#sidebar-recording-status').textContent())
      .toBe('Recording')
    await expect(recordingAction).toHaveText('Pause (10 min)')
  } finally {
    await electronApp.close()
  }
})
