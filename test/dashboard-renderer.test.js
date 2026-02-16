const assert = require('node:assert/strict')
const path = require('node:path')
const { test } = require('node:test')

class TestElement {
  constructor() {
    this.style = {}
    this._classes = new Set()
    this.classList = {
      toggle: (name, force) => {
        if (force === undefined) {
          if (this._classes.has(name)) {
            this._classes.delete(name)
            return false
          }
          this._classes.add(name)
          return true
        }
        if (force) {
          this._classes.add(name)
        } else {
          this._classes.delete(name)
        }
        return force
      },
      add: (...names) => {
        names.forEach((name) => this._classes.add(name))
      },
      remove: (...names) => {
        names.forEach((name) => this._classes.delete(name))
      },
      contains: (name) => this._classes.has(name)
    }
    this.hidden = false
    this.disabled = false
    this.checked = false
    this.value = ''
    this.textContent = ''
    this.title = ''
    this.innerHTML = ''
    this.dataset = {}
    this._listeners = {}
  }

  addEventListener(event, handler) {
    this._listeners[event] = handler
  }

  async trigger(event) {
    if (this._listeners[event]) {
      return await this._listeners[event]()
    }
    return undefined
  }

  async click() {
    if (this._listeners.click) {
      return await this._listeners.click()
    }
    return undefined
  }

  appendChild() {}

  querySelector() {
    return null
  }

  setAttribute() {}

  matches(selector) {
    if (selector.startsWith('.')) {
      return this._classes.has(selector.slice(1))
    }
    const attrMatch = selector.match(/^\[data-([a-z-]+)(?:="([^"]*)")?\]$/)
    if (attrMatch) {
      const key = attrMatch[1].replace(/-([a-z])/g, (_, char) => char.toUpperCase())
      if (!(key in this.dataset)) {
        return false
      }
      if (attrMatch[2] !== undefined) {
        return this.dataset[key] === attrMatch[2]
      }
      return true
    }
    return false
  }
}

class TestDocument {
  constructor(elements) {
    this._elements = elements
    this._listeners = {}
  }

  addEventListener(event, handler) {
    this._listeners[event] = handler
  }

  getElementById(id) {
    return this._elements[id] || null
  }

  querySelectorAll(selector) {
    return Object.values(this._elements).filter((element) => element.matches(selector))
  }

  createElement() {
    return new TestElement()
  }

