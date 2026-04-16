const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { test, expect } = require('playwright/test')
const { _electron: electron } = require('playwright')
const { getMicrocopyValue } = require('../../src/microcopy')

const microcopyText = (copyPath) => {
  const value = getMicrocopyValue(copyPath)
  if (typeof value !== 'string') {
    throw new Error(`Expected string microcopy at ${copyPath}`)
  }
  return value
}

// Step numbering follows the new wizard order (see dashboardWizardRules.cjs):
//   1 = Permissions, 2 = Context, 3 = Agents, 4 = Try it, 5 = Automate.
// Legacy tests pre-swap had Context at 1 and Permissions at 2.
const copy = Object.freeze({
  storageTitle: microcopyText('dashboard.sections.storage.title'),
  wizardSectionTitle: microcopyText('dashboard.sections.wizard.title'),
  wizardStepPermissions: microcopyText('dashboard.html.wizardStepPermissions'),
  wizardStepContext: microcopyText('dashboard.html.wizardStepContext'),
  wizardStepInstallSkill: microcopyText('dashboard.html.wizardStepInstallSkill'),
  wizardStepFirstUsecase: microcopyText('dashboard.html.wizardStepFirstUsecase'),
  wizardStepComplete: microcopyText('dashboard.html.wizardStepComplete'),
  wizardChooseContextFolderTitle: microcopyText('dashboard.html.wizardChooseContextFolderTitle'),
  wizardContextFolderShowInFinder: microcopyText('dashboard.html.wizardContextFolderShowInFinder'),
  wizardContextFolderAdvanced: microcopyText('dashboard.html.wizardContextFolderAdvanced'),
  wizardContextFolderChange: microcopyText('dashboard.html.wizardContextFolderChange'),
  wizardEnableCapturingTitle: microcopyText('dashboard.html.wizardEnableCapturingTitle'),
  wizardEnableCapturingDescription: microcopyText('dashboard.html.wizardEnableCapturingDescription'),
  wizardPermissionGranted: microcopyText('dashboard.html.wizardPermissionGranted'),
  wizardPermissionOpenSettings: microcopyText('dashboard.html.wizardPermissionOpenSettings'),
  wizardInstallSkillTitle: microcopyText('dashboard.html.wizardInstallSkillTitle'),
  wizardInstallSkillDescription: microcopyText('dashboard.html.wizardInstallSkillDescription'),
  wizardHarnessClaudeCode: microcopyText('dashboard.html.wizardHarnessClaudeCode'),
  wizardHarnessCodex: microcopyText('dashboard.html.wizardHarnessCodex'),
  wizardHarnessAntigravity: microcopyText('dashboard.html.wizardHarnessAntigravity'),
  wizardHarnessCursor: microcopyText('dashboard.html.wizardHarnessCursor'),
  wizardFirstUsecaseTitle: microcopyText('dashboard.html.wizardFirstUsecaseTitle'),
  wizardFirstUsecaseCommand: microcopyText('dashboard.html.wizardFirstUsecaseCommand'),
  wizardTryItPinkySwear: microcopyText('dashboard.html.wizardTryItPinkySwear'),
  wizardAutomateTitle: microcopyText('dashboard.html.wizardAutomateTitle'),
  wizardDestMemory: microcopyText('dashboard.html.wizardDestMemory'),
  wizardDestSkills: microcopyText('dashboard.html.wizardDestSkills'),
  wizardDestKnowledgeBase: microcopyText('dashboard.html.wizardDestKnowledgeBase'),
  wizardDestManual: microcopyText('dashboard.html.wizardDestManual'),
  wizardBack: microcopyText('dashboard.html.wizardBack'),
  wizardNext: microcopyText('dashboard.html.wizardNext'),
  wizardDone: microcopyText('dashboard.html.wizardDone'),
  completeHeadline: microcopyText('dashboard.html.completeHeadline'),
  completeCloseLink: microcopyText('dashboard.html.completeCloseLink'),
  completeTryCommand: microcopyText('dashboard.html.completeTryCommand'),
  completeIdeasLinkLabel: microcopyText('dashboard.html.completeIdeasLinkLabel')
})

