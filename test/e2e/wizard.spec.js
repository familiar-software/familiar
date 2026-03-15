const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { test, expect } = require('playwright/test')
const { _electron: electron } = require('playwright')
const { getMicrocopyValue } = require('../../src/microcopy')
const {
  CLOUD_COWORK_GUIDE_URL
} = require('../../src/dashboard/components/dashboard/dashboardConstants')

const microcopyText = (copyPath) => {
  const value = getMicrocopyValue(copyPath)
  if (typeof value !== 'string') {
    throw new Error(`Expected string microcopy at ${copyPath}`)
  }
  return value
}

const copy = Object.freeze({
  storageTitle: microcopyText('dashboard.sections.storage.title'),
  wizardSectionTitle: microcopyText('dashboard.sections.wizard.title'),
  wizardHeaderTitle: microcopyText('dashboard.html.wizardHeaderTitle'),
  wizardHeaderSubtitle: microcopyText('dashboard.html.wizardHeaderSubtitle'),
  wizardStepContext: microcopyText('dashboard.html.wizardStepContext'),
  wizardStepPermissions: microcopyText('dashboard.html.wizardStepPermissions'),
  wizardStepInstallSkill: microcopyText('dashboard.html.wizardStepInstallSkill'),
  wizardStepComplete: microcopyText('dashboard.html.wizardStepComplete'),
  wizardChooseContextFolderTitle: microcopyText('dashboard.html.wizardChooseContextFolderTitle'),
  wizardChooseContextFolderDescription: microcopyText('dashboard.html.wizardChooseContextFolderDescription'),
  wizardChooseContextFolderBestPracticesLabel: microcopyText('dashboard.html.wizardChooseContextFolderBestPracticesLabel'),
  wizardChooseContextFolderBestPractices: microcopyText('dashboard.html.wizardChooseContextFolderBestPractices'),
  wizardContextFolder: microcopyText('dashboard.html.wizardContextFolder'),
  wizardContextFolderSetCta: microcopyText('dashboard.html.wizardContextFolderSetCta'),
  wizardContextFolderChange: microcopyText('dashboard.html.wizardContextFolderChange'),
  wizardEnableCapturingTitle: microcopyText('dashboard.html.wizardEnableCapturingTitle'),
  wizardEnableCapturingDescription: microcopyText('dashboard.html.wizardEnableCapturingDescription'),
  wizardCheckPermissions: microcopyText('dashboard.settingsActions.checkPermissions'),
  wizardInstallSkillTitle: microcopyText('dashboard.html.wizardInstallSkillTitle'),
  wizardInstallSkillDescription: microcopyText('dashboard.html.wizardInstallSkillDescription'),
  wizardHarnessClaudeCode: microcopyText('dashboard.html.wizardHarnessClaudeCode'),
  wizardHarnessClaudeCowork: microcopyText('dashboard.html.wizardHarnessClaudeCowork'),
  wizardHarnessCodex: microcopyText('dashboard.html.wizardHarnessCodex'),
  wizardHarnessAntigravity: microcopyText('dashboard.html.wizardHarnessAntigravity'),
  wizardHarnessCursor: microcopyText('dashboard.html.wizardHarnessCursor'),
  wizardClaudeCoworkGuideStep7: microcopyText('dashboard.html.wizardClaudeCoworkGuideStep7'),
  wizardClaudeCoworkGuideStep8: microcopyText('dashboard.html.wizardClaudeCoworkGuideStep8'),
  wizardAllSetTitle: microcopyText('dashboard.html.wizardAllSetTitle'),
  wizardAllSetDescription: microcopyText('dashboard.html.wizardAllSetDescription'),
  wizardFaqTitle: microcopyText('dashboard.html.wizardFaqTitle'),
  wizardFaqScrollHint: microcopyText('dashboard.html.wizardFaqScrollHint'),
  wizardFaqQuestionSensitiveData: microcopyText('dashboard.html.wizardFaqQuestionSensitiveData'),
  wizardBack: microcopyText('dashboard.html.wizardBack'),
  wizardNext: microcopyText('dashboard.html.wizardNext'),
  wizardDone: microcopyText('dashboard.html.wizardDone'),
  wizardSkillInstalled: microcopyText('dashboard.wizardSkill.messages.installed'),
  wizardSkillInstalledAtTemplate: microcopyText('dashboard.wizardSkill.messages.installedAtTemplate'),
  wizardSkillOpenedClaudeCoworkGuide: microcopyText('dashboard.wizardSkill.messages.openedClaudeCoworkGuide')
})

