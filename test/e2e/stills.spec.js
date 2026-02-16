const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { test, expect } = require('playwright/test')
const { _electron: electron } = require('playwright')
const {
  FAMILIAR_BEHIND_THE_SCENES_DIR_NAME,
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

const ensureRecordingPrereqs = async (window) => {
  const permission = await window.evaluate(() => window.familiar.checkScreenRecordingPermission())
  expect(permission?.permissionStatus).toBe('granted')
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
  path.join(contextPath, FAMILIAR_BEHIND_THE_SCENES_DIR_NAME, STILLS_DIR_NAME)

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

const waitForManifestPath = async (stillsRoot, options = {}) => {
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : 5000
  let manifestPath = ''
  await expect
    .poll(
      () => {
        manifestPath = findManifestPath(stillsRoot)
        return manifestPath
      },
      { timeout: timeoutMs }
    )
    .toBeTruthy()
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
      const status = await window.evaluate(() => window.familiar.getScreenStillsStatus())
      return status?.isRecording === true
    })
    .toBeFalsy()
}

const waitForRecordingState = async (window, expectedState, options = {}) => {
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : 5000
  await expect
    .poll(async () => {
      const status = await window.evaluate(() => window.familiar.getScreenStillsStatus())
      return status?.state || ''
    }, { timeout: timeoutMs })
    .toBe(expectedState)
}

const assertImageHeader = (capturePath) => {
  const header = fs.readFileSync(capturePath).slice(0, 12)
  expect(header.length).toBeGreaterThanOrEqual(12)

  const magic = header.slice(0, 4).toString('ascii')
  if (magic === 'fami') {
    return
  }

  expect(magic).toBe('RIFF')
  expect(header.slice(8, 12).toString('ascii')).toBe('WEBP')
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
      assertImageHeader(capturePath)
    }
  })
}

const setWindowBackdrop = async (window, options = {}) => {
  const backgroundColor = options.backgroundColor || '#000000'
  const marker = typeof options.marker === 'string' ? options.marker : ''
  await window.evaluate(
    ({ backgroundColor, marker }) => {
      const overlayId = '__familiar-e2e-capture-marker'
      let overlay = document.getElementById(overlayId)
      if (!overlay) {
        overlay = document.createElement('div')
        overlay.id = overlayId
        overlay.style.position = 'fixed'
        overlay.style.inset = '0'
        overlay.style.display = 'flex'
        overlay.style.alignItems = 'center'
        overlay.style.justifyContent = 'center'
        overlay.style.pointerEvents = 'none'
        overlay.style.zIndex = '999999'
        overlay.style.color = '#ffffff'
        overlay.style.fontSize = '200px'
        overlay.style.fontWeight = 'bold'
        overlay.style.textShadow = '0 0 20px rgba(0,0,0,0.5)'
        document.body.appendChild(overlay)
      }

      overlay.style.background = backgroundColor
      overlay.textContent = marker
    },
    { backgroundColor, marker }
  )
}

const readCaptureBuffer = (manifestPath, capture) =>
  fs.readFileSync(path.join(path.dirname(manifestPath), capture.file))

