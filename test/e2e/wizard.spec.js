const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { test, expect } = require('playwright/test')
const { _electron: electron } = require('playwright')

const launchElectron = (options = {}) => {
  const appRoot = path.join(__dirname, '../..')
  const settingsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jiminy-settings-e2e-'))
  const skillHomeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jiminy-skill-home-e2e-'))
  const launchArgs = ['.']
  if (process.platform === 'linux' || process.env.CI) {
    launchArgs.push('--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage')
  }

  return {
    appRoot,
    settingsDir,
    skillHomeDir,
    electronApp: electron.launch({
      args: launchArgs,
      cwd: appRoot,
      env: {
        ...process.env,
        JIMINY_E2E: '1',
        JIMINY_E2E_CONTEXT_PATH: options.contextPath,
        JIMINY_SETTINGS_DIR: settingsDir,
        HOME: skillHomeDir,
        ...options.env
      }
    })
  }
}

const completeWizardPermissionsStep = async (window, nextButton) => {
  const checkPermissionsButton = window.locator('#wizard-check-permissions')
  const recordingToggle = window.locator('#wizard-always-record-when-active')

  await expect(checkPermissionsButton).toBeVisible()
  await checkPermissionsButton.click()

  if ((await checkPermissionsButton.textContent()) !== 'Granted') {
    const permission = await window.evaluate(() => window.jiminy.checkScreenRecordingPermission())
    test.skip(
      true,
      `Screen Recording permission not granted for wizard flow (status: ${permission?.permissionStatus || 'unknown'}).`
    )
  }

  await expect(window.locator('#wizard-recording-toggle-section')).toBeVisible()
  if (!(await recordingToggle.isChecked())) {
    await window.locator('label[for="wizard-always-record-when-active"]').click({ force: true })
    await expect(recordingToggle).toBeChecked()
  }
  await expect(nextButton).toBeEnabled()
  await nextButton.click()
}

const advanceWizardToHotkeys = async (window, nextButton) => {
  const hotkeysRecording = window.locator('#wizard-recording-hotkey')
  const skillInstallButton = window.locator('#wizard-skill-install')
  const skillStatus = window.locator('#wizard-skill-status')
  const codexHarness = window.locator('input[name="wizard-skill-harness"][value="codex"]')
  const wizardStep3 = window.locator('[data-wizard-step="3"]')

  for (let attempts = 0; attempts < 4; attempts += 1) {
    if (await hotkeysRecording.isVisible()) {
      return
    }

    if (await wizardStep3.isVisible()) {
      await completeWizardPermissionsStep(window, nextButton)
      continue
    }

    if (await skillInstallButton.isVisible()) {
      await codexHarness.check()
      await expect(skillInstallButton).toBeEnabled()
      await skillInstallButton.click()
      await expect(skillStatus).toContainText('Installed')
      await expect(nextButton).toBeEnabled()
      await nextButton.click()
      continue
    }

    await expect(nextButton).toBeEnabled()
    await nextButton.click()
  }

  await expect(hotkeysRecording).toBeVisible()
}

test('wizard happy flow completes setup and routes to General', async () => {
  const appRoot = path.join(__dirname, '../..')
  const contextPath = path.join(appRoot, 'test', 'fixtures', 'context')
  const { electronApp, settingsDir, skillHomeDir } = launchElectron({
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

    // Default mode is Local (no provider/key required).
    await expect(nextButton).toBeEnabled()

    // Switch to Cloud and configure provider/key to cover the cloud path.
    const wizardStep2 = window.locator('[data-wizard-step="2"]')
    await wizardStep2.locator('[data-processing-engine-mode="llm"]').click()
    await expect(nextButton).toBeDisabled()

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
    expect(stored.stills_markdown_extractor.type).toBe('llm')
    expect(stored.stills_markdown_extractor.llm_provider.provider).toBe('gemini')
    expect(stored.stills_markdown_extractor.llm_provider.api_key).toBe('test-key')
    expect(stored.alwaysRecordWhenActive ?? false).toBe(true)
    expect(stored.skillInstaller.harness).toBe('codex')
    expect(stored.skillInstaller.installPath).toBe(path.join(skillHomeDir, '.codex', 'skills', 'jiminy'))
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

    const wizardStep2 = window.locator('[data-wizard-step="2"]')
    await wizardStep2.locator('[data-processing-engine-mode="llm"]').click()
    await window.locator('#wizard-llm-provider').selectOption('openai')
    await window.locator('#wizard-llm-api-key').fill('persisted-key')
    await window.locator('#wizard-llm-api-key').blur()
    await expect(window.locator('#wizard-llm-api-key-status')).toHaveText('Saved.')

    await backButton.click()
    await expect(window.locator('[data-wizard-step="1"]')).toBeVisible()
    await expect(window.locator('#wizard-context-folder-path')).toHaveValue(path.resolve(contextPath))

    await nextButton.click()
    await expect(window.locator('[data-wizard-step="2"]')).toBeVisible()
    await expect(window.locator('[data-wizard-step="2"] [data-processing-engine-panel="llm"]')).toBeVisible()
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

    // Default mode is Local, so step 2 is complete by default.
    await expect(nextButton).toBeEnabled()

    // Cloud mode should require provider + saved key.
    const wizardStep2 = window.locator('[data-wizard-step="2"]')
    await wizardStep2.locator('[data-processing-engine-mode="llm"]').click()
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

    const wizardStep2 = window.locator('[data-wizard-step="2"]')
    await wizardStep2.locator('[data-processing-engine-mode="llm"]').click()

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
    await expect(window.locator('#wizard-recording-hotkey')).toBeHidden()
  } finally {
    await (await electronApp).close()
  }
})