const wizardSkillInstalledAtPrefix = copy.wizardSkillInstalledAtTemplate.split('{{path}}')[0].trimEnd()

const launchElectron = (options = {}) => {
  const appRoot = path.join(__dirname, '../..')
  const settingsDir = options.settingsDir ?? fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-settings-e2e-'))
  const skillHomeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-skill-home-e2e-'))
  if (options.initialSettings) {
    fs.writeFileSync(path.join(settingsDir, 'settings.json'), JSON.stringify(options.initialSettings, null, 2))
  }
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

const expectWizardChrome = async (window) => {
  await expect(window.locator('#section-wizard')).toContainText(copy.wizardHeaderTitle)
  await expect(window.locator('#section-wizard')).toContainText(copy.wizardHeaderSubtitle)
  await expect(window.locator('[data-wizard-step-label="1"]')).toHaveText(copy.wizardStepContext)
  await expect(window.locator('[data-wizard-step-label="2"]')).toHaveText(copy.wizardStepPermissions)
  await expect(window.locator('[data-wizard-step-label="3"]')).toHaveText(copy.wizardStepInstallSkill)
  await expect(window.locator('[data-wizard-step-label="4"]')).toHaveText(copy.wizardStepComplete)
  await expect(window.locator('#wizard-back')).toContainText(copy.wizardBack)
}

const expectWizardContextStepCopy = async (window, { hasContextFolder }) => {
  const wizardStepOne = window.locator('[data-wizard-step="1"]')

  await expect(wizardStepOne).toBeVisible()
  await expect(wizardStepOne).toContainText(copy.wizardChooseContextFolderTitle)
  await expect(wizardStepOne).toContainText(copy.wizardChooseContextFolderDescription)
  await expect(wizardStepOne).toContainText(copy.wizardChooseContextFolderBestPracticesLabel)
  await expect(wizardStepOne).toContainText(copy.wizardChooseContextFolderBestPractices)
  if (hasContextFolder) {
    await expect(window.locator('#wizard-context-folder-choose')).toContainText(copy.wizardContextFolderChange)
    return
  }
  await expect(window.locator('#wizard-context-folder-path')).toHaveCount(0)
  await expect(window.locator('#wizard-context-folder-choose')).toContainText(copy.wizardContextFolderSetCta)
}

const expectWizardPermissionsStepCopy = async (window) => {
  const wizardStepTwo = window.locator('[data-wizard-step="2"]')

  await expect(wizardStepTwo).toBeVisible()
  await expect(wizardStepTwo).toContainText(copy.wizardEnableCapturingTitle)
  await expect(wizardStepTwo).toContainText(copy.wizardEnableCapturingDescription)
  await expect(window.locator('#wizard-check-permissions')).toContainText(copy.wizardCheckPermissions)
}

const expectWizardSkillsStepCopy = async (window) => {
  const wizardStepThree = window.locator('[data-wizard-step="3"]')

  await expect(wizardStepThree).toBeVisible()
  await expect(wizardStepThree).toContainText(copy.wizardInstallSkillTitle)
  await expect(wizardStepThree).toContainText(copy.wizardInstallSkillDescription)
  await expect(wizardStepThree).toContainText(copy.wizardHarnessClaudeCode)
  await expect(wizardStepThree).toContainText(copy.wizardHarnessClaudeCowork)
  await expect(wizardStepThree).toContainText(copy.wizardHarnessCodex)
  await expect(wizardStepThree).toContainText(copy.wizardHarnessAntigravity)
  await expect(wizardStepThree).toContainText(copy.wizardHarnessCursor)
}

const expectWizardCompleteStepCopy = async (window, doneButton) => {
  const wizardStepFour = window.locator('[data-wizard-step="4"]')

  await expect(wizardStepFour).toBeVisible()
  await expect(wizardStepFour).toContainText(copy.wizardAllSetTitle)
  await expect(wizardStepFour).toContainText(copy.wizardAllSetDescription)
  await expect(wizardStepFour).toContainText(copy.wizardFaqTitle)
  await expect(wizardStepFour).toContainText(copy.wizardFaqScrollHint)
  await expect(wizardStepFour).toContainText(copy.wizardFaqQuestionSensitiveData)
  await expect(doneButton).toContainText(copy.wizardDone)
}

const completeWizardPermissionsStep = async (window, nextButton) => {
  const checkPermissionsButton = window.locator('#wizard-check-permissions')

  await expectWizardPermissionsStepCopy(window)
  await expect(checkPermissionsButton).toBeVisible()
  await expect(nextButton).toBeDisabled()
  await checkPermissionsButton.click()

  const permission = await window.evaluate(() => window.familiar.checkScreenRecordingPermission())
  expect(permission?.permissionStatus).toBe('granted')

  await expect(window.locator('#wizard-recording-toggle-section')).toBeHidden()
  await expect(nextButton).toBeEnabled()
  await nextButton.click()
}

const installWizardSkill = async (window) => {
  const skillStatus = window.locator('#wizard-skill-status')
  const wizardStepThree = window.locator('[data-wizard-step="3"]')
  const codexHarnessOption = wizardStepThree.locator('.skill-picker-option', { hasText: copy.wizardHarnessCodex })
  const codexHarness = wizardStepThree.locator('input[name="wizard-skill-harness"][value="codex"]')

  await expectWizardSkillsStepCopy(window)
  await expect(wizardStepThree).toBeVisible()
  if (!(await codexHarness.isChecked())) {
    await codexHarnessOption.click()
  }
  await expect(skillStatus).toContainText(wizardSkillInstalledAtPrefix)
}

const openClaudeCoworkGuide = async (window) => {
  const wizardStepThree = window.locator('[data-wizard-step="3"]')
  const skillStatus = window.locator('#wizard-skill-status')
  const claudeCoworkOption = wizardStepThree.locator('.skill-picker-option', { hasText: copy.wizardHarnessClaudeCowork })
  const claudeCoworkHarness = wizardStepThree.locator('input[name="wizard-skill-harness"][value="cloud-cowork"]')
  const guideContainer = window.locator('#wizard-cloud-cowork-guide')
  const guideDoneButton = window.locator('#wizard-cloud-cowork-done')

  await expectWizardSkillsStepCopy(window)
  await expect(wizardStepThree).toBeVisible()
  if (!(await claudeCoworkHarness.isChecked())) {
    await claudeCoworkOption.click()
  }

  await expect(guideContainer).toBeVisible()
  await expect(guideContainer).toContainText(copy.wizardClaudeCoworkGuideStep7)
  await expect(guideContainer).toContainText(copy.wizardClaudeCoworkGuideStep8)
  await expect(guideContainer).toContainText(CLOUD_COWORK_GUIDE_URL)
  await expect(skillStatus).toContainText(copy.wizardSkillOpenedClaudeCoworkGuide)
  await expect(skillStatus).not.toContainText(wizardSkillInstalledAtPrefix)
  await expect(guideDoneButton).toBeVisible()
  await guideDoneButton.click()
  await expect(guideContainer).toBeHidden()
}

const expectAutoInstallAllowsAdvance = async (window, nextButton) => {
  const wizardStepThree = window.locator('[data-wizard-step="3"]')
  const codexHarnessOption = wizardStepThree.locator('.skill-picker-option', { hasText: copy.wizardHarnessCodex })
  const codexHarness = wizardStepThree.locator('input[name="wizard-skill-harness"][value="codex"]')

  await expectWizardSkillsStepCopy(window)
  await expect(wizardStepThree).toBeVisible()
  if (!(await codexHarness.isChecked())) {
    await codexHarnessOption.click()
  }

  await expect(window.locator('#wizard-skill-status')).toContainText(wizardSkillInstalledAtPrefix)
  await expect(nextButton).toBeEnabled()
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
  const expectedDisplayPath = path.join(path.resolve(contextPath), 'familiar')
  const { electronApp, settingsDir, skillHomeDir } = launchElectron({
    contextPath,
    env: { FAMILIAR_LLM_MOCK: '1', FAMILIAR_LLM_MOCK_TEXT: 'gibberish' }
  })

  try {
    const window = await (await electronApp).firstWindow()
    await window.waitForLoadState('domcontentloaded')

    await expectWizardChrome(window)
    await expect(window.locator('#wizard-llm-provider')).toHaveCount(0)
    await expectWizardContextStepCopy(window, { hasContextFolder: false })

    const nextButton = window.locator('#wizard-next')
    const doneButton = window.locator('#wizard-done')
    await expect(nextButton).toContainText(copy.wizardNext)
    await expect(nextButton).toBeDisabled()

    await window.locator('#wizard-context-folder-choose').click()
    await expectWizardContextStepCopy(window, { hasContextFolder: true })
    await expect(window.locator('#wizard-context-folder-path')).toHaveValue(expectedDisplayPath)
    await expect(nextButton).toBeEnabled()

    await nextButton.click()
    await expectWizardPermissionsStepCopy(window)
    await completeWizardPermissionsStep(window, nextButton)

    await installWizardSkill(window)
    await goToFinalWizardStep(window, nextButton)
    await expectWizardCompleteStepCopy(window, doneButton)
    await expect(doneButton).toBeEnabled()
    await doneButton.click()

    await expect(window.locator('#section-title')).toHaveText(copy.storageTitle)

    const settingsPath = path.join(settingsDir, 'settings.json')
    const stored = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
    expect(stored.contextFolderPath).toBe(path.resolve(contextPath))
    expect(stored.alwaysRecordWhenActive ?? false).toBe(true)
    expect(stored.wizardCompleted).toBe(true)
    expect(stored.skillInstaller.harness).toEqual(['codex'])
    expect(stored.skillInstaller.installPath).toEqual([path.join(skillHomeDir, '.codex', 'skills', 'familiar')])
  } finally {
    await (await electronApp).close()
  }
})