const launchElectronWithRetry = async (launchOptions) => {
  try {
    return await electron.launch(launchOptions)
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes('Process failed to launch')) {
      throw error
    }
    return electron.launch(launchOptions)
  }
}

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
    electronApp: launchElectronWithRetry({
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

// In E2E mode, the screen-recording permission is always reported as
// 'granted' (see src/screen-capture/permissions.js). useWizardPermissionFlow
// silent-checks on step-1 entry, fires onGranted -> saves
// alwaysRecordWhenActive=true, and flips its state machine to 'granted'.
// So on a fresh launch the user lands on step 1 with the green banner
// already visible and Next enabled.
const expectWizardChrome = async (window) => {
  await expect(window.locator('[data-wizard-step-label="1"]')).toHaveText(copy.wizardStepPermissions)
  await expect(window.locator('[data-wizard-step-label="2"]')).toHaveText(copy.wizardStepContext)
  await expect(window.locator('[data-wizard-step-label="3"]')).toHaveText(copy.wizardStepInstallSkill)
  await expect(window.locator('[data-wizard-step-label="4"]')).toHaveText(copy.wizardStepFirstUsecase)
  await expect(window.locator('[data-wizard-step-label="5"]')).toHaveText(copy.wizardStepComplete)
  await expect(window.locator('#wizard-back')).toContainText(copy.wizardBack)
}

const expectWizardPermissionsStepCopy = async (window) => {
  const wizardStepOne = window.locator('[data-wizard-step="1"]')

  await expect(wizardStepOne).toBeVisible()
  await expect(wizardStepOne).toContainText(copy.wizardEnableCapturingTitle)
  await expect(wizardStepOne).toContainText(copy.wizardEnableCapturingDescription)
}

const expectPermissionsGrantedBanner = async (window) => {
  await expect(window.locator('[data-permission-flow-state="granted"]')).toBeVisible()
  await expect(window.locator('[data-permission-flow-state="granted"]')).toContainText(copy.wizardPermissionGranted)
}

const completeWizardPermissionsStep = async (window, nextButton) => {
  await expectWizardPermissionsStepCopy(window)
  await expectPermissionsGrantedBanner(window)
  await expect(nextButton).toBeEnabled()
  await nextButton.click()
}

const expectWizardContextStepCopy = async (window) => {
  const wizardStepTwo = window.locator('[data-wizard-step="2"]')

  await expect(wizardStepTwo).toBeVisible()
  await expect(wizardStepTwo).toContainText(copy.wizardChooseContextFolderTitle)
  await expect(window.locator('#wizard-context-folder-show-in-finder')).toContainText(copy.wizardContextFolderShowInFinder)
}

// Context step auto-defaults to $HOME (handleApplyDefaultContextFolder) so
// the path field fills in on its own. Unless a test wants a specific
// fixture path, we just verify a non-empty value and advance.
const completeWizardContextStep = async (window, nextButton, { expectedDisplayPath } = {}) => {
  await expectWizardContextStepCopy(window)
  const pathInput = window.locator('#wizard-context-folder-path')
  if (expectedDisplayPath) {
    await expect(pathInput).toHaveValue(expectedDisplayPath)
  } else {
    await expect(pathInput).not.toHaveValue('')
  }
  await expect(nextButton).toBeEnabled()
  await nextButton.click()
}

const expectWizardSkillsStepCopy = async (window) => {
  const wizardStepThree = window.locator('[data-wizard-step="3"]')

  await expect(wizardStepThree).toBeVisible()
  await expect(wizardStepThree).toContainText(copy.wizardInstallSkillTitle)
  await expect(wizardStepThree).toContainText(copy.wizardInstallSkillDescription)
  await expect(wizardStepThree).toContainText(copy.wizardHarnessClaudeCode)
  await expect(wizardStepThree).toContainText(copy.wizardHarnessCodex)
  await expect(wizardStepThree).toContainText(copy.wizardHarnessAntigravity)
  await expect(wizardStepThree).toContainText(copy.wizardHarnessCursor)
}

// Step 3 is always-complete (installation is optional). Clicking a row
// runs the per-row installer; the row transitions to data-installed=true
// once installSkill resolves (min 1s spinner enforced in useDashboardSkills).
const installCodexHarness = async (window) => {
  const codexRow = window.locator('button[data-skill-harness="codex"]')
  await expect(codexRow).toBeVisible()
  await codexRow.click()
  await expect(codexRow).toHaveAttribute('data-installed', 'true', { timeout: 10000 })
}

const expectWizardFirstUsecaseStepCopy = async (window) => {
  const wizardStepFour = window.locator('[data-wizard-step="4"]')

  await expect(wizardStepFour).toBeVisible()
  await expect(wizardStepFour).toContainText(copy.wizardFirstUsecaseTitle)
  await expect(wizardStepFour).toContainText(copy.wizardFirstUsecaseCommand)
  await expect(wizardStepFour).toContainText(copy.wizardTryItPinkySwear)
  await expect(wizardStepFour.locator('#wizard-first-usecase-gif')).toBeVisible()
  await expect(wizardStepFour.locator('#wizard-first-usecase-gif')).toHaveAttribute('src', /familiar-first-usecase\.gif$/)
}

// Step 4 gates Next on the pinky-swear checkbox.
const completeWizardFirstUsecaseStep = async (window, nextButton) => {
  await expectWizardFirstUsecaseStepCopy(window)
  const wizardStepFour = window.locator('[data-wizard-step="4"]')
  await expect(nextButton).toBeDisabled()
  await wizardStepFour.locator('input[type="checkbox"]').first().check()
  await expect(nextButton).toBeEnabled()
  await nextButton.click()
}

const expectWizardAutomateStepCopy = async (window, doneButton) => {
  const wizardStepFive = window.locator('[data-wizard-step="5"]')

  await expect(wizardStepFive).toBeVisible()
  await expect(wizardStepFive).toContainText(copy.wizardAutomateTitle)
  await expect(wizardStepFive).toContainText(copy.wizardDestMemory)
  await expect(wizardStepFive).toContainText(copy.wizardDestSkills)
  await expect(wizardStepFive).toContainText(copy.wizardDestKnowledgeBase)
  await expect(wizardStepFive).toContainText(copy.wizardDestManual)
  await expect(doneButton).toContainText(copy.wizardDone)
}

// Step 5 gates Done on having at least one destination selected. Picking
// "Native memory" is the simplest (no follow-up folder picker).
const completeWizardAutomateStep = async (window, doneButton) => {
  await expectWizardAutomateStepCopy(window, doneButton)
  await expect(doneButton).toBeDisabled()
  await window.locator('[data-wizard-step="5"] button', { hasText: copy.wizardDestMemory }).click()
  await expect(doneButton).toBeEnabled()
  await doneButton.click()
}

// After Done, the full-window CompleteSection takes over. Sidebar is
// gone, no section-title header, just the "Success!" headline + inline
// links + owl-confetti canvas (skipped entirely in reduced-motion).
const expectCompleteSectionVisible = async (window) => {
  const complete = window.locator('#section-complete')
  await expect(complete).toBeVisible()
  await expect(complete).toContainText(copy.completeHeadline)
  await expect(complete).toContainText(copy.completeCloseLink)
  await expect(complete).toContainText(copy.completeTryCommand)
  await expect(complete).toContainText(copy.completeIdeasLinkLabel)
}

test('wizard happy flow completes setup and ends on the "You\'re all set" screen', async () => {
  const appRoot = path.join(__dirname, '../..')
  const contextPath = path.join(appRoot, 'test', 'fixtures', 'context')
  const { electronApp, settingsDir, skillHomeDir } = launchElectron({
    contextPath,
    env: { FAMILIAR_LLM_MOCK: '1', FAMILIAR_LLM_MOCK_TEXT: 'gibberish' }
  })

  try {
    const window = await (await electronApp).firstWindow()
    await window.waitForLoadState('domcontentloaded')

    await expectWizardChrome(window)

    const nextButton = window.locator('#wizard-next')
    const doneButton = window.locator('#wizard-done')
    await expect(nextButton).toContainText(copy.wizardNext)

    // Step 1: Permissions (auto-granted in E2E).
    await completeWizardPermissionsStep(window, nextButton)

    // Step 2: Context (auto-defaults to $HOME which maps to skillHomeDir in E2E).
    await completeWizardContextStep(window, nextButton)

    // Step 3: Agents (always-complete; still install codex to verify wiring).
    await expectWizardSkillsStepCopy(window)
    await installCodexHarness(window)
    await expect(nextButton).toBeEnabled()
    await nextButton.click()

    // Step 4: Try it (pinky-swear gated).
    await completeWizardFirstUsecaseStep(window, nextButton)

    // Step 5: Automate (destination-selection gated).
    await completeWizardAutomateStep(window, doneButton)

    // Post-wizard: CompleteSection full-window takeover.
    await expectCompleteSectionVisible(window)

    const settingsPath = path.join(settingsDir, 'settings.json')
    const stored = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
    expect(stored.wizardCompleted).toBe(true)
    expect(stored.alwaysRecordWhenActive ?? false).toBe(true)
    expect(stored.contextFolderPath).toBeTruthy()
    expect(stored.skillInstaller.harness).toEqual(['codex'])
    expect(stored.skillInstaller.installPath).toEqual([path.join(skillHomeDir, '.codex', 'skills', 'familiar')])
  } finally {
    await (await electronApp).close()
  }
})

test('wizard Permissions step auto-grants in E2E and enables capture', async () => {
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
    await expectWizardPermissionsStepCopy(window)
    await expectPermissionsGrantedBanner(window)

    const nextButton = window.locator('#wizard-next')
    await expect(nextButton).toBeEnabled()
    await nextButton.click()

    // Landing on step 2 proves step 1 is considered complete.
    await expect(window.locator('[data-wizard-step="2"]')).toBeVisible()

    const settingsPath = path.join(settingsDir, 'settings.json')
    const stored = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
    expect(stored.alwaysRecordWhenActive).toBe(true)
  } finally {
    await (await electronApp).close()
  }
})

test('resolveInitialWizardStep advances past already-complete steps on relaunch', async () => {
  const appRoot = path.join(__dirname, '../..')
  const contextPath = path.join(appRoot, 'test', 'fixtures', 'context')
  // Permissions + context already satisfied -> resolveInitialWizardStep
  // walks forward and lands on step 3 (Agents is always-complete but
  // contains actionable install rows, so it's where returning users park).
  const { electronApp } = launchElectron({
    contextPath,
    initialSettings: {
      contextFolderPath: path.resolve(contextPath),
      alwaysRecordWhenActive: true,
      wizardCompleted: false
    },
    env: { FAMILIAR_LLM_MOCK: '1', FAMILIAR_LLM_MOCK_TEXT: 'gibberish' }
  })

  try {
    const window = await (await electronApp).firstWindow()
    await window.waitForLoadState('domcontentloaded')

    await expectWizardChrome(window)
    await expect(window.locator('[data-wizard-step="1"]')).toBeHidden()
    await expect(window.locator('[data-wizard-step="2"]')).toBeHidden()
    // Step 3 (Agents) onward is always-complete; the initial resolver
    // therefore lands at the last step (5 / Automate).
    await expect(window.locator('[data-wizard-step="5"]')).toBeVisible()
  } finally {
    await (await electronApp).close()
  }
})

test('wizard Agents step installs codex via per-row click and keeps Next enabled', async () => {
  const appRoot = path.join(__dirname, '../..')
  const contextPath = path.join(appRoot, 'test', 'fixtures', 'context')
  const { electronApp } = launchElectron({
    contextPath,
    initialSettings: {
      contextFolderPath: path.resolve(contextPath),
      alwaysRecordWhenActive: true,
      wizardCompleted: false
    },
    env: { FAMILIAR_LLM_MOCK: '1', FAMILIAR_LLM_MOCK_TEXT: 'gibberish' }
  })

  try {
    const window = await (await electronApp).firstWindow()
    await window.waitForLoadState('domcontentloaded')

    // Back up from the auto-resolved final step to step 3.
    const nextButton = window.locator('#wizard-next')
    const backButton = window.locator('#wizard-back')
    while (!(await window.locator('[data-wizard-step="3"]').isVisible().catch(() => false))) {
      await backButton.click()
    }

    await expectWizardSkillsStepCopy(window)
    await installCodexHarness(window)
    await expect(nextButton).toBeEnabled()
  } finally {
    await (await electronApp).close()
  }
})

test('post-wizard CompleteSection is one-shot: Done -> complete; relaunch -> storage', async () => {
  const appRoot = path.join(__dirname, '../..')
  const contextPath = path.join(appRoot, 'test', 'fixtures', 'context')
  const settingsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-settings-e2e-'))

  // First launch: complete the wizard, verify CompleteSection takes over.
  let firstApp
  try {
    const first = launchElectron({
      contextPath,
      settingsDir,
      initialSettings: {
        contextFolderPath: path.resolve(contextPath),
        alwaysRecordWhenActive: true,
        wizardCompleted: false
      },
      env: { FAMILIAR_LLM_MOCK: '1', FAMILIAR_LLM_MOCK_TEXT: 'gibberish' }
    })
    firstApp = first.electronApp
    const window = await (await firstApp).firstWindow()
    await window.waitForLoadState('domcontentloaded')

    // initialSettings puts us at step 5 already (resolver lands at end).
    await expect(window.locator('[data-wizard-step="5"]')).toBeVisible()
    const doneButton = window.locator('#wizard-done')
    await completeWizardAutomateStep(window, doneButton)
    await expectCompleteSectionVisible(window)
    // CompleteSection is chromeless — the sidebar nav (role=tablist) is
    // hidden via the isCompleteSection branch in DashboardShellLayout.
    await expect(window.locator('nav[role="tablist"]')).toBeHidden()
  } finally {
    if (firstApp) await (await firstApp).close()
  }

  // Second launch: wizardCompleted is now true on disk; resolveInitialActiveSection
  // returns 'storage'. CompleteSection does NOT show again.
  let secondApp
  try {
    const second = launchElectron({
      contextPath,
      settingsDir,
      env: { FAMILIAR_LLM_MOCK: '1', FAMILIAR_LLM_MOCK_TEXT: 'gibberish' }
    })
    secondApp = second.electronApp
    const window = await (await secondApp).firstWindow()
    await window.waitForLoadState('domcontentloaded')

    await expect(window.locator('#section-title')).toHaveText(copy.storageTitle)
    await expect(window.getByRole('tab', { name: copy.wizardSectionTitle })).toBeHidden()
    await expect(window.locator('#section-complete')).toBeHidden()
  } finally {
    if (secondApp) await (await secondApp).close()
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
