const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { test, expect } = require('playwright/test')
const { _electron: electron } = require('playwright')

const launchElectron = (options = {}) => {
  const appRoot = path.join(__dirname, '../..')
  const settingsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jiminy-settings-e2e-'))
  const launchArgs = ['.']
  if (process.platform === 'linux' || process.env.CI) {
    launchArgs.push('--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage')
  }

  return {
    appRoot,
    settingsDir,
    electronApp: electron.launch({
      args: launchArgs,
      cwd: appRoot,
      env: {
        ...process.env,
        JIMINY_E2E: '1',
        JIMINY_E2E_CONTEXT_PATH: options.contextPath,
        JIMINY_SETTINGS_DIR: settingsDir,
        ...options.env
      }
    })
  }
}

const advanceWizardToHotkeys = async (window, nextButton) => {
  const hotkeysCapture = window.locator('#wizard-capture-hotkey')

  for (let attempts = 0; attempts < 3; attempts += 1) {
    if (await hotkeysCapture.isVisible()) {
      return
    }

    await expect(nextButton).toBeEnabled()
    await nextButton.click()
  }

  await expect(hotkeysCapture).toBeVisible()
}

test('wizard happy flow completes setup and routes to General', async () => {
  const appRoot = path.join(__dirname, '../..')
  const contextPath = path.join(appRoot, 'test', 'fixtures', 'context')
  const { electronApp, settingsDir } = launchElectron({
    contextPath,
    env: { JIMINY_LLM_MOCK: '1', JIMINY_LLM_MOCK_TEXT: 'gibberish' }
  })

  try {
    const window = await (await electronApp).firstWindow()
    await window.waitForLoadState('domcontentloaded')

    await expect(window.locator('[data-wizard-step="1"]')).toBeVisible()

    const nextButton = window.locator('#wizard-next')
    await expect(nextButton).toBeDisabled()

    await window.locator('#wizard-context-folder-choose').click()
    await expect(window.locator('#wizard-context-folder-path')).toHaveValue(path.resolve(contextPath))
    await expect(nextButton).toBeEnabled()

    await nextButton.click()
    await expect(window.locator('[data-wizard-step="2"]')).toBeVisible()

    await window.locator('#wizard-llm-provider').selectOption('gemini')
    await window.locator('#wizard-llm-api-key').fill('test-key')
    await window.locator('#wizard-llm-api-key').blur()
    await expect(window.locator('#wizard-llm-api-key-status')).toHaveText('Saved.')

    await nextButton.click()
    await expect(window.locator('[data-wizard-step="3"]')).toBeVisible()

    const doneButton = window.locator('#wizard-done')
    await advanceWizardToHotkeys(window, nextButton)
    await expect(doneButton).toBeEnabled()
    await doneButton.click()

    await expect(window.locator('#section-title')).toHaveText('General Settings')

    const settingsPath = path.join(settingsDir, 'settings.json')
    const stored = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
    expect(stored.contextFolderPath).toBe(path.resolve(contextPath))
    expect(stored.llm_provider.provider).toBe('gemini')
    expect(stored.llm_provider.api_key).toBe('test-key')
    expect(stored.alwaysRecordWhenActive ?? false).toBe(false)
  } finally {
    await (await electronApp).close()
  }
})

