const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { test, expect } = require('playwright/test')
const { _electron: electron } = require('playwright')
const {
  JIMINY_BEHIND_THE_SCENES_DIR_NAME,
  RECORDINGS_DIR_NAME
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
    test.skip(true, 'Screen recording is only supported on macOS.')
  }

  const settings = await window.evaluate(() => window.jiminy.getSettings())
  if (settings.screenRecordingPermissionStatus !== 'granted') {
    test.skip(
      true,
      'Screen Recording permission not granted. Enable it in System Settings → Privacy & Security → Screen Recording.'
    )
  }
}

const setContextFolder = async (window) => {
  await window.getByRole('tab', { name: 'General' }).click()
  await window.locator('#context-folder-choose').click()
  await expect(window.locator('#context-folder-status')).toHaveText('Saved.')
}

const enableRecordingToggle = async (window) => {
  await window.getByRole('tab', { name: 'Recording' }).click()
  await window.locator('label[for="always-record-when-active"]').click({ force: true })
  await expect(window.locator('#always-record-when-active')).toBeChecked()
  await expect(window.locator('#always-record-when-active-status')).toHaveText('Saved.')
}

const getRecordingsRoot = (contextPath) =>
  path.join(contextPath, JIMINY_BEHIND_THE_SCENES_DIR_NAME, RECORDINGS_DIR_NAME)

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

const findManifestPath = (recordingsRoot) => {
  if (!fs.existsSync(recordingsRoot)) {
    return ''
  }
  const sessions = fs.readdirSync(recordingsRoot).filter((entry) => entry.startsWith('session-'))
  if (sessions.length === 0) {
    return ''
  }
  const candidate = path.join(recordingsRoot, sessions[0], 'manifest.json')
  return fs.existsSync(candidate) ? candidate : ''
}

const waitForManifestPath = async (recordingsRoot) => {
  let manifestPath = ''
  await expect.poll(() => {
    manifestPath = findManifestPath(recordingsRoot)
    return manifestPath
  }).toBeTruthy()
  return manifestPath
}

const readManifest = (manifestPath) =>
  JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))

const waitForSegmentCount = async (manifestPath, minimumCount) => {
  await expect.poll(() => readManifest(manifestPath).segments.length).toBeGreaterThanOrEqual(minimumCount)
}

const waitForRecordingStopped = async (window) => {
  await expect
    .poll(async () => {
      const status = await window.evaluate(() => window.jiminy.getScreenRecordingStatus())
      return status?.isRecording === true
    })
    .toBeFalsy()
}

const assertSegmentFiles = (manifestPath, manifest, options = {}) => {
  const requireNonEmptyCount = Number.isFinite(options.requireNonEmptyCount)
    ? options.requireNonEmptyCount
    : manifest.segments.length
  manifest.segments.forEach((segment, index) => {
    const segmentPath = path.join(path.dirname(manifestPath), segment.file)
    expect(fs.existsSync(segmentPath)).toBe(true)
    const size = fs.statSync(segmentPath).size
    if (index < requireNonEmptyCount) {
      expect(size).toBeGreaterThan(0)
    }
  })
}

test('recording saves a segment to the recordings folder', async () => {
  const contextPath = fs.mkdtempSync(path.join(os.tmpdir(), 'jiminy-context-recording-'))
  const settingsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jiminy-settings-e2e-'))

  const electronApp = await launchApp({ contextPath, settingsDir })

  try {
    const window = await electronApp.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    await ensureRecordingPrereqs(window)
    await setIdleSeconds(electronApp, 0)
    await setContextFolder(window)
    await enableRecordingToggle(window)

    const recordingAction = window.locator('#recording-action')
    await expect(recordingAction).toBeEnabled()

    await recordingAction.click()
    await expect(window.locator('#recording-status')).toHaveText('Recording')
    await expect(recordingAction).toHaveText('10 Minute Pause')

    await new Promise((resolve) => setTimeout(resolve, 1000))

    await recordingAction.click()
    await expect(window.locator('#recording-status')).toHaveText('Paused')
    await expect(recordingAction).toHaveText('Resume')

    const recordingsRoot = getRecordingsRoot(contextPath)
    const manifestPath = await waitForManifestPath(recordingsRoot)

    const manifest = readManifest(manifestPath)
    expect(manifest.segments.length).toBe(1)
    assertSegmentFiles(manifestPath, manifest)
  } finally {
    await electronApp.close()
  }
})