test('stills save captures to the stills folder', async () => {
  const contextPath = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-context-stills-'))
  const settingsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-settings-e2e-'))

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
    await expect(window.locator('#sidebar-recording-status')).toHaveText('Capturing')
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

if (process.platform === 'darwin') {
  test('stills capture output changes when screen content changes', async () => {
    const intervalMs = 500
    const contextPath = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-context-stills-real-'))
    const settingsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-settings-e2e-'))

    const electronApp = await launchApp({
      contextPath,
      settingsDir,
      env: {
        FAMILIAR_E2E_FAKE_SCREEN_CAPTURE: '0',
        FAMILIAR_E2E_STILLS_INTERVAL_MS: String(intervalMs)
      }
    })

    try {
      const window = await electronApp.firstWindow()
      await window.waitForLoadState('domcontentloaded')

      await ensureRecordingPrereqs(window)
      await setIdleSeconds(electronApp, 0)
      await setContextFolder(window)
      await enableRecordingToggle(window)
      await setWindowBackdrop(window, { backgroundColor: '#111111', marker: 'A' })

      const recordingAction = window.locator('#sidebar-recording-action')
      await expect(recordingAction).toBeEnabled()
      await recordingAction.click()
      await expect(window.locator('#sidebar-recording-status')).toHaveText('Capturing')

      const stillsRoot = getStillsRoot(contextPath)
      const manifestPath = await waitForManifestPath(stillsRoot)
      await waitForCaptureCount(manifestPath, 1)

      await setWindowBackdrop(window, { backgroundColor: '#ef3b3b', marker: 'B' })
      await waitForCaptureCount(manifestPath, 2)

      const manifest = readManifest(manifestPath)
      expect(manifest.captures.length).toBeGreaterThanOrEqual(2)

      const firstCapture = readCaptureBuffer(manifestPath, manifest.captures[0])
      const secondCapture = readCaptureBuffer(manifestPath, manifest.captures[1])
      assertImageHeader(path.join(path.dirname(manifestPath), manifest.captures[0].file))
      assertImageHeader(path.join(path.dirname(manifestPath), manifest.captures[1].file))
      expect(firstCapture.equals(secondCapture)).toBe(false)
      expect(firstCapture.length).toBeGreaterThan(0)
      expect(secondCapture.length).toBeGreaterThan(0)

      await recordingAction.click()
      await expect(window.locator('#sidebar-recording-status')).toHaveText('Paused')
      await expect(recordingAction).toHaveText('Resume')
    } finally {
      await electronApp.close()
    }
  })
}

test('stills capture fails when real capture thumbnail payload is corrupted', async () => {
  const contextPath = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-context-stills-real-'))
  const settingsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-settings-e2e-'))

  const electronApp = await launchApp({
    contextPath,
    settingsDir,
    env: {
      FAMILIAR_E2E_FAKE_SCREEN_CAPTURE: '0',
      FAMILIAR_E2E_CORRUPT_THUMBNAIL_DATA_URL: '1',
      FAMILIAR_E2E_STILLS_INTERVAL_MS: '600'
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
    const stillsRoot = getStillsRoot(contextPath)
    await waitForRecordingState(window, 'armed')
    let manifestPath = ''
    try {
      manifestPath = await waitForManifestPath(stillsRoot, { timeoutMs: 1200 })
    } catch (_error) {
      manifestPath = ''
    }
    if (manifestPath) {
      const manifest = readManifest(manifestPath)
      expect(manifest.captures.length).toBe(0)
      expect(manifest.stopReason).toBe('start_failed')
    }

    await expect(window.locator('#sidebar-recording-status')).toHaveText('Idle')
  } finally {
    await electronApp.close()
  }
})

test('stills start while recording is active', async () => {
  const contextPath = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-context-stills-'))
  const settingsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-settings-e2e-'))

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

    await expect(window.locator('#sidebar-recording-status')).toHaveText('Capturing')
    await expect(recordingAction).toHaveText('Pause (10 min)')

    const stillsRoot = getStillsRoot(contextPath)
    const manifestPath = await waitForManifestPath(stillsRoot)
    await waitForCaptureCount(manifestPath, 1)

    await expect
      .poll(async () => {
        const status = await window.evaluate(() => window.familiar.getScreenStillsStatus())
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
  const contextPath = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-context-stills-'))
  const settingsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-settings-e2e-'))

  const electronApp = await launchApp({
    contextPath,
    settingsDir,
    env: {
      FAMILIAR_E2E_STILLS_INTERVAL_MS: String(intervalMs)
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
    await expect(window.locator('#sidebar-recording-status')).toHaveText('Capturing')
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
  const contextPath = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-context-stills-'))
  const settingsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-settings-e2e-'))

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
    await expect(window.locator('#sidebar-recording-status')).toHaveText('Capturing')

    const stillsRoot = getStillsRoot(contextPath)
    const manifestPath = await waitForManifestPath(stillsRoot)
    await waitForCaptureCount(manifestPath, 1)

    await window.evaluate(() => window.familiar.simulateStillsIdle({ idleSeconds: 9999 }))
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
  const contextPath = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-context-stills-'))
  const settingsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-settings-e2e-'))

  const electronApp = await launchApp({
    contextPath,
    settingsDir,
    env: {
      FAMILIAR_E2E_PAUSE_MS: '200'
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
    await expect(window.locator('#sidebar-recording-status')).toHaveText('Capturing')

    await recordingAction.click()
    await expect(window.locator('#sidebar-recording-status')).toHaveText('Paused')
    await expect(recordingAction).toHaveText('Resume')

    await expect
      .poll(async () => {
        const status = await window.locator('#sidebar-recording-status').textContent()
        return status
      })
      .toBe('Capturing')
    await expect(recordingAction).toHaveText('Pause (10 min)')
  } finally {
    await electronApp.close()
  }
})

test('tray recording action pauses and resumes while settings window reflects state', async () => {
  const contextPath = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-context-stills-'))
  const settingsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-settings-e2e-'))

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
    await expect(window.locator('#sidebar-recording-status')).toHaveText('Capturing')
    await expect(recordingAction).toHaveText('Pause (10 min)')

    const initialTrayLabel = await window.evaluate(() => window.familiar.getTrayRecordingLabelForE2E())
    expect(initialTrayLabel.ok).toBe(true)
    expect(initialTrayLabel.label).toBe('Capturing (click to pause)')

    const pausedTray = await window.evaluate(() => window.familiar.clickTrayRecordingActionForE2E())
    expect(pausedTray.ok).toBe(true)
    expect(pausedTray.label).toMatch(/^Paused for \d+m \(click to resume\)$/)

    await expect(window.locator('#sidebar-recording-status')).toHaveText('Paused')
    await expect(recordingAction).toHaveText('Resume')

    const resumedTray = await window.evaluate(() => window.familiar.clickTrayRecordingActionForE2E())
    expect(resumedTray.ok).toBe(true)
    expect(resumedTray.label).toBe('Capturing (click to pause)')

    await expect(window.locator('#sidebar-recording-status')).toHaveText('Capturing')
    await expect(recordingAction).toHaveText('Pause (10 min)')
  } finally {
    await electronApp.close()
  }
})

test('tray start capturing turns capture toggle on and sets status to capturing', async () => {
  const contextPath = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-context-stills-'))
  const settingsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-settings-e2e-'))

  const electronApp = await launchApp({ contextPath, settingsDir })

  try {
    const window = await electronApp.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    await ensureRecordingPrereqs(window)
    await setIdleSeconds(electronApp, 0)
    await setContextFolder(window)
    await enableRecordingToggle(window)

    await window.getByRole('tab', { name: 'General' }).click()
    await window.locator('label[for="always-record-when-active"]').click({ force: true })
    await expect(window.locator('#always-record-when-active')).not.toBeChecked()
    await expect(window.locator('#always-record-when-active-status')).toHaveText('Saved.')

    const trayLabelBeforeStart = await window.evaluate(() => window.familiar.getTrayRecordingLabelForE2E())
    expect(trayLabelBeforeStart.ok).toBe(true)
    expect(trayLabelBeforeStart.label).toBe('Start Capturing')

    const trayStart = await window.evaluate(() => window.familiar.clickTrayRecordingActionForE2E())
    expect(trayStart.ok).toBe(true)

    await expect(window.locator('#always-record-when-active')).toBeChecked()
    await expect(window.locator('#sidebar-recording-status')).toHaveText('Capturing')
  } finally {
    await electronApp.close()
  }
})
