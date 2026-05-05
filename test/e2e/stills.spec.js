const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { test, expect } = require('playwright/test')
const { _electron: electron } = require('playwright')
const { confirmMoveContextFolder } = require('./helpers')
const {
  FAMILIAR_BEHIND_THE_SCENES_DIR_NAME,
  STILLS_DB_FILENAME,
  STILLS_DIR_NAME
} = require('../../src/const')

const buildLaunchArgs = () => {
  const launchArgs = ['.']
  if (process.platform === 'linux') {
    launchArgs.push('--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage')
  }
  return launchArgs
}

const ensureSourceContext = (sourceContextPath) => {
  const resolvedSourceContextPath = sourceContextPath
    ? path.resolve(sourceContextPath)
    : fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-context-source-'))
  fs.mkdirSync(path.join(resolvedSourceContextPath, 'familiar'), { recursive: true })
  return resolvedSourceContextPath
}

const launchApp = async ({ contextPath, sourceContextPath, settingsDir, env = {}, initialSettings = {} }) => {
  const appRoot = path.join(__dirname, '../..')
  const resolvedSourceContextPath = ensureSourceContext(sourceContextPath)
  fs.writeFileSync(
    path.join(settingsDir, 'settings.json'),
    JSON.stringify(
      {
        wizardCompleted: true,
        contextFolderPath: resolvedSourceContextPath,
        ...initialSettings
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

const startCapturingFromSettings = async (window) => {
  const currentStatus = await window.evaluate(() => window.familiar.getScreenStillsStatus())
  if (currentStatus?.isRecording === true) {
    return currentStatus
  }
  const result = await window.evaluate(() => window.familiar.startScreenStills())
  expect(result?.ok).toBe(true)
  return result
}

const pauseCapturingFromSettings = async (window) => {
  const result = await window.evaluate(() => window.familiar.pauseScreenStills())
  expect(result?.ok).toBe(true)
  return result
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

const findSessionDir = (stillsRoot) => {
  if (!fs.existsSync(stillsRoot)) {
    return ''
  }
  const sessions = fs.readdirSync(stillsRoot).filter((entry) => entry.startsWith('session-'))
  if (sessions.length === 0) {
    return ''
  }
  return path.join(stillsRoot, sessions[0])
}

const listSessionDirs = (stillsRoot) => {
  if (!fs.existsSync(stillsRoot)) {
    return []
  }
  return fs
    .readdirSync(stillsRoot)
    .filter((entry) => entry.startsWith('session-'))
    .sort()
    .map((entry) => path.join(stillsRoot, entry))
}

const listArchiveDirs = (contextPath) => {
  const archiveRoot = path.join(contextPath, FAMILIAR_BEHIND_THE_SCENES_DIR_NAME, 'archive')
  if (!fs.existsSync(archiveRoot)) {
    return []
  }
  return fs
    .readdirSync(archiveRoot)
    .filter((entry) => entry.startsWith('stills-db-corruption-'))
    .sort()
    .map((entry) => path.join(archiveRoot, entry))
}

const listCaptureFiles = (sessionDir) => {
  if (!sessionDir || !fs.existsSync(sessionDir)) {
    return []
  }
  return fs
    .readdirSync(sessionDir)
    .filter((entry) =>
      /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z?\.(webp|png|jpg|jpeg)$/i.test(entry)
    )
    .sort()
}

const waitForSessionDir = async (stillsRoot, options = {}) => {
  const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : 5000
  let sessionDir = ''
  await expect
    .poll(
      () => {
        sessionDir = findSessionDir(stillsRoot)
        return sessionDir
      },
      { timeout: timeoutMs }
    )
    .toBeTruthy()
  return sessionDir
}

const waitForCaptureCount = async (sessionDir, minimumCount) => {
  await expect.poll(() => listCaptureFiles(sessionDir).length).toBeGreaterThanOrEqual(minimumCount)
}

const waitForTotalCaptureCount = async (stillsRoot, minimumCount) => {
  await expect
    .poll(() =>
      listSessionDirs(stillsRoot)
        .map((sessionDir) => listCaptureFiles(sessionDir).length)
        .reduce((total, count) => total + count, 0)
    )
    .toBeGreaterThanOrEqual(minimumCount)
}

const corruptStillsDbOnNextEnqueue = async (electronApp) => {
  await electronApp.evaluate(() => {
    process.env.FAMILIAR_E2E_CORRUPT_STILLS_QUEUE_DB_ON_ENQUEUE = 'next'
  })
}

const assertFreshQueueDb = async (electronApp) => {
  const result = await electronApp.evaluate(() => {
    const Database = process.mainModule.require(`${process.cwd()}/node_modules/better-sqlite3`)
    const dbPath = `${process.env.FAMILIAR_E2E_CONTEXT_PATH}/familiar/stills.db`
    const db = new Database(dbPath, { readonly: true })
    try {
      return {
        integrityCheck: db.prepare('PRAGMA integrity_check').pluck().get(),
        columns: db.prepare('PRAGMA table_info(stills_queue)').all().map((column) => column.name)
      }
    } finally {
      db.close()
    }
  })

  expect(result.integrityCheck).toBe('ok')
  expect(result.columns).toContain('image_path')
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

const assertCaptureFiles = (sessionDir, captureFiles, options = {}) => {
  const requireNonEmptyCount = Number.isFinite(options.requireNonEmptyCount)
    ? options.requireNonEmptyCount
    : captureFiles.length
  captureFiles.forEach((captureFileName, index) => {
    const capturePath = path.join(sessionDir, captureFileName)
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

test('capturing skips still files when a blacklisted app is visible', async () => {
  const contextPath = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-context-stills-privacy-'))
  const settingsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-settings-stills-privacy-'))
  const electronApp = await launchApp({
    contextPath,
    settingsDir,
    initialSettings: {
      capturePrivacy: {
        blacklistedApps: [{ bundleId: 'com.apple.MobileSMS', name: 'Messages' }]
      }
    },
    env: {
      FAMILIAR_E2E_SCREEN_RECORDING_PERMISSION: 'granted',
      FAMILIAR_E2E_VISIBLE_WINDOWS_JSON: JSON.stringify([
        { name: 'Messages', bundleId: 'com.apple.MobileSMS', active: true }
      ])
    }
  })

  try {
    const window = await electronApp.firstWindow()
    await window.waitForLoadState('domcontentloaded')
    await ensureRecordingPrereqs(window)
    await setContextFolder(window)
    await enableRecordingToggle(window)
    await startCapturingFromSettings(window)

    const stillsRoot = getStillsRoot(contextPath)
    const sessionDir = await waitForSessionDir(stillsRoot)
    await window.waitForTimeout(600)
    expect(listCaptureFiles(sessionDir)).toEqual([])
  } finally {
    await electronApp.close()
  }
})

const readCaptureBuffer = (sessionDir, captureFileName) =>
  fs.readFileSync(path.join(sessionDir, captureFileName))

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

    await startCapturingFromSettings(window)
    await expect(window.locator('#recording-status')).toHaveText('Capturing')

    const stillsRoot = getStillsRoot(contextPath)
    const sessionDir = await waitForSessionDir(stillsRoot)
    await waitForCaptureCount(sessionDir, 1)

    await pauseCapturingFromSettings(window)
    await expect(window.locator('#recording-status')).toHaveText('Paused')

    const captureFiles = listCaptureFiles(sessionDir)
    expect(captureFiles.length).toBeGreaterThan(0)
    assertCaptureFiles(sessionDir, captureFiles)
  } finally {
    await electronApp.close()
  }
})

test('capturing status is off when capture toggle is disabled and permissions are granted', async () => {
  const contextPath = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-context-stills-'))
  const settingsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-settings-e2e-'))

  const electronApp = await launchApp({
    contextPath,
    settingsDir,
    env: {
      FAMILIAR_E2E_SCREEN_RECORDING_PERMISSION: 'granted'
    }
  })

  try {
    const window = await electronApp.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    await window.getByRole('tab', { name: 'Capture' }).click()
    await expect(window.locator('#recording-status')).toHaveText('Off', { timeout: 8000 })
    await expect(window.locator('#recording-status-dot')).not.toHaveClass(/bg-red-500/)
  } finally {
    await electronApp.close()
  }
})

if (process.platform === 'darwin') {
  test('stills capture output changes when screen content changes', async () => {
    test.skip(process.env.CI === 'true', 'Real screen capture verification is unstable in CI/headless mode')

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

      await startCapturingFromSettings(window)

      const stillsRoot = getStillsRoot(contextPath)
      const sessionDir = await waitForSessionDir(stillsRoot)
      await waitForCaptureCount(sessionDir, 1)

      await setWindowBackdrop(window, { backgroundColor: '#ef3b3b', marker: 'B' })
      await waitForCaptureCount(sessionDir, 2)

      const captureFiles = listCaptureFiles(sessionDir)
      expect(captureFiles.length).toBeGreaterThanOrEqual(2)

      const firstCapture = readCaptureBuffer(sessionDir, captureFiles[0])
      const secondCapture = readCaptureBuffer(sessionDir, captureFiles[1])
      assertImageHeader(path.join(sessionDir, captureFiles[0]))
      assertImageHeader(path.join(sessionDir, captureFiles[1]))
      expect(firstCapture.equals(secondCapture)).toBe(false)
      expect(firstCapture.length).toBeGreaterThan(0)
      expect(secondCapture.length).toBeGreaterThan(0)

      await pauseCapturingFromSettings(window)
      await expect(window.locator('#recording-status')).toHaveText('Paused')
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

    await startCapturingFromSettings(window)
    const stillsRoot = getStillsRoot(contextPath)
    await waitForRecordingState(window, 'armed')
    let sessionDir = ''
    try {
      sessionDir = await waitForSessionDir(stillsRoot, { timeoutMs: 1200 })
    } catch (_error) {
      sessionDir = ''
    }
    if (sessionDir) {
      const captureFiles = listCaptureFiles(sessionDir)
      expect(captureFiles.length).toBe(0)
    }

    await expect(window.locator('#recording-status')).toHaveText('Idle')
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

    await startCapturingFromSettings(window)
    await expect(window.locator('#recording-status')).toHaveText('Capturing')

    const stillsRoot = getStillsRoot(contextPath)
    const sessionDir = await waitForSessionDir(stillsRoot)
    await waitForCaptureCount(sessionDir, 1)

    await expect
      .poll(async () => {
        const status = await window.evaluate(() => window.familiar.getScreenStillsStatus())
        return status?.isRecording === true
      })
      .toBeTruthy()

    const captureFiles = listCaptureFiles(sessionDir)
    expect(captureFiles.length).toBeGreaterThan(0)
    assertCaptureFiles(sessionDir, captureFiles, { requireNonEmptyCount: 1 })

    await pauseCapturingFromSettings(window)
    await expect(window.locator('#recording-status')).toHaveText('Paused')
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
    await setIdleSeconds(electronApp, 0)
    await setContextFolder(window)
    await enableRecordingToggle(window)

    await startCapturingFromSettings(window)
    await expect(window.locator('#recording-status')).toHaveText('Capturing')

    const stillsRoot = getStillsRoot(contextPath)
    const sessionDir = await waitForSessionDir(stillsRoot)

    await waitForCaptureCount(sessionDir, 2)

    await pauseCapturingFromSettings(window)
    await expect(window.locator('#recording-status')).toHaveText('Paused')

    await waitForCaptureCount(sessionDir, 2)

    const captureFiles = listCaptureFiles(sessionDir)
    expect(captureFiles.length).toBeGreaterThanOrEqual(2)
    assertCaptureFiles(sessionDir, captureFiles, { requireNonEmptyCount: 2 })
  } finally {
    await electronApp.close()
  }
})

test('stills queue corruption recreates the database and recording continues', async () => {
  const intervalMs = 300
  const contextPath = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-context-stills-corrupt-'))
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
    await setIdleSeconds(electronApp, 0)
    await setContextFolder(window)
    await enableRecordingToggle(window)

    await startCapturingFromSettings(window)
    await expect(window.locator('#recording-status')).toHaveText('Capturing')

    const stillsRoot = getStillsRoot(contextPath)
    const firstSessionDir = await waitForSessionDir(stillsRoot)
    await waitForCaptureCount(firstSessionDir, 1)
    const capturesBeforeCorruption = listCaptureFiles(firstSessionDir).length

    await corruptStillsDbOnNextEnqueue(electronApp)

    await expect.poll(() => listArchiveDirs(contextPath).length, { timeout: 8000 }).toBe(1)
    const archiveDir = listArchiveDirs(contextPath)[0]
    expect(path.basename(archiveDir)).toMatch(
      /^stills-db-corruption-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z$/
    )
    expect(fs.existsSync(path.join(archiveDir, STILLS_DB_FILENAME))).toBe(true)
    await assertFreshQueueDb(electronApp)

    await expect(window.locator('#recording-status')).toHaveText('Capturing', { timeout: 8000 })
    await expect
      .poll(async () => {
        const status = await window.evaluate(() => window.familiar.getScreenStillsStatus())
        return status?.isRecording === true
      })
      .toBeTruthy()

    await expect
      .poll(() => listSessionDirs(stillsRoot).length, { timeout: 8000 })
      .toBeGreaterThanOrEqual(2)
    await waitForTotalCaptureCount(stillsRoot, capturesBeforeCorruption + 2)

    const latestSessionDir = listSessionDirs(stillsRoot).at(-1)
    expect(latestSessionDir).not.toBe(firstSessionDir)
    assertCaptureFiles(latestSessionDir, listCaptureFiles(latestSessionDir), {
      requireNonEmptyCount: 1
    })
  } finally {
    await electronApp.close()
  }
})

test('stills stop when the user goes idle', async () => {
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

    await startCapturingFromSettings(window)
    await expect(window.locator('#recording-status')).toHaveText('Capturing')

    const stillsRoot = getStillsRoot(contextPath)
    const sessionDir = await waitForSessionDir(stillsRoot)
    await waitForCaptureCount(sessionDir, 1)

    await window.evaluate(() => window.familiar.simulateStillsIdle({ idleSeconds: 9999 }))
    await waitForRecordingStopped(window)

    const captureFiles = listCaptureFiles(sessionDir)
    expect(captureFiles.length).toBeGreaterThanOrEqual(1)
    assertCaptureFiles(sessionDir, captureFiles)
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

    await startCapturingFromSettings(window)
    await expect(window.locator('#recording-status')).toHaveText('Capturing')

    const pauseResult = await pauseCapturingFromSettings(window)
    expect(pauseResult?.manualPaused).toBe(true)

    await expect
      .poll(async () => {
        const status = await window.locator('#recording-status').textContent()
        return status
      })
      .toBe('Capturing')
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

    await expect(window.locator('#recording-status')).toHaveText('Capturing')

    const initialTrayLabel = await window.evaluate(() => window.familiar.getTrayRecordingLabelForE2E())
    expect(initialTrayLabel.ok).toBe(true)
    expect(initialTrayLabel.label).toBe('Capturing (click to pause for 10 min)')

    const pausedTray = await window.evaluate(() => window.familiar.clickTrayRecordingActionForE2E())
    expect(pausedTray.ok).toBe(true)
    expect(pausedTray.label).toBe('Paused for 10 min (click to resume)')

    await expect(window.locator('#recording-status')).toHaveText('Paused')

    const resumedTray = await window.evaluate(() => window.familiar.clickTrayRecordingActionForE2E())
    expect(resumedTray.ok).toBe(true)
    expect(resumedTray.label).toBe('Capturing (click to pause for 10 min)')

    await expect(window.locator('#recording-status')).toHaveText('Capturing')
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

    const disableResult = await window.evaluate(() => window.familiar.saveSettings({ alwaysRecordWhenActive: false }))
    expect(disableResult?.ok).toBe(true)
    await expect
      .poll(async () => {
        const settings = await window.evaluate(() => window.familiar.getSettings())
        return settings?.alwaysRecordWhenActive
      })
      .toBe(false)

    const trayLabelBeforeStart = await window.evaluate(() => window.familiar.getTrayRecordingLabelForE2E())
    expect(trayLabelBeforeStart.ok).toBe(true)
    expect(trayLabelBeforeStart.label).toBe('Start Capturing')

    const trayStart = await window.evaluate(() => window.familiar.clickTrayRecordingActionForE2E())
    expect(trayStart.ok).toBe(true)

    await expect
      .poll(async () => {
        const settings = await window.evaluate(() => window.familiar.getSettings())
        return settings?.alwaysRecordWhenActive
      })
      .toBe(true)
    await expect(window.locator('#recording-status')).toHaveText('Capturing')
  } finally {
    await electronApp.close()
  }
})