test('recording rolls to a new segment after the segment length elapses', async () => {
  const segmentLengthMs = 1500
  const contextPath = fs.mkdtempSync(path.join(os.tmpdir(), 'jiminy-context-recording-'))
  const settingsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jiminy-settings-e2e-'))

  const electronApp = await launchApp({
    contextPath,
    settingsDir,
    env: {
      JIMINY_E2E_SEGMENT_LENGTH_MS: String(segmentLengthMs)
    }
  })

  try {
    const window = await electronApp.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    await ensureRecordingPrereqs(window)
    await setIdleSeconds(electronApp, 0)
    await setContextFolder(window)
    await enableRecordingToggle(window)

    const recordingAction = window.locator('#recording-action')
    await expect(recordingAction).toBeEnabled()

    await recordingAction.click()
    await expect(window.locator('#recording-status')).toHaveText('Recording')
    await expect(recordingAction).toHaveText('10 Minute Pause')

    const recordingsRoot = getRecordingsRoot(contextPath)
    const manifestPath = await waitForManifestPath(recordingsRoot)

    await waitForSegmentCount(manifestPath, 2)

    await recordingAction.click()
    await expect(window.locator('#recording-status')).toHaveText('Paused')
    await expect(recordingAction).toHaveText('Resume')

    await waitForSegmentCount(manifestPath, 2)

    const manifest = readManifest(manifestPath)
    expect(manifest.segments.length).toBeGreaterThanOrEqual(2)
    assertSegmentFiles(manifestPath, manifest, { requireNonEmptyCount: 2 })
  } finally {
    await electronApp.close()
  }
})

test('recording stops and saves the segment when the user goes idle', async () => {
  const contextPath = fs.mkdtempSync(path.join(os.tmpdir(), 'jiminy-context-recording-'))
  const settingsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jiminy-settings-e2e-'))

  const electronApp = await launchApp({ contextPath, settingsDir })

  try {
    const window = await electronApp.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    await ensureRecordingPrereqs(window)
    await setContextFolder(window)
    await enableRecordingToggle(window)

    const recordingAction = window.locator('#recording-action')
    await expect(recordingAction).toBeEnabled()

    await recordingAction.click()
    await expect(window.locator('#recording-status')).toHaveText('Recording')

    await new Promise((resolve) => setTimeout(resolve, 500))

    await window.evaluate(() => window.jiminy.simulateRecordingIdle({ idleSeconds: 9999 }))
    await waitForRecordingStopped(window)

    const recordingsRoot = getRecordingsRoot(contextPath)
    const manifestPath = await waitForManifestPath(recordingsRoot)
    await waitForSegmentCount(manifestPath, 1)

    const manifest = readManifest(manifestPath)
    expect(manifest.stopReason).toBe('idle')
    expect(manifest.segments.length).toBeGreaterThanOrEqual(1)
    assertSegmentFiles(manifestPath, manifest)
  } finally {
    await electronApp.close()
  }
})

test('recording resumes automatically after the pause window', async () => {
  const contextPath = fs.mkdtempSync(path.join(os.tmpdir(), 'jiminy-context-recording-'))
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

    const recordingAction = window.locator('#recording-action')
    await expect(recordingAction).toBeEnabled()

    await recordingAction.click()
    await expect(window.locator('#recording-status')).toHaveText('Recording')

    await recordingAction.click()
    await expect(window.locator('#recording-status')).toHaveText('Paused')
    await expect(recordingAction).toHaveText('Resume')

    await expect
      .poll(async () => {
        const status = await window.locator('#recording-status').textContent()
        return status
      })
      .toBe('Recording')
    await expect(recordingAction).toHaveText('10 Minute Pause')
  } finally {
    await electronApp.close()
  }
})
