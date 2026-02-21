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
  if (process.platform === 'linux') {
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

  const permission = await window.evaluate(() => window.familiar.checkScreenRecordingPermission())
  expect(permission?.permissionStatus).toBe('granted')

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
  const wizardStepThree = window.locator('[data-wizard-step="3"]')
  const codexHarnessOption = wizardStepThree.locator('.skill-picker-option', { hasText: 'Codex' })
  const codexHarness = wizardStepThree.locator('input[name="wizard-skill-harness"][value="codex"]')

  await expect(wizardStepThree).toBeVisible()
  if (!(await codexHarness.isChecked())) {
    await codexHarnessOption.click()
  }
  await expect(skillInstallButton).toBeEnabled()
  await skillInstallButton.click()
  await expect(skillStatus).toContainText('Installed')
}

const openCloudCoWorkGuide = async (window) => {
  const wizardStepThree = window.locator('[data-wizard-step="3"]')
  const skillInstallButton = window.locator('#wizard-skill-install')
  const skillStatus = window.locator('#wizard-skill-status')
  const cloudCoWorkOption = wizardStepThree.locator('.skill-picker-option', { hasText: 'Cloud Cowork' })
  const cloudCoWorkHarness = wizardStepThree.locator('input[name="wizard-skill-harness"][value="cloud-cowork"]')
  const guideContainer = window.locator('#wizard-cloud-cowork-guide')
  const guideDoneButton = window.locator('#wizard-cloud-cowork-done')

  await expect(wizardStepThree).toBeVisible()
  if (!(await cloudCoWorkHarness.isChecked())) {
    await cloudCoWorkOption.click()
  }

  await expect(skillInstallButton).toBeEnabled()
  await skillInstallButton.click()

  await expect(guideContainer).toBeVisible()
  await expect(guideContainer).toContainText('Add marketplace from Github')
  await expect(guideContainer).toContainText(
    'https://github.com/familiar-software/familiar-claude-cowork-skill'
  )
  await expect(skillStatus).toContainText('Opened Cloud Cowork guide.')
  await expect(skillStatus).not.toContainText('Installed at')
  await expect(guideDoneButton).toBeVisible()
  await guideDoneButton.click()
  await expect(guideContainer).toBeHidden()
}

const expectInstallRequiredToAdvance = async (window, nextButton) => {
  const wizardStepThree = window.locator('[data-wizard-step="3"]')
  const codexHarnessOption = wizardStepThree.locator('.skill-picker-option', { hasText: 'Codex' })
  const codexHarness = wizardStepThree.locator('input[name="wizard-skill-harness"][value="codex"]')

  await expect(wizardStepThree).toBeVisible()
  if (!(await codexHarness.isChecked())) {
    await codexHarnessOption.click()
  }

  await expect(nextButton).toBeDisabled()
  await expect(window.locator('#wizard-skill-status')).not.toContainText('Installed')
}

const goToFinalWizardStep = async (window, nextButton) => {
  await expect(window.locator('[data-wizard-step="3"]')).toBeVisible()
  await expect(nextButton).toBeEnabled()
  await nextButton.click()
  await expect(window.locator('[data-wizard-step="4"]')).toBeVisible()
}

test('wizard happy flow completes setup and routes to Storage', async () => {
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
    await goToFinalWizardStep(window, nextButton)
    await expect(doneButton).toBeEnabled()
    await doneButton.click()

    await expect(window.locator('#section-title')).toHaveText('Storage')

    const settingsPath = path.join(settingsDir, 'settings.json')
    const stored = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
    expect(stored.contextFolderPath).toBe(path.resolve(contextPath))
    expect(stored.stills_markdown_extractor?.type ?? 'apple_vision_ocr').toBe('apple_vision_ocr')
    expect(stored.alwaysRecordWhenActive ?? false).toBe(true)
    expect(stored.wizardCompleted).toBe(true)
    expect(stored.skillInstaller.harness).toEqual(['codex'])
    expect(stored.skillInstaller.installPath).toEqual([path.join(skillHomeDir, '.codex', 'skills', 'familiar')])
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

test('wizard install step requires skill installation before continuing', async () => {
  const appRoot = path.join(__dirname, '../..')
  const contextPath = path.join(appRoot, 'test', 'fixtures', 'context')
  const { electronApp } = launchElectron({
    contextPath,
    env: { FAMILIAR_LLM_MOCK: '1', FAMILIAR_LLM_MOCK_TEXT: 'gibberish' }
  })

  try {
    const window = await (await electronApp).firstWindow()
    await window.waitForLoadState('domcontentloaded')

    const nextButton = window.locator('#wizard-next')

    await window.locator('#wizard-context-folder-choose').click()
    await expect(window.locator('#wizard-context-folder-path')).toHaveValue(path.resolve(contextPath))
    await nextButton.click()

    await expect(window.locator('[data-wizard-step="2"]')).toBeVisible()
    await completeWizardPermissionsStep(window, nextButton)
    await expect(window.locator('[data-wizard-step="3"]')).toBeVisible()

    await expectInstallRequiredToAdvance(window, nextButton)
    await expect(window.locator('[data-wizard-step="3"]')).toBeVisible()

    await installWizardSkill(window)
    await expect(nextButton).toBeEnabled()
    await nextButton.click()
    await expect(window.locator('[data-wizard-step="4"]')).toBeVisible()
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

    await goToFinalWizardStep(window, nextButton)
    await expect(doneButton).toBeEnabled()
    await doneButton.click()

    await expect(window.locator('#section-title')).toHaveText('Storage')
    await expect(window.getByRole('tab', { name: 'Wizard' })).toBeHidden()
    await expect(window.locator('[data-wizard-step="1"]')).toBeHidden()
  } finally {
    await (await electronApp).close()
  }
})

test('wizard cloud co-work path opens marketplace guide and does not use local install path messaging', async () => {
  const appRoot = path.join(__dirname, '../..')
  const contextPath = path.join(appRoot, 'test', 'fixtures', 'context')
  const { electronApp, settingsDir } = launchElectron({
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
    await completeWizardPermissionsStep(window, nextButton)
    await expect(window.locator('[data-wizard-step="3"]')).toBeVisible()

    await openCloudCoWorkGuide(window)
    await expect(nextButton).toBeEnabled()
    await nextButton.click()
    await expect(window.locator('[data-wizard-step="4"]')).toBeVisible()

    const settingsPath = path.join(settingsDir, 'settings.json')
    const stored = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
    expect(stored.skillInstaller?.harness ?? []).toEqual([])
    expect(stored.skillInstaller?.installPath ?? []).toEqual([])
  } finally {
    await (await electronApp).close()
  }
})
