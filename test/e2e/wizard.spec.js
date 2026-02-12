const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { test, expect } = require('playwright/test')
const { _electron: electron } = require('playwright')

const launchElectron = (options = {}) => {
  const appRoot = path.join(__dirname, '../..')
  const settingsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-settings-e2e-'))
  const skillHomeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-skill-home-e2e-'))
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
        FAMILIAR_E2E: '1',
        FAMILIAR_E2E_CONTEXT_PATH: options.contextPath,
        FAMILIAR_SETTINGS_DIR: settingsDir,
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
  await expect(nextButton).toBeDisabled()
  await checkPermissionsButton.click()

  if ((await checkPermissionsButton.textContent()) !== 'Granted') {
    const permission = await window.evaluate(() => window.familiar.checkScreenRecordingPermission())
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

const installWizardSkill = async (window) => {
  const skillInstallButton = window.locator('#wizard-skill-install')
  const skillStatus = window.locator('#wizard-skill-status')
  const codexHarness = window.locator('input[name="wizard-skill-harness"][value="codex"]')

  await expect(window.locator('[data-wizard-step="3"]')).toBeVisible()
  await codexHarness.check()
  await expect(skillInstallButton).toBeEnabled()
  await skillInstallButton.click()
  await expect(skillStatus).toContainText('Installed')
}

test('wizard happy flow completes setup and routes to General', async () => {
  const appRoot = path.join(__dirname, '../..')
  const contextPath = path.join(appRoot, 'test', 'fixtures', 'context')
  const { electronApp, settingsDir, skillHomeDir } = launchElectron({
    contextPath,
    env: { FAMILIAR_LLM_MOCK: '1', FAMILIAR_LLM_MOCK_TEXT: 'gibberish' }
  })

  try {
    const window = await (await electronApp).firstWindow()
    await window.waitForLoadState('domcontentloaded')

    await expect(window.locator('[data-wizard-step="1"]')).toBeVisible()
    await expect(window.locator('#wizard-llm-provider')).toHaveCount(0)

    const nextButton = window.locator('#wizard-next')
    const doneButton = window.locator('#wizard-done')
    await expect(nextButton).toBeDisabled()

    await window.locator('#wizard-context-folder-choose').click()
    await expect(window.locator('#wizard-context-folder-path')).toHaveValue(path.resolve(contextPath))
    await expect(nextButton).toBeEnabled()

    await nextButton.click()
    await expect(window.locator('[data-wizard-step="2"]')).toBeVisible()
    await completeWizardPermissionsStep(window, nextButton)

    await installWizardSkill(window)
    await expect(doneButton).toBeEnabled()
    await doneButton.click()

    await expect(window.locator('#section-title')).toHaveText('General Settings')

    const settingsPath = path.join(settingsDir, 'settings.json')
    const stored = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
    expect(stored.contextFolderPath).toBe(path.resolve(contextPath))
    expect(stored.stills_markdown_extractor?.type ?? 'apple_vision_ocr').toBe('apple_vision_ocr')
    expect(stored.alwaysRecordWhenActive ?? false).toBe(true)
    expect(stored.wizardCompleted).toBe(true)
    expect(stored.skillInstaller.harness).toBe('codex')
    expect(stored.skillInstaller.installPath).toBe(path.join(skillHomeDir, '.codex', 'skills', 'familiar'))
  } finally {
    await (await electronApp).close()
  }
})

test('wizard permission step requires enabling recording', async () => {
  const appRoot = path.join(__dirname, '../..')
  const contextPath = path.join(appRoot, 'test', 'fixtures', 'context')
  const { electronApp } = launchElectron({
    contextPath,
    env: { FAMILIAR_LLM_MOCK: '1', FAMILIAR_LLM_MOCK_TEXT: 'gibberish' }
  })

  try {
    const window = await (await electronApp).firstWindow()
    await window.waitForLoadState('domcontentloaded')

    await window.locator('#wizard-context-folder-choose').click()

    const nextButton = window.locator('#wizard-next')
    await nextButton.click()
    await expect(window.locator('[data-wizard-step="2"]')).toBeVisible()

    await expect(nextButton).toBeDisabled()

    await completeWizardPermissionsStep(window, nextButton)
    await expect(window.locator('[data-wizard-step="3"]')).toBeVisible()
  } finally {
    await (await electronApp).close()
  }
})

test('wizard hides wizard tab after Done', async () => {
  const appRoot = path.join(__dirname, '../..')
  const contextPath = path.join(appRoot, 'test', 'fixtures', 'context')
  const { electronApp } = launchElectron({
    contextPath,
    env: { FAMILIAR_LLM_MOCK: '1', FAMILIAR_LLM_MOCK_TEXT: 'gibberish' }
  })

  try {
    const window = await (await electronApp).firstWindow()
    await window.waitForLoadState('domcontentloaded')

    await window.locator('#wizard-context-folder-choose').click()
    const nextButton = window.locator('#wizard-next')
    const doneButton = window.locator('#wizard-done')

    await nextButton.click()
    await expect(window.locator('[data-wizard-step="2"]')).toBeVisible()

    await completeWizardPermissionsStep(window, nextButton)
    await installWizardSkill(window)

    await expect(doneButton).toBeEnabled()
    await doneButton.click()

    await expect(window.locator('#section-title')).toHaveText('General Settings')
    await expect(window.getByRole('tab', { name: 'Wizard' })).toBeHidden()
    await expect(window.locator('[data-wizard-step="1"]')).toBeHidden()
  } finally {
    await (await electronApp).close()
  }
})
