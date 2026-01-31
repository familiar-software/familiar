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

const createJiminy = (overrides = {}) => ({
  platform: 'darwin',
  getSettings: async () => ({
    contextFolderPath: '',
    llmProviderName: 'gemini',
    llmProviderApiKey: '',
    exclusions: [],
    alwaysRecordWhenActive: false,
    screenRecordingPermissionStatus: 'granted'
  }),
  pickContextFolder: async () => ({ canceled: true }),
  saveSettings: async () => ({ ok: true }),
  getScreenRecordingStatus: async () => ({ ok: true, state: 'armed', isRecording: false }),
  startScreenRecording: async () => ({ ok: true, state: 'recording', isRecording: true }),
  stopScreenRecording: async () => ({ ok: true, state: 'armed', isRecording: false }),
  getContextGraphStatus: async () => ({ syncedNodes: 0, totalNodes: 0, maxNodesExceeded: false }),
  syncContextGraph: async () => ({ ok: true, warnings: [], errors: [] }),
  pruneContextGraph: async () => ({ ok: true, deleted: false }),
  checkForUpdates: async () => ({ ok: true, updateInfo: null }),
  ...overrides
})

const createElements = () => {
  const elements = {
    'advanced-toggle-btn': new TestElement(),
    'advanced-options': new TestElement(),
    'add-exclusion': new TestElement(),
    'capture-hotkey': new TestElement(),
    'clipboard-hotkey': new TestElement(),
    'recording-hotkey': new TestElement(),
    'context-folder-path': new TestElement(),
    'context-folder-choose': new TestElement(),
    'context-folder-error': new TestElement(),
    'context-folder-status': new TestElement(),
    'llm-api-key': new TestElement(),
    'llm-api-key-error': new TestElement(),
    'llm-api-key-status': new TestElement(),
    'always-record-when-active': new TestElement(),
    'always-record-when-active-error': new TestElement(),
    'always-record-when-active-status': new TestElement(),
    'recording-details': new TestElement(),
    'recording-path': new TestElement(),
    'recording-status': new TestElement(),
    'recording-action': new TestElement(),
    'recording-permission': new TestElement(),
    'llm-provider': new TestElement(),
    'llm-provider-error': new TestElement(),
    'context-graph-sync': new TestElement(),
    'context-graph-status': new TestElement(),
    'context-graph-progress': new TestElement(),
    'context-graph-warning': new TestElement(),
    'context-graph-error': new TestElement(),
    'context-graph-prune': new TestElement(),
    'context-graph-prune-status': new TestElement(),
    'context-graph-stats': new TestElement(),
    'context-graph-ignored-count': new TestElement(),
    'updates-check': new TestElement(),
    'updates-status': new TestElement(),
    'updates-error': new TestElement(),
    'updates-progress': new TestElement(),
    'updates-progress-bar': new TestElement(),
    'updates-progress-label': new TestElement(),
    'exclusions-list': new TestElement(),
    'exclusions-error': new TestElement(),
    'hotkeys-save': new TestElement(),
    'hotkeys-reset': new TestElement(),
    'hotkeys-status': new TestElement(),
    'hotkeys-error': new TestElement(),
    'settings-header': new TestElement(),
    'settings-content': new TestElement(),
    'section-title': new TestElement(),
    'section-subtitle': new TestElement(),
    'section-history': new TestElement(),
    'section-updates': new TestElement(),
    'section-recording': new TestElement(),
    'history-list': new TestElement(),
    'history-empty': new TestElement(),
    'history-error': new TestElement(),
    'history-nav': new TestElement(),
    'updates-nav': new TestElement(),
    'recording-nav': new TestElement()
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
  elements['always-record-when-active'].dataset.setting = 'always-record-when-active'
  elements['always-record-when-active-error'].dataset.settingError = 'always-record-when-active-error'
  elements['always-record-when-active-status'].dataset.settingStatus = 'always-record-when-active-status'

  elements['context-graph-sync'].dataset.action = 'context-graph-sync'
  elements['context-graph-status'].dataset.settingStatus = 'context-graph-status'
  elements['context-graph-progress'].dataset.settingStatus = 'context-graph-progress'
  elements['context-graph-warning'].dataset.settingStatus = 'context-graph-warning'
  elements['context-graph-error'].dataset.settingError = 'context-graph-error'
  elements['context-graph-prune'].dataset.action = 'context-graph-prune'
  elements['context-graph-prune-status'].dataset.settingStatus = 'context-graph-prune-status'
  elements['context-graph-stats'].dataset.settingStatus = 'context-graph-stats'
  elements['updates-check'].dataset.action = 'updates-check'
  elements['updates-status'].dataset.settingStatus = 'updates-status'
  elements['updates-error'].dataset.settingError = 'updates-error'

  elements['exclusions-list'].dataset.settingList = 'exclusions'
  elements['add-exclusion'].dataset.action = 'add-exclusion'
  elements['exclusions-error'].dataset.settingError = 'exclusions-error'

  elements['capture-hotkey'].dataset.hotkeyRole = 'capture'
  elements['capture-hotkey'].classList.add('hotkey-recorder')
  elements['clipboard-hotkey'].dataset.hotkeyRole = 'clipboard'
  elements['clipboard-hotkey'].classList.add('hotkey-recorder')
  elements['recording-hotkey'].dataset.hotkeyRole = 'recording'
  elements['recording-hotkey'].classList.add('hotkey-recorder')
  elements['hotkeys-save'].dataset.action = 'hotkeys-save'
  elements['hotkeys-reset'].dataset.action = 'hotkeys-reset'
  elements['hotkeys-status'].dataset.settingStatus = 'hotkeys-status'
  elements['hotkeys-error'].dataset.settingError = 'hotkeys-error'

  elements['section-history'].dataset.sectionPane = 'history'
  elements['history-nav'].dataset.sectionTarget = 'history'
  elements['section-updates'].dataset.sectionPane = 'updates'
  elements['updates-nav'].dataset.sectionTarget = 'updates'
  elements['section-recording'].dataset.sectionPane = 'recording'
  elements['recording-nav'].dataset.sectionTarget = 'recording'

  return elements
}

test('refreshes context graph status when context path changes', async () => {
  const statusCalls = []
  const saveCalls = []
  const jiminy = {
    getSettings: async () => ({
      contextFolderPath: '',
      llmProviderName: 'gemini',
      llmProviderApiKey: '',
      exclusions: []
    }),
    pickContextFolder: async () => ({ canceled: false, path: '/tmp/new-context' }),
    saveSettings: async (payload) => {
      saveCalls.push(payload)
      return { ok: true }
    },
    getContextGraphStatus: async (payload) => {
      statusCalls.push(payload)
      return { syncedNodes: 0, totalNodes: 2, maxNodesExceeded: false }
    },
    syncContextGraph: async () => ({ ok: true, warnings: [], errors: [] })
  }

  const elements = createElements()
  const document = new TestDocument(elements)
  const priorDocument = global.document
  const priorWindow = global.window
  global.document = document
  global.window = { jiminy }

  try {
    const rendererPath = path.join(__dirname, '..', 'src', 'dashboard', 'renderer.js')
    const resolvedRendererPath = require.resolve(rendererPath)
    delete require.cache[resolvedRendererPath]
    require(resolvedRendererPath)

    document.trigger('DOMContentLoaded')
    await flushPromises()
    assert.equal(statusCalls.length, 1)
    assert.equal(statusCalls[0].contextFolderPath, '')

    await elements['context-folder-choose'].click()
    await flushPromises()
    assert.equal(saveCalls.length, 1)
    assert.equal(saveCalls[0].contextFolderPath, '/tmp/new-context')
    assert.equal(elements['context-folder-status'].textContent, 'Saved.')
    assert.equal(statusCalls.length, 2)
    assert.equal(statusCalls[1].contextFolderPath, '/tmp/new-context')
  } finally {
    global.document = priorDocument
    global.window = priorWindow
  }
})

test('context graph status shows ignored file count', async () => {
  const jiminy = createJiminy({
    getContextGraphStatus: async () => ({
      syncedNodes: 2,
      outOfSyncNodes: 1,
      newNodes: 0,
      totalNodes: 3,
      ignoredFiles: 4,
      maxNodesExceeded: false
    })
  })

  const elements = createElements()
  const document = new TestDocument(elements)
  const priorDocument = global.document
  const priorWindow = global.window
  global.document = document
  global.window = { jiminy }

  try {
    loadRenderer()
    document.trigger('DOMContentLoaded')
    await flushPromises()

    assert.equal(elements['context-graph-ignored-count'].textContent, '4')
    assert.match(elements['context-graph-stats'].textContent, /Ignored: 4/)
  } finally {
    global.document = priorDocument
    global.window = priorWindow
  }
})

test('llm api key saves on change when provider is set', async () => {
  const saveCalls = []
  const jiminy = createJiminy({
    getSettings: async () => ({
      contextFolderPath: '',
      llmProviderName: 'gemini',
      llmProviderApiKey: '',
      exclusions: []
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
  global.window = { jiminy }

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
  const jiminy = createJiminy({
    getSettings: async () => ({
      contextFolderPath: '',
      llmProviderName: 'gemini',
      llmProviderApiKey: '',
      exclusions: [],
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
  global.window = { jiminy }

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
  } finally {
    global.document = priorDocument
    global.window = priorWindow
  }
})

test('recording action button starts recording when inactive', async () => {
  const startCalls = []
  const jiminy = createJiminy({
    getSettings: async () => ({
      contextFolderPath: '/tmp/context',
      llmProviderName: 'gemini',
      llmProviderApiKey: '',
      exclusions: [],
      alwaysRecordWhenActive: true,
      screenRecordingPermissionStatus: 'granted'
    }),
    getScreenRecordingStatus: async () => ({ ok: true, state: 'armed', isRecording: false }),
    startScreenRecording: async () => {
      startCalls.push(true)
      return { ok: true, state: 'recording', isRecording: true }
    }
  })

  const elements = createElements()
  const document = new TestDocument(elements)
  const priorDocument = global.document
  const priorWindow = global.window
  global.document = document
  global.window = { jiminy }

  try {
    loadRenderer()
    document.trigger('DOMContentLoaded')
    await flushPromises()

    await elements['recording-nav'].click()
    await flushPromises()

    await elements['recording-action'].click()
    await flushPromises()

    assert.equal(startCalls.length, 1)
  } finally {
    global.document = priorDocument
    global.window = priorWindow
  }
})

test('hotkey recording surfaces suspend errors', async () => {
  const jiminy = createJiminy({
    suspendHotkeys: async () => {
      throw new Error('suspend failed')
    }
  })

  const elements = createElements()
  const document = new TestDocument(elements)
  const priorDocument = global.document
  const priorWindow = global.window
  global.document = document
  global.window = { jiminy }

  try {
    loadRenderer()
    document.trigger('DOMContentLoaded')
    await flushPromises()

    await elements['capture-hotkey'].click()
    await flushPromises()

    assert.equal(
      elements['hotkeys-error'].textContent,
      'Failed to suspend hotkeys. Try again or restart the app.'
    )
  } finally {
    global.document = priorDocument
    global.window = priorWindow
  }
})

test('hotkey recording surfaces resume errors', async () => {
  const jiminy = createJiminy({
    suspendHotkeys: async () => {},
    resumeHotkeys: async () => {
      throw new Error('resume failed')
    }
  })

  const elements = createElements()
  const document = new TestDocument(elements)
  const priorDocument = global.document
  const priorWindow = global.window
  global.document = document
  global.window = { jiminy }

  try {
    loadRenderer()
    document.trigger('DOMContentLoaded')
    await flushPromises()

    await elements['capture-hotkey'].click()
    await flushPromises()

    const keydown = elements['capture-hotkey']._listeners.keydown
    await keydown({
      metaKey: true,
      key: 'K',
      preventDefault: () => {},
      stopPropagation: () => {}
    })
    await flushPromises()

    assert.equal(elements['hotkeys-error'].textContent, 'Failed to resume hotkeys. Restart the app.')
  } finally {
    global.document = priorDocument
    global.window = priorWindow
  }
})

test('add exclusion surfaces missing context folder errors', async () => {
  const jiminy = createJiminy({
    pickExclusion: async () => ({ canceled: true })
  })

  const elements = createElements()
  const document = new TestDocument(elements)
  const priorDocument = global.document
  const priorWindow = global.window
  global.document = document
  global.window = { jiminy }

  try {
    loadRenderer()
    document.trigger('DOMContentLoaded')
    await flushPromises()

    await elements['add-exclusion'].click()
    await flushPromises()

    assert.equal(
      elements['exclusions-error'].textContent,
      'Select a context folder before adding exclusions.'
    )
  } finally {
    global.document = priorDocument
    global.window = priorWindow
  }
})

test('add exclusion surfaces missing picker errors', async () => {
  const jiminy = createJiminy()

  const elements = createElements()
  elements['context-folder-path'].value = '/tmp/context'
  const document = new TestDocument(elements)
  const priorDocument = global.document
  const priorWindow = global.window
  global.document = document
  global.window = { jiminy }

  try {
    loadRenderer()
    document.trigger('DOMContentLoaded')
    await flushPromises()

    await elements['add-exclusion'].click()
    await flushPromises()

    assert.equal(
      elements['exclusions-error'].textContent,
      'Exclusion picker unavailable. Restart the app.'
    )
  } finally {
    global.document = priorDocument
    global.window = priorWindow
  }
})

test('add exclusion surfaces picker errors', async () => {
  const jiminy = createJiminy({
    getSettings: async () => ({
      contextFolderPath: '/tmp/context',
      llmProviderName: 'gemini',
      llmProviderApiKey: '',
      exclusions: []
    }),
    pickExclusion: async () => ({ canceled: true, error: 'boom' })
  })

  const elements = createElements()
  const document = new TestDocument(elements)
  const priorDocument = global.document
  const priorWindow = global.window
  global.document = document
  global.window = { jiminy }

  try {
    loadRenderer()
    document.trigger('DOMContentLoaded')
    await flushPromises()

    await elements['add-exclusion'].click()
    await flushPromises()

    assert.equal(elements['exclusions-error'].textContent, 'boom')
  } finally {
    global.document = priorDocument
    global.window = priorWindow
  }
})

test('exclusion save failures surface to the user', async () => {
  const jiminy = createJiminy({
    getSettings: async () => ({
      contextFolderPath: '/tmp/context',
      llmProviderName: 'gemini',
      llmProviderApiKey: '',
      exclusions: []
    }),
    pickExclusion: async () => ({ canceled: false, path: 'foo/bar' }),
    saveSettings: async () => {
      throw new Error('save failed')
    }
  })

  const elements = createElements()
  const document = new TestDocument(elements)
  const priorDocument = global.document
  const priorWindow = global.window
  global.document = document
  global.window = { jiminy }

  try {
    loadRenderer()
    document.trigger('DOMContentLoaded')
    await flushPromises()

    await elements['add-exclusion'].click()
    await flushPromises()

    assert.equal(elements['exclusions-error'].textContent, 'Failed to save exclusions.')
  } finally {
    global.document = priorDocument
    global.window = priorWindow
  }
})

test('prune button clears context graph data', async () => {
  const statusCalls = []
  const pruneCalls = []
  const jiminy = {
    getSettings: async () => ({
      contextFolderPath: '/tmp/context',
      llmProviderName: 'gemini',
      llmProviderApiKey: '',
      exclusions: []
    }),
    pickContextFolder: async () => ({ canceled: true }),
    saveSettings: async () => ({ ok: true }),
    getContextGraphStatus: async (payload) => {
      statusCalls.push(payload)
      return { syncedNodes: 1, totalNodes: 1, maxNodesExceeded: false }
    },
    syncContextGraph: async () => ({ ok: true, warnings: [], errors: [] }),
    pruneContextGraph: async () => {
      pruneCalls.push(true)
      return { ok: true, deleted: true }
    }
  }

  const elements = createElements()
  const document = new TestDocument(elements)
  const priorDocument = global.document
  const priorWindow = global.window
  global.document = document
  global.window = { jiminy }

  try {
    const rendererPath = path.join(__dirname, '..', 'src', 'dashboard', 'renderer.js')
    const resolvedRendererPath = require.resolve(rendererPath)
    delete require.cache[resolvedRendererPath]
    require(resolvedRendererPath)

    document.trigger('DOMContentLoaded')
    await flushPromises()

    assert.equal(elements['context-graph-prune'].disabled, false)
    assert.equal(statusCalls.length, 1)

    await elements['context-graph-prune'].click()
    await flushPromises()

    assert.equal(pruneCalls.length, 1)
    assert.equal(elements['context-graph-prune-status'].textContent, 'Pruned.')
    assert.equal(statusCalls.length, 2)
  } finally {
    global.document = priorDocument
    global.window = priorWindow
  }
})

test('prune button reports nothing to prune when graph is missing', async () => {
  const statusCalls = []
  const pruneCalls = []
  const jiminy = {
    getSettings: async () => ({
      contextFolderPath: '/tmp/context',
      llmProviderName: 'gemini',
      llmProviderApiKey: '',
      exclusions: []
    }),
    pickContextFolder: async () => ({ canceled: true }),
    saveSettings: async () => ({ ok: true }),
    getContextGraphStatus: async (payload) => {
      statusCalls.push(payload)
      return { syncedNodes: 0, totalNodes: 0, maxNodesExceeded: false }
    },
    syncContextGraph: async () => ({ ok: true, warnings: [], errors: [] }),
    pruneContextGraph: async () => {
      pruneCalls.push(true)
      return { ok: true, deleted: false }
    }
  }

  const elements = createElements()
  const document = new TestDocument(elements)
  const priorDocument = global.document
  const priorWindow = global.window
  global.document = document
  global.window = { jiminy }

  try {
    const rendererPath = path.join(__dirname, '..', 'src', 'dashboard', 'renderer.js')
    const resolvedRendererPath = require.resolve(rendererPath)
    delete require.cache[resolvedRendererPath]
    require(resolvedRendererPath)

    document.trigger('DOMContentLoaded')
    await flushPromises()

    assert.equal(elements['context-graph-prune'].disabled, false)
    assert.equal(statusCalls.length, 1)

    await elements['context-graph-prune'].click()
    await flushPromises()

    assert.equal(pruneCalls.length, 1)
    assert.equal(elements['context-graph-prune-status'].textContent, 'Nothing to prune.')
    assert.equal(statusCalls.length, 2)
  } finally {
    global.document = priorDocument
    global.window = priorWindow
  }
})

test('auto-saves LLM provider selection', async () => {
  const saveCalls = []
  const jiminy = {
    getSettings: async () => ({
      contextFolderPath: '',
      llmProviderName: 'gemini',
      llmProviderApiKey: '',
      exclusions: []
    }),
    pickContextFolder: async () => ({ canceled: true }),
    saveSettings: async (payload) => {
      saveCalls.push(payload)
      return { ok: true }
    },
    getContextGraphStatus: async () => ({ syncedNodes: 0, totalNodes: 0, maxNodesExceeded: false })
  }

  const elements = createElements()
  const document = new TestDocument(elements)
  const priorDocument = global.document
  const priorWindow = global.window
  global.document = document
  global.window = { jiminy }

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
  const jiminy = createJiminy({
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
  global.window = { jiminy }

  try {
    loadRenderer()
    document.trigger('DOMContentLoaded')
    await flushPromises()

    await elements['updates-check'].click()
    await flushPromises()

    assert.equal(updateCalls.length, 1)
    assert.equal(
      elements['updates-status'].textContent,
      'Update available: 0.0.1 -> 0.0.2. Check the download prompt.'
    )
  } finally {
    global.document = priorDocument
    global.window = priorWindow
  }
})

test('check for updates reports no update when latest matches current', async () => {
  const updateCalls = []
  const jiminy = createJiminy({
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
  global.window = { jiminy }

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
  const jiminy = createJiminy({
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
  global.window = { jiminy }

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

test('history tab fetches flows when selected', async () => {
  const flowCalls = []
  const jiminy = createJiminy({
    getHistoryFlows: async () => {
      flowCalls.push(true)
      return []
    }
  })

  const elements = createElements()
  const document = new TestDocument(elements)
  const priorDocument = global.document
  const priorWindow = global.window
  global.document = document
  global.window = { jiminy }

  try {
    loadRenderer()
    document.trigger('DOMContentLoaded')
    await flushPromises()

    await elements['history-nav'].click()
    await flushPromises()

    assert.equal(flowCalls.length, 1)
    assert.equal(elements['history-empty'].textContent, 'No history yet.')
  } finally {
    global.document = priorDocument
    global.window = priorWindow
  }
})
