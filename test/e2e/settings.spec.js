const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { test, expect } = require('playwright/test')
const { _electron: electron } = require('playwright')

test('choose button sets the context folder path', async () => {
  const appRoot = path.join(__dirname, '../..')
  const contextPath = path.join(appRoot, 'test', 'fixtures', 'context')
  const expectedContextPath = path.resolve(contextPath)
  const expectedDisplayPath = path.join(expectedContextPath, 'familiar')
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
    await expect(window.getByRole('tab', { name: 'Wizard' })).toBeHidden()
    await expect(window.getByRole('tab', { name: 'Capturing' })).toBeVisible()
    await expect(window.getByRole('tab', { name: 'Storage' })).toBeVisible()
    await expect(window.getByRole('tab', { name: 'Install Skill' })).toBeVisible()
    const visibleTabs = (await window.locator('[role="tab"]:visible').allTextContents()).map((tabText) =>
      tabText.trim()
    )
    expect(visibleTabs.slice(0, 2)).toEqual(['Storage', 'Capturing'])
    await window.getByRole('tab', { name: 'Storage' }).click()

    await window.locator('#context-folder-choose').click()
    await expect(window.locator('#context-folder-path')).toHaveValue(expectedDisplayPath)
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
      FAMILIAR_SETTINGS_DIR: settingsDir,
      FAMILIAR_E2E_SCREEN_RECORDING_PERMISSION: 'denied'
    }
  })

  try {
    const window = await electronApp.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    await window.getByRole('tab', { name: 'Capturing' }).click()
    await expect(window.locator('#recording-recording-toggle-section')).toBeVisible()
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
