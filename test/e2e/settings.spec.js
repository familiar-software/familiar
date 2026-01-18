const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { test, expect } = require('playwright/test')
const { _electron: electron } = require('playwright')

test('choose button sets the context folder path', async () => {
  const appRoot = path.join(__dirname, '../..')
  const contextPath = path.join(appRoot, 'test', 'fixtures', 'context')
  const expectedContextPath = path.resolve(contextPath)
  const settingsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jiminy-settings-e2e-'))

  const electronApp = await electron.launch({
    args: ['.'],
    cwd: appRoot,
    env: {
      ...process.env,
      JIMINY_E2E: '1',
      JIMINY_E2E_CONTEXT_PATH: contextPath,
      JIMINY_SETTINGS_DIR: settingsDir
    }
  })

  try {
    const window = await electronApp.firstWindow()
    await window.waitForLoadState('domcontentloaded')

    await window.getByRole('button', { name: 'Choose...' }).click()
    await expect(window.getByLabel('Context Folder Path')).toHaveValue(expectedContextPath)

    await window.getByRole('button', { name: 'Save' }).click()
    await expect(window.locator('#context-folder-status')).toHaveText('Saved.')

    const settingsPath = path.join(settingsDir, 'settings.json')
    const stored = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
    expect(stored.contextFolderPath).toBe(expectedContextPath)
  } finally {
    await electronApp.close()
  }
})
