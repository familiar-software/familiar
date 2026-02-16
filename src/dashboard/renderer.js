document.addEventListener('DOMContentLoaded', function onDOMContentLoaded() {
  function resolveModule(globalKey, localPath) {
    if (window[globalKey]) {
      return window[globalKey]
    }
    if (typeof require === 'function') {
      return require(localPath)
    }
    return null
  }

  function resolveBootstrapModules() {
    if (window.FamiliarDashboardBootstrap) {
      return window.FamiliarDashboardBootstrap
    }
    if (typeof require === 'function') {
      return {
        ...require('./bootstrap/processing-engine'),
        ...require('./bootstrap/stills'),
        ...require('./bootstrap/settings'),
        ...require('./bootstrap/updates'),
        ...require('./bootstrap/wizard'),
        ...require('./bootstrap/wizard-skill')
      }
    }
    return {}
  }

  const familiar = window.familiar || {}
  const moduleLoader = resolveModule('FamiliarDashboardModuleLoader', './module-loader')
  const stateModule = resolveModule('FamiliarDashboardState', './state')
  const bootstrap = resolveBootstrapModules()
  const loadDashboardModules = moduleLoader?.loadDashboardModules
  const createDashboardState = stateModule?.createDashboardState
  const {
    bootstrapProcessingEngine,
    bootstrapStills,
    bootstrapSettings,
    bootstrapUpdates,
    bootstrapWizard,
    bootstrapWizardSkill
  } = bootstrap

  if (typeof createDashboardState !== 'function') {
    console.error('Dashboard state module unavailable.')
    return
  }

  function selectAll(selector) {
    if (typeof document.querySelectorAll !== 'function') {
      return []
    }
    return Array.from(document.querySelectorAll(selector))
  }

  function toArray(value) {
    if (Array.isArray(value)) {
      return value
    }
    return [value]
  }

  function callIfAvailable(target, method, ...args) {
    if (target && typeof target[method] === 'function') {
      return target[method](...args)
    }
    return undefined
  }

  function getClonedComponentId(componentName, sourceId) {
    if (componentName === 'permissions') {
      return sourceId.replace(/^wizard-/, 'permissions-')
    }
    if (componentName === 'install-skill') {
      return sourceId.replace(/^wizard-/, 'settings-')
    }
    return `${componentName}-${sourceId}`
  }

  function remapClonedComponentIdentifiers(componentName, rootElement) {
    if (!rootElement || typeof rootElement.querySelectorAll !== 'function') {
      return
    }

    const idMap = new Map()
    const idElements = Array.from(rootElement.querySelectorAll('[id]'))
    for (const element of idElements) {
      const sourceId = element.id
      if (!sourceId) {
        continue
      }
      const clonedId = getClonedComponentId(componentName, sourceId)
      element.id = clonedId
      idMap.set(sourceId, clonedId)
    }

    const labelElements = Array.from(rootElement.querySelectorAll('[for]'))
    for (const label of labelElements) {
      const sourceFor = label.getAttribute('for')
      if (sourceFor && idMap.has(sourceFor)) {
        label.setAttribute('for', idMap.get(sourceFor))
      }
    }

    if (componentName === 'install-skill') {
      const harnessInputs = Array.from(rootElement.querySelectorAll('input[name="wizard-skill-harness"]'))
      for (const input of harnessInputs) {
        input.name = 'settings-skill-harness'
      }
    }
  }

  function mountSharedWizardComponents() {
    const mounts = selectAll('[data-component-mount]')
    for (const mount of mounts) {
      const componentName = mount?.dataset?.componentMount
      if (!componentName) {
        continue
      }
      const source = selectAll(`[data-component-source="${componentName}"]`)[0]
      if (!source || typeof source.cloneNode !== 'function' || typeof mount.replaceChildren !== 'function') {
        continue
      }
      const clone = source.cloneNode(true)
      clone.removeAttribute('data-component-source')
      remapClonedComponentIdentifiers(componentName, clone)
      mount.replaceChildren(clone)
    }
  }

  if (typeof loadDashboardModules === 'function') {
    loadDashboardModules(window)
  }

  mountSharedWizardComponents()

  const settingsHeader = document.getElementById('settings-header')
  const settingsContent = document.getElementById('settings-content')
  const settingsSidebar = document.getElementById('settings-sidebar')
  const wizardSection = document.getElementById('section-wizard')
  const wizardBackButton = selectAll('[data-action="wizard-back"]')[0]
  const wizardNextButton = selectAll('[data-action="wizard-next"]')[0]
  const wizardDoneButton = selectAll('[data-action="wizard-done"]')[0]
  const wizardCompleteStatus = document.getElementById('wizard-complete-status')
  const wizardStepStatus = document.getElementById('wizard-step-status')
  const wizardStepPanels = selectAll('[data-wizard-step]')
  const wizardStepIndicators = selectAll('[data-wizard-step-indicator]')
  const wizardStepConnectors = selectAll('[data-wizard-step-connector]')
  const skillHarnessInputs = selectAll('[data-skill-harness]')
  const skillInstallButtons = selectAll('[data-action="skill-install"]')
  const skillInstallStatuses = selectAll('[data-skill-install-status]')
  const skillInstallErrors = selectAll('[data-skill-install-error]')
  const skillInstallPaths = selectAll('[data-skill-install-path]')
  const skillCursorRestartNotes = selectAll('[data-skill-cursor-restart-note]')

  const contextFolderInputs = selectAll('[data-setting="context-folder-path"]')
  const contextFolderChooseButtons = selectAll('[data-action="context-folder-choose"]')
  const contextFolderErrors = selectAll('[data-setting-error="context-folder-error"]')
  const contextFolderStatuses = selectAll('[data-setting-status="context-folder-status"]')
  const copyLogButtons = selectAll('[data-action="copy-debug-log"]')
  const copyLogErrors = selectAll('[data-setting-error="copy-log-error"]')
  const copyLogStatuses = selectAll('[data-setting-status="copy-log-status"]')

  const llmProviderSelects = selectAll('[data-setting="llm-provider"]')
  const llmProviderErrors = selectAll('[data-setting-error="llm-provider-error"]')
  const llmKeyInputs = selectAll('[data-setting="llm-api-key"]')
  const llmKeyErrors = selectAll('[data-setting-error="llm-api-key-error"]')
  const llmKeyStatuses = selectAll('[data-setting-status="llm-api-key-status"]')
  const stillsMarkdownExtractorSelects = selectAll('[data-setting="stills-markdown-extractor"]')
  const stillsMarkdownExtractorErrors = selectAll('[data-setting-error="stills-markdown-extractor-error"]')
  const stillsMarkdownExtractorStatuses = selectAll('[data-setting-status="stills-markdown-extractor-status"]')
  const alwaysRecordWhenActiveInputs = selectAll('[data-setting="always-record-when-active"]')
  const alwaysRecordWhenActiveErrors = selectAll('[data-setting-error="always-record-when-active-error"]')
  const alwaysRecordWhenActiveStatuses = selectAll('[data-setting-status="always-record-when-active-status"]')
  const sidebarRecordingDot = document.getElementById('sidebar-recording-dot')
  const sidebarRecordingStatus = document.getElementById('sidebar-recording-status')
  const sidebarRecordingToggleTrack = document.getElementById('sidebar-recording-toggle-track')
  const sidebarRecordingActionButton = document.getElementById('sidebar-recording-action')
  const sidebarRecordingPermission = document.getElementById('sidebar-recording-permission')
  const recordingDetails = document.getElementById('recording-details')
  const recordingPath = document.getElementById('recording-path')
  const recordingOpenFolderButton = document.getElementById('recording-open-folder')
  const permissionCheckButtons = selectAll('[data-action="check-permissions"]')
  const openScreenRecordingSettingsButtons = selectAll('[data-action="open-screen-recording-settings"]')
  const openScreenRecordingSettingsNotes = [
    document.getElementById('wizard-open-screen-recording-settings-note'),
    ...selectAll('[data-open-screen-recording-settings-note]')
  ].filter(Boolean)
  const permissionRecordingToggleSections = selectAll('[data-role="permission-recording-toggle-section"]')
  const appVersionLabel = document.getElementById('app-version')

  const updateButtons = selectAll('[data-action="updates-check"]')
  const updateStatuses = selectAll('[data-setting-status="updates-status"]')
  const updateErrors = selectAll('[data-setting-error="updates-error"]')
  const updateProgress = document.getElementById('updates-progress')
  const updateProgressBar = document.getElementById('updates-progress-bar')
  const updateProgressLabel = document.getElementById('updates-progress-label')

  const sectionTitle = document.getElementById('section-title')
  const sectionSubtitle = document.getElementById('section-subtitle')
  const sectionNavButtons = selectAll('[data-section-target]')
  const wizardNavButton = sectionNavButtons.find((button) => button.dataset.sectionTarget === 'wizard') || null
  const sectionPanes = selectAll('[data-section-pane]')

  const apis = {
    wizardApi: null,
    wizardSkillApi: null,
    updatesApi: null,
    settingsApi: null,
    recordingApi: null,
    processingEngineApi: null
  }

  const state = createDashboardState({
    elements: {
      contextFolderInputs,
      llmProviderSelects,
      llmKeyInputs,
      stillsMarkdownExtractorSelects,
      alwaysRecordWhenActiveInputs
    },
    apis
  })

  if (typeof familiar.onAlwaysRecordWhenActiveChanged === 'function') {
    familiar.onAlwaysRecordWhenActiveChanged((payload) => {
      if (!payload || typeof payload.enabled !== 'boolean') {
        return
      }
      state.setAlwaysRecordWhenActiveValue(payload.enabled)
    })
  }

  const SECTION_META = {
    wizard: {
      title: 'Setup Wizard',
      subtitle: 'Guided setup in four steps.'
    },
    general: {
      title: 'General Settings',
      subtitle: 'Core app configuration.'
    },
    updates: {
      title: 'Updates',
      subtitle: 'Check for new versions and download when available.'
    },
    recording: {
      title: 'Capturing',
      subtitle: 'Choose whether processing runs in the cloud or locally.'
    },
    'install-skill': {
      title: 'Install Skill',
      subtitle: 'Install Familiar into your coding assistant skills folder.'
    }
  }

  let isWizardCompleted = false

  function updateOnboardingLayout() {
    if (settingsSidebar) {
      settingsSidebar.classList.toggle('hidden', !isWizardCompleted)
    }

    if (wizardNavButton) {
      wizardNavButton.classList.toggle('hidden', isWizardCompleted)
      wizardNavButton.setAttribute('aria-hidden', String(isWizardCompleted))
    }
  }

  function setWizardCompletionState(completed) {
    isWizardCompleted = completed === true
    updateOnboardingLayout()
  }

  setWizardCompletionState(false)

  function setActiveSection(nextSection) {
    if (!isWizardCompleted && nextSection !== 'wizard') {
      console.log('Ignoring section change while wizard is incomplete', { section: nextSection })
      return
    }

    if (isWizardCompleted && nextSection === 'wizard') {
      console.log('Ignoring wizard section after completion')
      return
    }

    const sectionMeta = SECTION_META[nextSection]
    if (!sectionMeta) {
      console.warn('Unknown settings section', nextSection)
      return
    }

    const isWizard = nextSection === 'wizard'

    for (const pane of sectionPanes) {
      const isActive = pane.dataset.sectionPane === nextSection
      pane.classList.toggle('hidden', !isActive)
      pane.setAttribute('aria-hidden', String(!isActive))
      if (isActive) {
        pane.classList.remove('pane-enter')
        void pane.offsetHeight
        pane.classList.add('pane-enter')
      }
    }

    for (const button of sectionNavButtons) {
      const isActive = button.dataset.sectionTarget === nextSection
      button.dataset.active = isActive ? 'true' : 'false'
      button.setAttribute('aria-selected', String(isActive))
      button.tabIndex = isActive ? 0 : -1
    }

    if (sectionTitle) {
      sectionTitle.textContent = sectionMeta.title
    }
    if (sectionSubtitle) {
      sectionSubtitle.textContent = sectionMeta.subtitle
    }

    if (settingsHeader) {
      settingsHeader.classList.toggle('hidden', isWizard)
    }
    if (settingsContent) {
      settingsContent.classList.toggle('hidden', isWizard)
    }
    if (isWizard) {
      state.updateWizardUI()
      const wizardStep = callIfAvailable(apis.wizardApi, 'getWizardStep')
      callIfAvailable(apis.recordingApi, 'handleWizardStepChange', wizardStep)
    }
    callIfAvailable(apis.recordingApi, 'handleSectionChange', nextSection)

    console.log('Settings section changed', { section: nextSection })
  }

  function handleWizardDone() {
    setWizardCompletionState(true)
    if (typeof familiar.saveSettings === 'function') {
      familiar
        .saveSettings({ wizardCompleted: true })
        .then((result) => {
          if (result && result.ok) {
            console.log('Wizard completion saved')
            return
          }
          console.warn('Failed to save wizard completion', {
            message: result?.message || 'unknown-error'
          })
        })
        .catch((error) => {
          console.error('Failed to save wizard completion', error)
        })
    }
    setActiveSection('general')
  }

  const runBootstrapWizard = typeof bootstrapWizard === 'function' ? bootstrapWizard : () => null
  const runBootstrapWizardSkill = typeof bootstrapWizardSkill === 'function' ? bootstrapWizardSkill : () => null
  const runBootstrapUpdates = typeof bootstrapUpdates === 'function' ? bootstrapUpdates : () => null
  const runBootstrapStills = typeof bootstrapStills === 'function' ? bootstrapStills : () => null
  const runBootstrapSettings = typeof bootstrapSettings === 'function' ? bootstrapSettings : () => null
  const runBootstrapProcessingEngine = typeof bootstrapProcessingEngine === 'function' ? bootstrapProcessingEngine : () => null

  apis.wizardApi = runBootstrapWizard({
    window,
    elements: {
      wizardSection,
      wizardBackButton,
      wizardNextButton,
      wizardDoneButton,
      wizardCompleteStatus,
      wizardStepStatus,
      wizardStepPanels,
      wizardStepIndicators,
      wizardStepConnectors
    },
    getState: state.getWizardState,
    onDone: handleWizardDone,
    onStepChange: (step) => {
      callIfAvailable(apis.recordingApi, 'handleWizardStepChange', step)
    }
  })

  function handleSectionNavClick(targetElement) {
    const target = targetElement?.dataset?.sectionTarget
    if (target) {
      setActiveSection(target)
    }
  }

  for (const button of sectionNavButtons) {
    button.addEventListener('click', function onSectionNavClick(event) {
      const targetElement = event?.currentTarget || button
      handleSectionNavClick(targetElement)
    })
  }

  function setMessage(elements, message) {
    const targets = toArray(elements)
    const value = message || ''
    for (const element of targets) {
      if (!element) {
        continue
      }
      element.textContent = value
      element.classList.toggle('hidden', !value)
    }
  }

  apis.wizardSkillApi = runBootstrapWizardSkill({
    window,
    elements: {
      skillHarnessInputs,
      skillInstallButtons,
      skillInstallStatuses,
      skillInstallErrors,
      skillInstallPaths,
      skillCursorRestartNotes
    },
    familiar,
    getState: state.getWizardState,
    setSkillHarness: state.setSkillHarness,
    setSkillInstalled: state.setSkillInstalled,
    setMessage,
    updateWizardUI: state.updateWizardUI
  })

  apis.updatesApi = runBootstrapUpdates({
    window,
    elements: {
      updateButtons,
      updateStatuses,
      updateErrors,
      updateProgress,
      updateProgressBar,
      updateProgressLabel
    },
    familiar,
    setMessage
  })

  apis.recordingApi = runBootstrapStills({
    window,
    elements: {
      sidebarRecordingDot,
      sidebarRecordingStatus,
      sidebarRecordingToggleTrack,
      sidebarRecordingActionButton,
      sidebarRecordingPermission,
      recordingDetails,
      recordingPath,
      recordingOpenFolderButton,
      permissionCheckButtons,
      openScreenRecordingSettingsButtons,
      openScreenRecordingSettingsNotes,
      permissionRecordingToggleSections
    },
    familiar,
    getState: state.getRecordingState,
    setAlwaysRecordWhenActiveValue: state.setAlwaysRecordWhenActiveValue
  })

  apis.processingEngineApi = runBootstrapProcessingEngine({
    window,
    elements: {
      processingEngineRoots: selectAll('[data-processing-engine]')
    }
  })

  apis.settingsApi = runBootstrapSettings({
    window,
    elements: {
      appVersionLabel,
      contextFolderChooseButtons,
      contextFolderErrors,
      contextFolderStatuses,
      copyLogButtons,
      copyLogErrors,
      copyLogStatuses,
      llmProviderSelects,
      llmProviderErrors,
      llmKeyInputs,
      llmKeyErrors,
      llmKeyStatuses,
      stillsMarkdownExtractorSelects,
      stillsMarkdownExtractorErrors,
      stillsMarkdownExtractorStatuses,
      alwaysRecordWhenActiveInputs,
      alwaysRecordWhenActiveErrors,
      alwaysRecordWhenActiveStatuses
    },
    familiar,
    getState: state.getSettingsState,
    setContextFolderValue: state.setContextFolderValue,
    setSkillHarness: state.setSkillHarness,
    setLlmProviderValue: state.setLlmProviderValue,
    setLlmApiKeyPending: state.setLlmApiKeyPending,
    setLlmApiKeySaved: state.setLlmApiKeySaved,
    setStillsMarkdownExtractorType: state.setStillsMarkdownExtractorType,
    setAlwaysRecordWhenActiveValue: state.setAlwaysRecordWhenActiveValue,
    setMessage,
    updateWizardUI: state.updateWizardUI
  })

  if (!apis.settingsApi) {
    setMessage(contextFolderErrors, 'Settings module unavailable. Restart the app.')
    setMessage(llmProviderErrors, 'Settings module unavailable. Restart the app.')
    setMessage(llmKeyErrors, 'Settings module unavailable. Restart the app.')
    setMessage(stillsMarkdownExtractorErrors, 'Settings module unavailable. Restart the app.')
    return
  }

  if (!apis.settingsApi.isReady) {
    return
  }

  async function initialize() {
    const settingsResult = await apis.settingsApi.loadSettings()
    setWizardCompletionState(settingsResult?.wizardCompleted === true)
    callIfAvailable(apis.recordingApi, 'updateStillsUI')
    const savedHarness = settingsResult?.skillInstaller?.harness || ''
    if (savedHarness && apis.wizardSkillApi && typeof apis.wizardSkillApi.checkInstallStatus === 'function') {
      await apis.wizardSkillApi.checkInstallStatus(savedHarness)
    }
    const defaultSection = isWizardCompleted ? 'general' : 'wizard'
    setActiveSection(defaultSection)
    state.updateWizardUI()
  }

  void initialize()
})