test('wizard permission step auto-enables capture after permissions are granted', async () => {
  const appRoot = path.join(__dirname, '../..')
  const contextPath = path.join(appRoot, 'test', 'fixtures', 'context')
  const expectedDisplayPath = path.join(path.resolve(contextPath), 'familiar')
  const { electronApp } = launchElectron({
    contextPath,
    env: { FAMILIAR_LLM_MOCK: '1', FAMILIAR_LLM_MOCK_TEXT: 'gibberish' }
  })

  try {
    const window = await (await electronApp).firstWindow()
    await window.waitForLoadState('domcontentloaded')

    await expectWizardChrome(window)
    await expectWizardContextStepCopy(window, { hasContextFolder: false })
    await window.locator('#wizard-context-folder-choose').click()
    await expectWizardContextStepCopy(window, { hasContextFolder: true })

    const nextButton = window.locator('#wizard-next')
    await nextButton.click()
    await expectWizardPermissionsStepCopy(window)

    await expect(nextButton).toBeDisabled()

    await completeWizardPermissionsStep(window, nextButton)
    await expect(window.locator('[data-wizard-step="3"]')).toBeVisible()
  } finally {
    await (await electronApp).close()
  }
})

test('wizard reopens on permissions step when context folder is already configured', async () => {
  const appRoot = path.join(__dirname, '../..')
  const contextPath = path.join(appRoot, 'test', 'fixtures', 'context')
  const { electronApp } = launchElectron({
    contextPath,
    initialSettings: {
      contextFolderPath: path.resolve(contextPath),
      wizardCompleted: false
    },
    env: { FAMILIAR_LLM_MOCK: '1', FAMILIAR_LLM_MOCK_TEXT: 'gibberish' }
  })

  try {
    const window = await (await electronApp).firstWindow()
    await window.waitForLoadState('domcontentloaded')

    await expect(window.locator('[data-wizard-step="1"]')).toBeHidden()
    await expectWizardChrome(window)
    await expectWizardPermissionsStepCopy(window)
    await expect(window.locator('#wizard-context-folder-path')).toBeHidden()
    await expect(window.locator('#wizard-check-permissions')).toBeVisible()
  } finally {
    await (await electronApp).close()
  }
})

