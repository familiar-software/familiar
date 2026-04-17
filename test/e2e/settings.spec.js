const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { test, expect } = require('playwright/test')
const { _electron: electron } = require('playwright')
const { confirmMoveContextFolder } = require('./helpers')

const getSettingsWindow = async (electronApp) => {
  let requestedActivation = false

  for (let attempt = 0; attempt < 50; attempt += 1) {
    for (const window of electronApp.windows()) {
      try {
        const hasSettingsBridge = await window.evaluate(
          () => typeof window.familiar?.getSettings === 'function'
        )
        if (hasSettingsBridge) {
          return window
        }
      } catch {
        // Ignore windows that are still loading or use a different preload bridge.
      }
    }

    if (!requestedActivation) {
      requestedActivation = true
      await electronApp.evaluate(({ app }) => {
        app.emit('activate')
      })
    }

    await new Promise((resolve) => setTimeout(resolve, 100))
  }

  throw new Error('Timed out waiting for the settings window')
}

test('storage change button sets the context folder path', async () => {
  const appRoot = path.join(__dirname, '../..')
  const sourceContextPath = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-context-source-'))
  fs.mkdirSync(path.join(sourceContextPath, 'familiar'), { recursive: true })
  const contextPath = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-context-destination-'))
  const expectedContextPath = path.resolve(contextPath)
  const expectedDisplayPath = path.join(expectedContextPath, 'familiar').replace(/\\/g, '/')
  const pathSegments = expectedDisplayPath.split('/').filter((segment) => segment.length > 0)
  const expectedStorageDisplayPath =
    expectedDisplayPath.length > 48 && pathSegments.length > 4
      ? `.../${pathSegments.slice(-4).join('/')}`
      : expectedDisplayPath
  const settingsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-settings-e2e-'))
  const settingsPath = path.join(settingsDir, 'settings.json')
  fs.writeFileSync(
    settingsPath,
    JSON.stringify(
      {
        wizardCompleted: true,
        contextFolderPath: sourceContextPath
      },
      null,
      2
    )
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
      FAMILIAR_SETTINGS_DIR: settingsDir
    }
  })

  try {
    const window = await electronApp.firstWindow()
    await window.waitForLoadState('domcontentloaded')
    await expect(window.getByRole('tab', { name: 'Wizard' })).toBeHidden()
    await expect(window.getByRole('tab', { name: 'Capture' })).toBeVisible()
    await expect(window.getByRole('tab', { name: 'Storage' })).toBeVisible()
    await expect(window.getByRole('tab', { name: 'Skill' })).toBeVisible()
    const visibleTabs = (await window.locator('[role="tab"]:visible').allTextContents()).map((tabText) =>
      tabText.trim()
    )
    expect(visibleTabs.slice(0, 2)).toEqual(['Capture', 'Storage'])
    await window.getByRole('tab', { name: 'Storage' }).click()

    const confirmDialog = confirmMoveContextFolder(window)
    await window.locator('#recording-move-folder').click()
    await confirmDialog
    await expect(window.locator('#context-folder-path')).toHaveValue(expectedStorageDisplayPath)
    await expect(window.locator('#context-folder-status')).toHaveText('Saved.')

    const stored = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
    expect(stored.contextFolderPath).toBe(expectedContextPath)
  } finally {
    await electronApp.close()
  }
})

test('capturing tab keeps toggle visible before checking permissions', async () => {
  const appRoot = path.join(__dirname, '../..')
  const contextPath = path.join(appRoot, 'test', 'fixtures', 'context')
  const settingsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-settings-e2e-'))
  const settingsPath = path.join(settingsDir, 'settings.json')
  fs.writeFileSync(
    settingsPath,
    JSON.stringify(
      {
        wizardCompleted: true
      },
      null,
      2
    )
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
      FAMILIAR_E2E_SCREEN_RECORDING_PERMISSION: 'denied'
    }
  })

  try {
    const window = await electronApp.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    await window.getByRole('tab', { name: 'Capture' }).click()
    await expect(window.locator('#recording-recording-toggle-section')).toBeVisible()
  } finally {
    await electronApp.close()
  }
})

test('capturing tab saves blacklisted installed apps into settings', async () => {
  const appRoot = path.join(__dirname, '../..')
  const contextPath = path.join(appRoot, 'test', 'fixtures', 'context')
  const settingsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-settings-e2e-'))
  const settingsPath = path.join(settingsDir, 'settings.json')
  fs.writeFileSync(
    settingsPath,
    JSON.stringify(
      {
        wizardCompleted: true,
        capturePrivacy: {
          blacklistedApps: []
        }
      },
      null,
      2
    )
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
      FAMILIAR_E2E_INSTALLED_APPS_JSON: JSON.stringify([
        { name: 'Messages', bundleId: 'com.apple.MobileSMS', appPath: '/Applications/Messages.app' },
        { name: 'Google Chrome', bundleId: 'com.google.Chrome', appPath: '/Applications/Google Chrome.app' }
      ])
    }
  })

  try {
    const window = await electronApp.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    await window.getByRole('tab', { name: 'Capture' }).click()
    const messagesOption = window.locator('label').filter({ hasText: 'Messages' }).first()
    await expect(messagesOption).toBeVisible()
    await messagesOption.click()
    await expect(window.locator('#recording-capture-privacy-status')).toHaveText('Saved.')

    const stored = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
    expect(stored.capturePrivacy).toEqual({
      blacklistedApps: [
        { bundleId: 'com.apple.MobileSMS', name: 'Messages' }
      ]
    })
  } finally {
    await electronApp.close()
  }
})