  trigger(event) {
    if (this._listeners[event]) {
      this._listeners[event]()
    }
  }
}

const flushPromises = () => new Promise((resolve) => setImmediate(resolve))

const loadRenderer = () => {
  const rendererPath = path.join(__dirname, '..', 'src', 'dashboard', 'renderer.js')
  const resolvedRendererPath = require.resolve(rendererPath)
  delete require.cache[resolvedRendererPath]
  require(resolvedRendererPath)
}

const createFamiliar = (overrides = {}) => ({
  platform: 'darwin',
  getSettings: async () => ({
    contextFolderPath: '',
    llmProviderName: 'gemini',
    llmProviderApiKey: '',
    stillsMarkdownExtractorType: 'llm',
    alwaysRecordWhenActive: false,
    appVersion: '0.0.22'
  }),
  checkScreenRecordingPermission: async () => ({ ok: true, permissionStatus: 'granted', granted: true }),
  openScreenRecordingSettings: async () => ({ ok: true }),
  pickContextFolder: async () => ({ canceled: true }),
  saveSettings: async () => ({ ok: true }),
  getScreenStillsStatus: async () => ({
    ok: true,
    state: 'armed',
    isRecording: false,
    manualPaused: false,
    permissionStatus: 'granted',
    permissionGranted: true
  }),
  startScreenStills: async () => ({ ok: true, state: 'recording', isRecording: true, manualPaused: false }),
  pauseScreenStills: async () => ({ ok: true, state: 'armed', isRecording: false, manualPaused: true }),
  stopScreenStills: async () => ({ ok: true, state: 'armed', isRecording: false, manualPaused: false }),
  checkForUpdates: async () => ({ ok: true, updateInfo: null }),
  ...overrides
})

const createElements = () => {
  const elements = {
    'advanced-toggle-btn': new TestElement(),
    'advanced-options': new TestElement(),
    'sidebar-recording-dot': new TestElement(),
    'sidebar-recording-status': new TestElement(),
    'sidebar-recording-action': new TestElement(),
    'sidebar-recording-permission': new TestElement(),
    'context-folder-path': new TestElement(),
    'context-folder-choose': new TestElement(),
    'context-folder-error': new TestElement(),
    'context-folder-status': new TestElement(),
    'llm-api-key': new TestElement(),
    'llm-api-key-error': new TestElement(),
    'llm-api-key-status': new TestElement(),
    'stills-markdown-extractor': new TestElement(),
    'stills-markdown-extractor-error': new TestElement(),
    'stills-markdown-extractor-status': new TestElement(),
    'always-record-when-active': new TestElement(),
    'always-record-when-active-error': new TestElement(),
    'always-record-when-active-status': new TestElement(),
    'wizard-always-record-when-active': new TestElement(),
    'wizard-always-record-when-active-error': new TestElement(),
    'wizard-always-record-when-active-status': new TestElement(),
    'wizard-check-permissions': new TestElement(),
    'wizard-open-screen-recording-settings': new TestElement(),
    'wizard-recording-toggle-section': new TestElement(),
    'permissions-always-record-when-active': new TestElement(),
    'permissions-always-record-when-active-error': new TestElement(),
    'permissions-always-record-when-active-status': new TestElement(),
    'permissions-check-permissions': new TestElement(),
    'permissions-open-screen-recording-settings': new TestElement(),
    'permissions-recording-toggle-section': new TestElement(),
    'wizard-skill-status': new TestElement(),
    'wizard-skill-error': new TestElement(),
    'wizard-skill-path': new TestElement(),
    'wizard-skill-cursor-restart-note': new TestElement(),
    'wizard-skill-install': new TestElement(),
    'settings-skill-status': new TestElement(),
    'settings-skill-error': new TestElement(),
    'settings-skill-path': new TestElement(),
    'settings-skill-cursor-restart-note': new TestElement(),
    'settings-skill-install': new TestElement(),
    'wizard-skill-harness-claude': new TestElement(),
    'wizard-skill-harness-codex': new TestElement(),
    'wizard-skill-harness-cursor': new TestElement(),
    'settings-skill-harness-claude': new TestElement(),
    'settings-skill-harness-codex': new TestElement(),
    'settings-skill-harness-cursor': new TestElement(),
    'recording-details': new TestElement(),
    'recording-path': new TestElement(),
    'llm-provider': new TestElement(),
    'llm-provider-error': new TestElement(),
    'updates-check': new TestElement(),
    'updates-status': new TestElement(),
    'updates-error': new TestElement(),
    'updates-progress': new TestElement(),
    'updates-progress-bar': new TestElement(),
    'updates-progress-label': new TestElement(),
    'wizard-back': new TestElement(),
    'wizard-next': new TestElement(),
    'wizard-done': new TestElement(),
    'app-version': new TestElement(),
    'settings-sidebar': new TestElement(),
    'settings-header': new TestElement(),
    'settings-content': new TestElement(),
    'section-title': new TestElement(),
    'section-subtitle': new TestElement(),
    'section-general': new TestElement(),
    'section-wizard': new TestElement(),
    'section-updates': new TestElement(),
    'section-recording': new TestElement(),
    'section-install-skill': new TestElement(),
    'general-nav': new TestElement(),
    'wizard-nav': new TestElement(),
    'updates-nav': new TestElement(),
    'recording-nav': new TestElement(),
    'install-skill-nav': new TestElement()
  }

  elements['context-folder-path'].dataset.setting = 'context-folder-path'
  elements['context-folder-choose'].dataset.action = 'context-folder-choose'
  elements['context-folder-error'].dataset.settingError = 'context-folder-error'
  elements['context-folder-status'].dataset.settingStatus = 'context-folder-status'

  elements['llm-provider'].dataset.setting = 'llm-provider'
  elements['llm-provider-error'].dataset.settingError = 'llm-provider-error'
  elements['llm-api-key'].dataset.setting = 'llm-api-key'
  elements['llm-api-key-error'].dataset.settingError = 'llm-api-key-error'
  elements['llm-api-key-status'].dataset.settingStatus = 'llm-api-key-status'
  elements['stills-markdown-extractor'].dataset.setting = 'stills-markdown-extractor'
  elements['stills-markdown-extractor-error'].dataset.settingError = 'stills-markdown-extractor-error'
  elements['stills-markdown-extractor-status'].dataset.settingStatus = 'stills-markdown-extractor-status'
  elements['always-record-when-active'].dataset.setting = 'always-record-when-active'
  elements['always-record-when-active-error'].dataset.settingError = 'always-record-when-active-error'
  elements['always-record-when-active-status'].dataset.settingStatus = 'always-record-when-active-status'
  elements['wizard-always-record-when-active'].dataset.setting = 'always-record-when-active'
  elements['wizard-always-record-when-active-error'].dataset.settingError = 'always-record-when-active-error'
  elements['wizard-always-record-when-active-status'].dataset.settingStatus = 'always-record-when-active-status'
  elements['permissions-always-record-when-active'].dataset.setting = 'always-record-when-active'
  elements['permissions-always-record-when-active-error'].dataset.settingError = 'always-record-when-active-error'
  elements['permissions-always-record-when-active-status'].dataset.settingStatus = 'always-record-when-active-status'
  elements['wizard-check-permissions'].dataset.action = 'check-permissions'
  elements['permissions-check-permissions'].dataset.action = 'check-permissions'
  elements['wizard-open-screen-recording-settings'].dataset.action = 'open-screen-recording-settings'
  elements['permissions-open-screen-recording-settings'].dataset.action = 'open-screen-recording-settings'
  elements['wizard-recording-toggle-section'].dataset.role = 'permission-recording-toggle-section'
  elements['permissions-recording-toggle-section'].dataset.role = 'permission-recording-toggle-section'
  elements['wizard-skill-install'].dataset.action = 'skill-install'
  elements['settings-skill-install'].dataset.action = 'skill-install'
  elements['wizard-skill-status'].dataset.skillInstallStatus = 'wizard'
  elements['settings-skill-status'].dataset.skillInstallStatus = 'settings'
  elements['wizard-skill-error'].dataset.skillInstallError = 'wizard'
  elements['settings-skill-error'].dataset.skillInstallError = 'settings'
  elements['wizard-skill-path'].dataset.skillInstallPath = 'wizard'
  elements['settings-skill-path'].dataset.skillInstallPath = 'settings'
  elements['wizard-skill-cursor-restart-note'].dataset.skillCursorRestartNote = 'wizard'
  elements['settings-skill-cursor-restart-note'].dataset.skillCursorRestartNote = 'settings'
  elements['wizard-skill-harness-claude'].dataset.skillHarness = ''
  elements['wizard-skill-harness-codex'].dataset.skillHarness = ''
  elements['wizard-skill-harness-cursor'].dataset.skillHarness = ''
  elements['settings-skill-harness-claude'].dataset.skillHarness = ''
  elements['settings-skill-harness-codex'].dataset.skillHarness = ''
  elements['settings-skill-harness-cursor'].dataset.skillHarness = ''
  elements['wizard-skill-harness-claude'].value = 'claude'
  elements['wizard-skill-harness-codex'].value = 'codex'
  elements['wizard-skill-harness-cursor'].value = 'cursor'
  elements['settings-skill-harness-claude'].value = 'claude'
  elements['settings-skill-harness-codex'].value = 'codex'
  elements['settings-skill-harness-cursor'].value = 'cursor'
  elements['wizard-open-screen-recording-settings'].classList.add('hidden')
  elements['permissions-open-screen-recording-settings'].classList.add('hidden')
  elements['wizard-recording-toggle-section'].classList.add('hidden')
  elements['permissions-recording-toggle-section'].classList.add('hidden')

  elements['updates-check'].dataset.action = 'updates-check'
  elements['updates-status'].dataset.settingStatus = 'updates-status'
  elements['updates-error'].dataset.settingError = 'updates-error'

  elements['wizard-back'].dataset.action = 'wizard-back'
  elements['wizard-next'].dataset.action = 'wizard-next'
  elements['wizard-done'].dataset.action = 'wizard-done'

  elements['section-general'].dataset.sectionPane = 'general'
  elements['general-nav'].dataset.sectionTarget = 'general'
  elements['section-wizard'].dataset.sectionPane = 'wizard'
  elements['wizard-nav'].dataset.sectionTarget = 'wizard'
  elements['section-updates'].dataset.sectionPane = 'updates'
  elements['updates-nav'].dataset.sectionTarget = 'updates'
  elements['section-recording'].dataset.sectionPane = 'recording'
  elements['recording-nav'].dataset.sectionTarget = 'recording'
  elements['section-install-skill'].dataset.sectionPane = 'install-skill'
  elements['install-skill-nav'].dataset.sectionTarget = 'install-skill'

  return elements
}

test('loads app version in the sidebar header', async () => {
  const familiar = createFamiliar({
    getSettings: async () => ({
      contextFolderPath: '',
      llmProviderName: 'gemini',
      llmProviderApiKey: '',
      stillsMarkdownExtractorType: 'llm',
      alwaysRecordWhenActive: false,
      appVersion: '9.8.7'
    })
  })

  const elements = createElements()
  const document = new TestDocument(elements)
  const priorDocument = global.document
  const priorWindow = global.window
  global.document = document
  global.window = { familiar }

  try {
    loadRenderer()
    document.trigger('DOMContentLoaded')
    await flushPromises()

    assert.equal(elements['app-version'].textContent, '9.8.7')
  } finally {
    global.document = priorDocument
    global.window = priorWindow
  }
})

test('defaults to wizard when wizardCompleted is missing', async () => {
  const familiar = createFamiliar({
    getSettings: async () => ({
      contextFolderPath: '',
      llmProviderName: 'gemini',
      llmProviderApiKey: '',
      stillsMarkdownExtractorType: 'llm',
      alwaysRecordWhenActive: false,
      appVersion: '9.8.7'
    })
  })

  const elements = createElements()
  const document = new TestDocument(elements)
  const priorDocument = global.document
  const priorWindow = global.window
  global.document = document
  global.window = { familiar }

  try {
    loadRenderer()
    document.trigger('DOMContentLoaded')
    await flushPromises()

    assert.equal(elements['section-title'].textContent, 'Setup Wizard')
    assert.equal(elements['settings-sidebar'].classList.contains('hidden'), true)
    assert.equal(elements['settings-header'].classList.contains('hidden'), true)
    assert.equal(elements['settings-content'].classList.contains('hidden'), true)
  } finally {
    global.document = priorDocument
    global.window = priorWindow
  }
})

test('defaults to general when wizardCompleted is true', async () => {
  const familiar = createFamiliar({
    getSettings: async () => ({
      contextFolderPath: '',
      llmProviderName: 'gemini',
      llmProviderApiKey: '',
      stillsMarkdownExtractorType: 'llm',
      alwaysRecordWhenActive: false,
      wizardCompleted: true,
      appVersion: '9.8.7'
    })
  })

  const elements = createElements()
  const document = new TestDocument(elements)
  const priorDocument = global.document
  const priorWindow = global.window
  global.document = document
  global.window = { familiar }

  try {
    loadRenderer()
    document.trigger('DOMContentLoaded')
    await flushPromises()

    assert.equal(elements['section-title'].textContent, 'General Settings')
    assert.equal(elements['settings-sidebar'].classList.contains('hidden'), false)
    assert.equal(elements['wizard-nav'].classList.contains('hidden'), true)
    assert.equal(elements['settings-header'].classList.contains('hidden'), false)
    assert.equal(elements['settings-content'].classList.contains('hidden'), false)
  } finally {
    global.document = priorDocument
    global.window = priorWindow
  }
})

test('wizard done saves wizardCompleted flag', async () => {
  const saveCalls = []
  const familiar = createFamiliar({
    getSettings: async () => ({
      contextFolderPath: '/tmp/context',
      llmProviderName: 'gemini',
      llmProviderApiKey: '',
      stillsMarkdownExtractorType: 'llm',
      alwaysRecordWhenActive: false,
      appVersion: '9.8.7'
    }),
    saveSettings: async (payload) => {
      saveCalls.push(payload)
      return { ok: true }
    }
  })

  const elements = createElements()
  const document = new TestDocument(elements)
  const priorDocument = global.document
  const priorWindow = global.window
  global.document = document
  global.window = { familiar }

  try {
    loadRenderer()
    document.trigger('DOMContentLoaded')
    await flushPromises()

    await elements['wizard-done'].click()
    await flushPromises()

    assert.equal(saveCalls.length, 1)
    assert.deepEqual(saveCalls[0], { wizardCompleted: true })
    assert.equal(elements['settings-sidebar'].classList.contains('hidden'), false)
    assert.equal(elements['wizard-nav'].classList.contains('hidden'), true)
    assert.equal(elements['section-title'].textContent, 'General Settings')
  } finally {
    global.document = priorDocument
    global.window = priorWindow
  }
})

test('llm api key saves on change when provider is set', async () => {
  const saveCalls = []
  const familiar = createFamiliar({
    getSettings: async () => ({
      contextFolderPath: '',
      llmProviderName: 'gemini',
      llmProviderApiKey: ''
    }),
    saveSettings: async (payload) => {
      saveCalls.push(payload)
      return { ok: true }
    }
  })

  const elements = createElements()
  const document = new TestDocument(elements)
  const priorDocument = global.document
  const priorWindow = global.window
  global.document = document
  global.window = { familiar }

  try {
    loadRenderer()
    document.trigger('DOMContentLoaded')
    await flushPromises()

    elements['llm-api-key'].value = 'new-key'
    await elements['llm-api-key']._listeners.change({ target: elements['llm-api-key'] })
    await flushPromises()

    assert.equal(saveCalls.length, 1)
    assert.deepEqual(saveCalls[0], {
      llmProviderName: 'gemini',
      llmProviderApiKey: 'new-key'
    })
    assert.equal(elements['llm-api-key-status'].textContent, 'Saved.')
  } finally {
    global.document = priorDocument
    global.window = priorWindow
  }
})

test('always record toggle saves on change', async () => {
  const saveCalls = []
  const familiar = createFamiliar({
    getSettings: async () => ({
      contextFolderPath: '',
      llmProviderName: 'gemini',
      llmProviderApiKey: '',
      alwaysRecordWhenActive: false
    }),
    saveSettings: async (payload) => {
      saveCalls.push(payload)
      return { ok: true }
    }
  })

  const elements = createElements()
  const document = new TestDocument(elements)
  const priorDocument = global.document
  const priorWindow = global.window
  global.document = document
  global.window = { familiar }

  try {
    loadRenderer()
    document.trigger('DOMContentLoaded')
    await flushPromises()

    elements['always-record-when-active'].checked = true
    await elements['always-record-when-active']._listeners.change({
      target: elements['always-record-when-active']
    })
    await flushPromises()

    assert.equal(saveCalls.length, 1)
    assert.deepEqual(saveCalls[0], { alwaysRecordWhenActive: true })
    assert.equal(elements['always-record-when-active-status'].textContent, 'Saved.')
    assert.equal(elements['wizard-always-record-when-active-status'].textContent, 'Saved.')
    assert.equal(elements['permissions-always-record-when-active-status'].textContent, 'Saved.')
    assert.equal(elements['wizard-always-record-when-active'].checked, true)
    assert.equal(elements['permissions-always-record-when-active'].checked, true)
  } finally {
    global.document = priorDocument
    global.window = priorWindow
  }
})

test('wizard permission check is click-driven and denied state shows settings shortcut', async () => {
  let checkCalls = 0
  let openSettingsCalls = 0
  const familiar = createFamiliar({
    checkScreenRecordingPermission: async () => {
      checkCalls += 1
      return { ok: true, permissionStatus: 'denied', granted: false }
    },
    openScreenRecordingSettings: async () => {
      openSettingsCalls += 1
      return { ok: true }
    }
  })

  const elements = createElements()
  const document = new TestDocument(elements)
  const priorDocument = global.document
  const priorWindow = global.window
  global.document = document
  global.window = { familiar }

  try {
    loadRenderer()
    document.trigger('DOMContentLoaded')
    await flushPromises()

    assert.equal(checkCalls, 0)
    assert.equal(elements['wizard-recording-toggle-section'].classList.contains('hidden'), true)

    await elements['wizard-check-permissions'].click()
    await flushPromises()

    assert.equal(checkCalls, 1)
    assert.equal(elements['wizard-check-permissions'].textContent, 'Check Permissions')
    assert.equal(elements['wizard-check-permissions'].classList.contains('border-indigo-600'), true)
    assert.equal(elements['permissions-check-permissions'].textContent, 'Check Permissions')
    assert.equal(elements['permissions-check-permissions'].classList.contains('border-indigo-600'), true)
    assert.equal(elements['wizard-open-screen-recording-settings'].classList.contains('hidden'), false)
    assert.equal(elements['permissions-open-screen-recording-settings'].classList.contains('hidden'), false)
    assert.equal(elements['wizard-recording-toggle-section'].classList.contains('hidden'), true)
    assert.equal(elements['permissions-recording-toggle-section'].classList.contains('hidden'), true)

    await elements['wizard-open-screen-recording-settings'].click()
    assert.equal(openSettingsCalls, 1)
  } finally {
    global.document = priorDocument
    global.window = priorWindow
  }
})

test('wizard permission check granted state reveals recording toggle', async () => {
  let checkCalls = 0
  const familiar = createFamiliar({
    checkScreenRecordingPermission: async () => {
      checkCalls += 1
      return { ok: true, permissionStatus: 'granted', granted: true }
    }
  })

  const elements = createElements()
  const document = new TestDocument(elements)
  const priorDocument = global.document
  const priorWindow = global.window
  global.document = document
  global.window = { familiar }

  try {
    loadRenderer()
    document.trigger('DOMContentLoaded')
    await flushPromises()

    await elements['wizard-check-permissions'].click()
    await flushPromises()

    assert.equal(checkCalls, 1)
    assert.equal(elements['wizard-check-permissions'].textContent, 'Granted')
    assert.equal(elements['wizard-check-permissions'].classList.contains('border-emerald-600'), true)
    assert.equal(elements['permissions-check-permissions'].textContent, 'Granted')
    assert.equal(elements['permissions-check-permissions'].classList.contains('border-emerald-600'), true)
    assert.equal(elements['wizard-open-screen-recording-settings'].classList.contains('hidden'), true)
    assert.equal(elements['permissions-open-screen-recording-settings'].classList.contains('hidden'), true)
    assert.equal(elements['wizard-recording-toggle-section'].classList.contains('hidden'), false)
    assert.equal(elements['permissions-recording-toggle-section'].classList.contains('hidden'), false)
  } finally {
    global.document = priorDocument
    global.window = priorWindow
  }
})

test('wizard permission check prefers request permissions API when available', async () => {
  let checkCalls = 0
  let requestCalls = 0
  const familiar = createFamiliar({
    checkScreenRecordingPermission: async () => {
      checkCalls += 1
      return { ok: true, permissionStatus: 'granted', granted: true }
    },
    requestScreenRecordingPermission: async () => {
      requestCalls += 1
      return { ok: true, permissionStatus: 'granted', granted: true }
    }
  })

  const elements = createElements()
  const document = new TestDocument(elements)
  const priorDocument = global.document
  const priorWindow = global.window
  global.document = document
  global.window = { familiar }

  try {
    loadRenderer()
    document.trigger('DOMContentLoaded')
    await flushPromises()

    await elements['wizard-check-permissions'].click()
    await flushPromises()

    assert.equal(requestCalls, 1)
    assert.equal(checkCalls, 0)
    assert.equal(elements['wizard-recording-toggle-section'].classList.contains('hidden'), false)
  } finally {
    global.document = priorDocument
    global.window = priorWindow
  }
})

test('cannot navigate away from wizard while wizard is incomplete', async () => {
  const familiar = createFamiliar({
    getSettings: async () => ({
      contextFolderPath: '',
      llmProviderName: 'gemini',
      llmProviderApiKey: '',
      stillsMarkdownExtractorType: 'llm',
      alwaysRecordWhenActive: false,
      appVersion: '9.8.7'
    })
  })

  const elements = createElements()
  const document = new TestDocument(elements)
  const priorDocument = global.document
  const priorWindow = global.window
  global.document = document
  global.window = { familiar }

  try {
    loadRenderer()
    document.trigger('DOMContentLoaded')
    await flushPromises()

    await elements['general-nav'].click()
    await flushPromises()

    assert.equal(elements['section-title'].textContent, 'Setup Wizard')
    assert.equal(elements['settings-sidebar'].classList.contains('hidden'), true)
  } finally {
    global.document = priorDocument
    global.window = priorWindow
  }
})

test('cannot navigate back to wizard after wizard completion', async () => {
  const familiar = createFamiliar({
    getSettings: async () => ({
      contextFolderPath: '',
      llmProviderName: 'gemini',
      llmProviderApiKey: '',
      stillsMarkdownExtractorType: 'llm',
      alwaysRecordWhenActive: false,
      wizardCompleted: true,
      appVersion: '9.8.7'
    })
  })

  const elements = createElements()
  const document = new TestDocument(elements)
  const priorDocument = global.document
  const priorWindow = global.window
  global.document = document
  global.window = { familiar }

  try {
    loadRenderer()
    document.trigger('DOMContentLoaded')
    await flushPromises()

    await elements['wizard-nav'].click()
    await flushPromises()

    assert.equal(elements['section-title'].textContent, 'General Settings')
    assert.equal(elements['wizard-nav'].classList.contains('hidden'), true)
  } finally {
    global.document = priorDocument
    global.window = priorWindow
  }
})

test('completed wizard can navigate to Install Skill section', async () => {
  const familiar = createFamiliar({
    getSettings: async () => ({
      contextFolderPath: '',
      llmProviderName: 'gemini',
      llmProviderApiKey: '',
      stillsMarkdownExtractorType: 'llm',
      alwaysRecordWhenActive: false,
      wizardCompleted: true,
      appVersion: '9.8.7'
    })
  })

  const elements = createElements()
  const document = new TestDocument(elements)
  const priorDocument = global.document
  const priorWindow = global.window
  global.document = document
  global.window = { familiar }

  try {
    loadRenderer()
    document.trigger('DOMContentLoaded')
    await flushPromises()

    await elements['install-skill-nav'].click()
    await flushPromises()
    assert.equal(elements['section-title'].textContent, 'Install Skill')
  } finally {
    global.document = priorDocument
    global.window = priorWindow
  }
})

test('wizard step 2 does not auto-check permissions when recording is already enabled', async () => {
  let checkCalls = 0
  const familiar = createFamiliar({
    getSettings: async () => ({
      contextFolderPath: '/tmp/context',
      llmProviderName: 'gemini',
      llmProviderApiKey: '',
      stillsMarkdownExtractorType: 'apple_vision_ocr',
      alwaysRecordWhenActive: true,
      appVersion: '0.0.22'
    }),
    checkScreenRecordingPermission: async () => {
      checkCalls += 1
      return { ok: true, permissionStatus: 'denied', granted: false }
    }
  })

  const elements = createElements()
  const document = new TestDocument(elements)
  const priorDocument = global.document
  const priorWindow = global.window
  global.document = document
  global.window = { familiar }

  try {
    loadRenderer()
    document.trigger('DOMContentLoaded')
    await flushPromises()

    assert.equal(checkCalls, 0)

    await elements['wizard-next'].click()
    await flushPromises()

    assert.equal(checkCalls, 0)
    assert.equal(elements['wizard-check-permissions'].textContent, 'Check Permissions')
    assert.equal(elements['wizard-check-permissions'].classList.contains('border-indigo-600'), true)
    assert.equal(elements['permissions-check-permissions'].textContent, 'Check Permissions')
    assert.equal(elements['permissions-check-permissions'].classList.contains('border-indigo-600'), true)
    assert.equal(elements['wizard-open-screen-recording-settings'].classList.contains('hidden'), true)
    assert.equal(elements['permissions-open-screen-recording-settings'].classList.contains('hidden'), true)
    assert.equal(elements['wizard-recording-toggle-section'].classList.contains('hidden'), true)
    assert.equal(elements['permissions-recording-toggle-section'].classList.contains('hidden'), true)
  } finally {
    global.document = priorDocument
    global.window = priorWindow
  }
})

test('stills action button starts capture when inactive', async () => {
  const startCalls = []
  const familiar = createFamiliar({
    getSettings: async () => ({
      contextFolderPath: '/tmp/context',
      llmProviderName: 'gemini',
      llmProviderApiKey: '',
      alwaysRecordWhenActive: true,
      wizardCompleted: true
    }),
    getScreenStillsStatus: async () => ({ ok: true, state: 'armed', isRecording: false, manualPaused: false }),
    startScreenStills: async () => {
      startCalls.push(true)
      return { ok: true, state: 'recording', isRecording: true, manualPaused: false }
    }
  })

  const elements = createElements()
  const document = new TestDocument(elements)
  const priorDocument = global.document
  const priorWindow = global.window
  global.document = document
  global.window = { familiar }

  try {
    loadRenderer()
    document.trigger('DOMContentLoaded')
    await flushPromises()

    await elements['recording-nav'].click()
    await flushPromises()

    await elements['sidebar-recording-action'].click()
    await flushPromises()

    assert.equal(startCalls.length, 1)
  } finally {
    global.document = priorDocument
    global.window = priorWindow
  }
})

test('stills action button pauses and resumes when paused', async () => {
  const pauseCalls = []
  const startCalls = []
  let status = { ok: true, state: 'recording', isRecording: true, manualPaused: false }
  const familiar = createFamiliar({
    getSettings: async () => ({
      contextFolderPath: '/tmp/context',
      llmProviderName: 'gemini',
      llmProviderApiKey: '',
      alwaysRecordWhenActive: true,
      wizardCompleted: true
    }),
    getScreenStillsStatus: async () => status,
    pauseScreenStills: async () => {
      pauseCalls.push(true)
      status = { ok: true, state: 'armed', isRecording: false, manualPaused: true }
      return status
    },
    startScreenStills: async () => {
      startCalls.push(true)
      status = { ok: true, state: 'recording', isRecording: true, manualPaused: false }
      return status
    }
  })

  const elements = createElements()
  const document = new TestDocument(elements)
  const priorDocument = global.document
  const priorWindow = global.window
  global.document = document
  global.window = { familiar }

  try {
    loadRenderer()
    document.trigger('DOMContentLoaded')
    await flushPromises()

    await elements['recording-nav'].click()
    await flushPromises()

    assert.equal(elements['sidebar-recording-status'].textContent, 'Capturing')
    assert.equal(elements['sidebar-recording-action'].textContent, 'Pause (10 min)')

    await elements['sidebar-recording-action'].click()
    await flushPromises()

    assert.equal(pauseCalls.length, 1)
    assert.equal(elements['sidebar-recording-status'].textContent, 'Paused')
    assert.equal(elements['sidebar-recording-action'].textContent, 'Resume')

    await elements['sidebar-recording-action'].click()
    await flushPromises()

    assert.equal(startCalls.length, 1)
    assert.equal(elements['sidebar-recording-status'].textContent, 'Capturing')
    assert.equal(elements['sidebar-recording-action'].textContent, 'Pause (10 min)')
  } finally {
    global.document = priorDocument
    global.window = priorWindow
  }
})

test('stills sidebar shows permission needed and red status dot', async () => {
  const familiar = createFamiliar({
    getSettings: async () => ({
      contextFolderPath: '/tmp/context',
      llmProviderName: 'gemini',
      llmApiKey: '',
      stillsMarkdownExtractorType: 'apple_vision_ocr',
      alwaysRecordWhenActive: true,
      wizardCompleted: true
    }),
    getScreenStillsStatus: async () => ({
      ok: true,
      state: 'armed',
      isRecording: false,
      manualPaused: false,
      permissionStatus: 'denied',
      permissionGranted: false
    })
  })

  const elements = createElements()
  const document = new TestDocument(elements)
  const priorDocument = global.document
  const priorWindow = global.window
  global.document = document
  global.window = { familiar }

  try {
    loadRenderer()
    document.trigger('DOMContentLoaded')
    await flushPromises()

    await elements['recording-nav'].click()
    await flushPromises()

    assert.equal(elements['sidebar-recording-status'].textContent, 'Permission needed')
    assert.equal(elements['sidebar-recording-dot'].classList.contains('bg-red-500'), true)
    assert.equal(elements['sidebar-recording-permission'].classList.contains('hidden'), true)
  } finally {
    global.document = priorDocument
    global.window = priorWindow
  }
})

test('auto-saves LLM provider selection', async () => {
  const saveCalls = []
  const familiar = {
    getSettings: async () => ({
      contextFolderPath: '',
      llmProviderName: 'gemini',
      llmProviderApiKey: ''
    }),
    pickContextFolder: async () => ({ canceled: true }),
    saveSettings: async (payload) => {
      saveCalls.push(payload)
      return { ok: true }
    }
  }

  const elements = createElements()
  const document = new TestDocument(elements)
  const priorDocument = global.document
  const priorWindow = global.window
  global.document = document
  global.window = { familiar }

  try {
    const rendererPath = path.join(__dirname, '..', 'src', 'dashboard', 'renderer.js')
    const resolvedRendererPath = require.resolve(rendererPath)
    delete require.cache[resolvedRendererPath]
    require(resolvedRendererPath)

    document.trigger('DOMContentLoaded')
    await flushPromises()

    elements['llm-provider'].value = 'openai'
    await elements['llm-provider'].trigger('change')
    await flushPromises()

    assert.equal(saveCalls.length, 1)
    assert.deepEqual(saveCalls[0], { llmProviderName: 'openai' })
  } finally {
    global.document = priorDocument
    global.window = priorWindow
  }
})

test('check for updates reports update when latest is higher', async () => {
  const updateCalls = []
  const familiar = createFamiliar({
    checkForUpdates: async () => {
      updateCalls.push(true)
      return { ok: true, updateInfo: { version: '0.0.2' }, currentVersion: '0.0.1' }
    }
  })

  const elements = createElements()
  const document = new TestDocument(elements)
  const priorDocument = global.document
  const priorWindow = global.window
  global.document = document
  global.window = { familiar }

  try {
    loadRenderer()
    document.trigger('DOMContentLoaded')
    await flushPromises()

    await elements['updates-check'].click()
    await flushPromises()

    assert.equal(updateCalls.length, 1)
    assert.equal(
      elements['updates-status'].textContent,
      'Update available: 0.0.1 -> 0.0.2. You will be prompted to download.'
    )
  } finally {
    global.document = priorDocument
    global.window = priorWindow
  }
})

test('check for updates reports no update when latest matches current', async () => {
  const updateCalls = []
  const familiar = createFamiliar({
    checkForUpdates: async () => {
      updateCalls.push(true)
      return { ok: true, updateInfo: { version: '0.0.4' }, currentVersion: '0.0.4' }
    }
  })

  const elements = createElements()
  const document = new TestDocument(elements)
  const priorDocument = global.document
  const priorWindow = global.window
  global.document = document
  global.window = { familiar }

  try {
    loadRenderer()
    document.trigger('DOMContentLoaded')
    await flushPromises()

    await elements['updates-check'].click()
    await flushPromises()

    assert.equal(updateCalls.length, 1)
    assert.equal(elements['updates-status'].textContent, 'No updates found.')
  } finally {
    global.document = priorDocument
    global.window = priorWindow
  }
})

test('download progress updates the updates progress bar', async () => {
  const progressHandlers = []
  const downloadedHandlers = []
  const familiar = createFamiliar({
    onUpdateDownloadProgress: (handler) => {
      progressHandlers.push(handler)
    },
    onUpdateDownloaded: (handler) => {
      downloadedHandlers.push(handler)
    }
  })

  const elements = createElements()
  const document = new TestDocument(elements)
  const priorDocument = global.document
  const priorWindow = global.window
  global.document = document
  global.window = { familiar }

  try {
    loadRenderer()
    document.trigger('DOMContentLoaded')
    await flushPromises()

    assert.equal(progressHandlers.length, 1)
    assert.equal(downloadedHandlers.length, 1)

    progressHandlers[0]({ percent: 41.6 })
    assert.equal(elements['updates-progress'].classList.contains('hidden'), false)
    assert.equal(elements['updates-progress-bar'].style.width, '42%')
    assert.equal(elements['updates-progress-label'].textContent, 'Downloading update... 42%')

    downloadedHandlers[0]({ version: '0.0.2' })
    assert.equal(elements['updates-progress-bar'].style.width, '100%')
    assert.equal(
      elements['updates-progress-label'].textContent,
      'Download complete. Restart to install 0.0.2.'
    )
  } finally {
    global.document = priorDocument
    global.window = priorWindow
  }
})