test('wizard install step auto-installs selected harness and allows continuing', async () => {
  const appRoot = path.join(__dirname, '../..')
  const contextPath = path.join(appRoot, 'test', 'fixtures', 'context')
  const expectedDisplayPath = path.join(path.resolve(contextPath), 'familiar')
  const { electronApp } = launchElectron({
    contextPath,
    env: { FAMILIAR_LLM_MOCK: '1', FAMILIAR_LLM_MOCK_TEXT: 'gibberish' }
  })

  try {
    const window = await (await electronApp).firstWindow()
    await window.waitForLoadState('domcontentloaded')

    await expectWizardChrome(window)
    const nextButton = window.locator('#wizard-next')

    await window.locator('#wizard-context-folder-choose').click()
    await expectWizardContextStepCopy(window, { hasContextFolder: true })
    await expect(window.locator('#wizard-context-folder-path')).toHaveValue(expectedDisplayPath)
    await nextButton.click()

    await expectWizardPermissionsStepCopy(window)
    await completeWizardPermissionsStep(window, nextButton)
    await expectWizardSkillsStepCopy(window)

    await expectAutoInstallAllowsAdvance(window, nextButton)
    await expect(window.locator('[data-wizard-step="3"]')).toBeVisible()
    await expect(nextButton).toBeEnabled()
    await nextButton.click()
    await expectWizardCompleteStepCopy(window, window.locator('#wizard-done'))
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

    await expectWizardChrome(window)
    await expectWizardContextStepCopy(window, { hasContextFolder: false })
    await window.locator('#wizard-context-folder-choose').click()
    await expectWizardContextStepCopy(window, { hasContextFolder: true })
    const nextButton = window.locator('#wizard-next')
    const doneButton = window.locator('#wizard-done')

    await nextButton.click()
    await expectWizardPermissionsStepCopy(window)

    await completeWizardPermissionsStep(window, nextButton)
    await installWizardSkill(window)

    await goToFinalWizardStep(window, nextButton)
    await expectWizardCompleteStepCopy(window, doneButton)
    await expect(doneButton).toBeEnabled()
    await doneButton.click()

    await expect(window.locator('#section-title')).toHaveText(copy.storageTitle)
    await expect(window.getByRole('tab', { name: copy.wizardSectionTitle })).toBeHidden()
    await expect(window.locator('[data-wizard-step="1"]')).toBeHidden()
  } finally {
    await (await electronApp).close()
  }
})