test('activate event reopens settings window and settings window is resizable', async () => {
  const appRoot = path.join(__dirname, '../..')
  const contextPath = path.join(appRoot, 'test', 'fixtures', 'context')
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
      FAMILIAR_SETTINGS_DIR: settingsDir
    }
  })

  try {
    const window = await electronApp.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    const windowCapabilities = await electronApp.evaluate(({ BrowserWindow }) => {
      const settingsWindow = BrowserWindow.getAllWindows()[0]
      return {
        exists: Boolean(settingsWindow),
        isResizable: settingsWindow ? settingsWindow.isResizable() : false
      }
    })
    expect(windowCapabilities.exists).toBe(true)
    expect(windowCapabilities.isResizable).toBe(true)

    await electronApp.evaluate(({ BrowserWindow }) => {
      const settingsWindow = BrowserWindow.getAllWindows()[0]
      settingsWindow?.hide()
    })

    await expect
      .poll(async () =>
        electronApp.evaluate(({ BrowserWindow }) => {
          const settingsWindow = BrowserWindow.getAllWindows()[0]
          return settingsWindow ? settingsWindow.isVisible() : false
        })
      )
      .toBe(false)

    await electronApp.evaluate(({ app }) => {
      app.emit('activate')
    })

    await expect
      .poll(async () =>
        electronApp.evaluate(({ BrowserWindow }) => {
          const settingsWindow = BrowserWindow.getAllWindows()[0]
          return settingsWindow ? settingsWindow.isVisible() : false
        })
      )
      .toBe(true)
  } finally {
    await electronApp.close()
  }
})

test('settings window toggles app activation policy between foreground and background modes', async () => {
  test.skip(process.platform !== 'darwin', 'Activation policy assertions are macOS-specific')

  const appRoot = path.join(__dirname, '../..')
  const contextPath = path.join(appRoot, 'test', 'fixtures', 'context')
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
      FAMILIAR_SETTINGS_DIR: settingsDir
    }
  })

  try {
    const window = await electronApp.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    const dockVisibilityApiAvailable = await electronApp.evaluate(({ app }) => {
      return Boolean(app?.dock && typeof app.dock.isVisible === 'function')
    })
    test.skip(!dockVisibilityApiAvailable, 'Dock visibility API unavailable in current Electron runtime')

    await expect
      .poll(async () => electronApp.evaluate(({ app }) => app.dock.isVisible()))
      .toBe(true)

    await electronApp.evaluate(({ BrowserWindow }) => {
      const settingsWindow = BrowserWindow.getAllWindows()[0]
      settingsWindow?.close()
    })

    await expect
      .poll(async () => electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isVisible()))
      .toBe(false)

    await expect
      .poll(async () => electronApp.evaluate(({ app }) => app.dock.isVisible()))
      .toBe(false)

    await electronApp.evaluate(({ app }) => {
      app.emit('activate')
    })

    await expect
      .poll(async () => electronApp.evaluate(({ app }) => app.dock.isVisible()))
      .toBe(true)
  } finally {
    await electronApp.close()
  }
})

test('repeated non-capture settings saves keep screen-stills state stable', async () => {
  const appRoot = path.join(__dirname, '../..')
  const contextPath = path.join(appRoot, 'test', 'fixtures', 'context')
  const settingsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-settings-e2e-'))
  const settingsPath = path.join(settingsDir, 'settings.json')
  fs.mkdirSync(path.join(contextPath, 'familiar'), { recursive: true })
  fs.writeFileSync(
    settingsPath,
    JSON.stringify(
      {
        wizardCompleted: true,
        contextFolderPath: contextPath,
        alwaysRecordWhenActive: true
      },
      null,
      2
    )
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
      FAMILIAR_E2E_SCREEN_RECORDING_PERMISSION: 'granted',
      FAMILIAR_LLM_MOCK: '1',
      FAMILIAR_LLM_MOCK_TEXT: 'gibberish',
      FAMILIAR_SETTINGS_DIR: settingsDir
    }
  })

  try {
    const window = await getSettingsWindow(electronApp)
    await window.waitForLoadState('domcontentloaded')

    await window.evaluate(() => {
      window.__screenStillsTransitionHistory = []
      window.familiar.onScreenStillsStateChanged((payload) => {
        window.__screenStillsTransitionHistory.push({
          state: payload.state,
          manualPaused: payload.manualPaused,
          enabled: payload.enabled
        })
      })
    })

    const startResult = await window.evaluate(() => window.familiar.startScreenStills())
    expect(startResult.ok).toBe(true)

    await expect
      .poll(async () => {
        const status = await window.evaluate(() => window.familiar.getScreenStillsStatus())
        return status.state
      })
      .not.toBe('disabled')

    const baselineState = await window.evaluate(() => window.familiar.getScreenStillsStatus())
    const baselineTransitions = await window.evaluate(() => window.__screenStillsTransitionHistory.length)

    for (let index = 0; index < 10; index += 1) {
      const nextRetentionValue = index % 2 === 0 ? 2 : 7
      const saveResult = await window.evaluate((nextValue) => {
        return window.familiar.saveSettings({ storageAutoCleanupRetentionDays: nextValue })
      }, nextRetentionValue)
      expect(saveResult).toEqual({ ok: true })
    }

    await window.waitForTimeout(300)

    const finalState = await window.evaluate(() => window.familiar.getScreenStillsStatus())
    const finalTransitions = await window.evaluate(() => window.__screenStillsTransitionHistory.length)

    expect(finalState.state).toBe(baselineState.state)
    expect(finalTransitions).toBe(baselineTransitions)
  } finally {
    await electronApp.close()
  }
})