test('wizard preserves state when navigating back and forth', async () => {
  const appRoot = path.join(__dirname, '../..')
  const contextPath = path.join(appRoot, 'test', 'fixtures', 'context')
  const { electronApp } = launchElectron({
    contextPath,
    env: { JIMINY_LLM_MOCK: '1', JIMINY_LLM_MOCK_TEXT: 'gibberish' }
  })

  try {
    const window = await (await electronApp).firstWindow()
    await window.waitForLoadState('domcontentloaded')

    await window.locator('#wizard-context-folder-choose').click()
    await expect(window.locator('#wizard-context-folder-path')).toHaveValue(path.resolve(contextPath))

    const nextButton = window.locator('#wizard-next')
    const backButton = window.locator('#wizard-back')

    await nextButton.click()
    await expect(window.locator('[data-wizard-step="2"]')).toBeVisible()

    await window.locator('#wizard-llm-provider').selectOption('openai')
    await window.locator('#wizard-llm-api-key').fill('persisted-key')
    await window.locator('#wizard-llm-api-key').blur()
    await expect(window.locator('#wizard-llm-api-key-status')).toHaveText('Saved.')

    await backButton.click()
    await expect(window.locator('[data-wizard-step="1"]')).toBeVisible()
    await expect(window.locator('#wizard-context-folder-path')).toHaveValue(path.resolve(contextPath))

    await nextButton.click()
    await expect(window.locator('[data-wizard-step="2"]')).toBeVisible()
    await expect(window.locator('#wizard-llm-provider')).toHaveValue('openai')
    await expect(window.locator('#wizard-llm-api-key')).toHaveValue('persisted-key')
  } finally {
    await (await electronApp).close()
  }
})

test('wizard intelligence step requires provider and saved api key', async () => {
  const appRoot = path.join(__dirname, '../..')
  const contextPath = path.join(appRoot, 'test', 'fixtures', 'context')
  const { electronApp } = launchElectron({
    contextPath,
    env: { JIMINY_LLM_MOCK: '1', JIMINY_LLM_MOCK_TEXT: 'gibberish' }
  })

  try {
    const window = await (await electronApp).firstWindow()
    await window.waitForLoadState('domcontentloaded')

    await window.locator('#wizard-context-folder-choose').click()

    const nextButton = window.locator('#wizard-next')

    await nextButton.click()
    await expect(window.locator('[data-wizard-step=\"2\"]')).toBeVisible()

    await expect(nextButton).toBeDisabled()

    await window.locator('#wizard-llm-provider').selectOption('gemini')
    await expect(nextButton).toBeDisabled()

    await window.locator('#wizard-llm-api-key').fill('unsaved-key')
    await expect(nextButton).toBeDisabled()

    await window.locator('#wizard-llm-api-key').blur()
    await expect(window.locator('#wizard-llm-api-key-status')).toHaveText('Saved.')
    await expect(nextButton).toBeEnabled()
  } finally {
    await (await electronApp).close()
  }
})

test('wizard resets to first step after Done', async () => {
  const appRoot = path.join(__dirname, '../..')
  const contextPath = path.join(appRoot, 'test', 'fixtures', 'context')
  const { electronApp } = launchElectron({
    contextPath,
    env: { JIMINY_LLM_MOCK: '1', JIMINY_LLM_MOCK_TEXT: 'gibberish' }
  })

  try {
    const window = await (await electronApp).firstWindow()
    await window.waitForLoadState('domcontentloaded')

    await window.locator('#wizard-context-folder-choose').click()
    const nextButton = window.locator('#wizard-next')

    await nextButton.click()

    await window.locator('#wizard-llm-provider').selectOption('gemini')
    await window.locator('#wizard-llm-api-key').fill('test-key')
    await window.locator('#wizard-llm-api-key').blur()
    await expect(window.locator('#wizard-llm-api-key-status')).toHaveText('Saved.')

    await nextButton.click()
    await expect(window.locator('[data-wizard-step=\"3\"]')).toBeVisible()

    const doneButton = window.locator('#wizard-done')
    await advanceWizardToHotkeys(window, nextButton)
    await doneButton.click()
    await expect(window.locator('#section-title')).toHaveText('General Settings')

    await window.getByRole('tab', { name: 'Wizard' }).click()
    await expect(window.locator('[data-wizard-step=\"1\"]')).toBeVisible()
    await expect(window.locator('#wizard-capture-hotkey')).toBeHidden()
  } finally {
    await (await electronApp).close()
  }
})