test('wizard Claude Cowork path opens marketplace guide and does not use local install path messaging', async () => {
  const appRoot = path.join(__dirname, '../..')
  const contextPath = path.join(appRoot, 'test', 'fixtures', 'context')
  const { electronApp, settingsDir } = launchElectron({
    contextPath,
    env: { FAMILIAR_LLM_MOCK: '1', FAMILIAR_LLM_MOCK_TEXT: 'gibberish' }
  })

  try {
    const window = await (await electronApp).firstWindow()
    await window.waitForLoadState('domcontentloaded')

    await expectWizardChrome(window)
    await expectWizardContextStepCopy(window, { hasContextFolder: false })
    await window.locator('#wizard-context-folder-choose').click()
    await expectWizardContextStepCopy(window, { hasContextFolder: true })
    const nextButton = window.locator('#wizard-next')

    await nextButton.click()
    await expectWizardPermissionsStepCopy(window)
    await completeWizardPermissionsStep(window, nextButton)
    await expectWizardSkillsStepCopy(window)

    await openClaudeCoworkGuide(window)
    await expect(nextButton).toBeEnabled()
    await nextButton.click()
    await expectWizardCompleteStepCopy(window, window.locator('#wizard-done'))

    const settingsPath = path.join(settingsDir, 'settings.json')
    const stored = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
    expect(stored.skillInstaller?.harness ?? []).toEqual([])
    expect(stored.skillInstaller?.installPath ?? []).toEqual([])
  } finally {
    await (await electronApp).close()
  }
})

test('launching with wizardCompleted true skips wizard tab and starts on storage', async () => {
  const appRoot = path.join(__dirname, '../..')
  const contextPath = path.join(appRoot, 'test', 'fixtures', 'context')
  const settingsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-settings-e2e-'))

  const { electronApp } = launchElectron({
    contextPath,
    settingsDir,
    initialSettings: {
      wizardCompleted: true,
      contextFolderPath: path.resolve(contextPath)
    },
    env: { FAMILIAR_LLM_MOCK: '1', FAMILIAR_LLM_MOCK_TEXT: 'gibberish' }
  })

  try {
    const window = await (await electronApp).firstWindow()
    await window.waitForLoadState('domcontentloaded')

    await expect(window.locator('#section-title')).toHaveText(copy.storageTitle)
    await expect(window.getByRole('tab', { name: copy.wizardSectionTitle })).toBeHidden()
    await expect(window.locator('[data-wizard-step="1"]')).toBeHidden()
  } finally {
    await (await electronApp).close()
  }
})
