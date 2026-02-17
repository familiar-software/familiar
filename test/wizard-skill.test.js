const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')

class ClassList {
  constructor() {
    this.names = new Set(['hidden'])
  }

  toggle(name, force) {
    if (force === undefined) {
      if (this.names.has(name)) {
        this.names.delete(name)
        return false
      }
      this.names.add(name)
      return true
    }

    if (force) {
      this.names.add(name)
    } else {
      this.names.delete(name)
    }
    return force
  }

  contains(name) {
    return this.names.has(name)
  }
}

class TestInput {
  constructor(value) {
    this.value = value
    this.checked = false
    this._listeners = {}
  }

  addEventListener(event, handler) {
    this._listeners[event] = handler
  }

  async triggerChange(checked = this.checked) {
    this.checked = checked
    if (typeof this._listeners.change === 'function') {
      await this._listeners.change({ target: this })
    }
  }
}

class TestButton {
  constructor() {
    this.disabled = false
    this._listeners = {}
  }

  addEventListener(event, handler) {
    this._listeners[event] = handler
  }

  async click() {
    if (typeof this._listeners.click === 'function') {
      await this._listeners.click()
    }
  }
}

const setMessage = (elements, message) => {
  const targets = Array.isArray(elements) ? elements : [elements]
  const value = message || ''
  for (const element of targets) {
    if (!element) {
      continue
    }
    element.textContent = value
    element.classList.toggle('hidden', !value)
  }
}

const loadWizardSkillModule = () => {
  const modulePath = path.join(__dirname, '..', 'src', 'dashboard', 'wizard-skill.js')
  const resolvedPath = require.resolve(modulePath)
  delete require.cache[resolvedPath]
  return require(modulePath)
}

const createHarness = ({
  currentSkillHarness = '',
  currentSkillHarnesses = [],
  getStatus,
  installSkill,
  saveSettings
} = {}) => {
  const state = {
    currentSkillHarness,
    currentSkillHarnesses: Array.isArray(currentSkillHarnesses) ? [...currentSkillHarnesses] : []
  }
  const claude = new TestInput('claude')
  const codex = new TestInput('codex')
  const antigravity = new TestInput('antigravity')
  const cursor = new TestInput('cursor')
  const settingsCodex = new TestInput('codex')
  const settingsAntigravity = new TestInput('antigravity')
  const settingsCursor = new TestInput('cursor')
  const wizardSkillCursorRestartNote = { classList: new ClassList() }
  const settingsSkillCursorRestartNote = { classList: new ClassList() }
  const wizardSkillPath = { classList: new ClassList(), textContent: '' }
  const settingsSkillPath = { classList: new ClassList(), textContent: '' }
  const wizardSkillStatus = { classList: new ClassList(), textContent: '' }
  const settingsSkillStatus = { classList: new ClassList(), textContent: '' }
  const wizardSkillInstallButton = new TestButton()
  const settingsSkillInstallButton = new TestButton()
  const installCalls = []
  const statusCalls = []
  const saveCalls = []

  const familiar = {
    getSkillInstallStatus: async ({ harness }) => {
      statusCalls.push(harness)
      if (typeof getStatus === 'function') {
        return getStatus({ harness })
      }
      return { ok: true, installed: false, path: '' }
    },
    installSkill: async ({ harness }) => {
      installCalls.push(harness)
      if (typeof installSkill === 'function') {
        return installSkill({ harness })
      }
      return { ok: true, path: `/tmp/.${harness}/skills/familiar` }
    },
    saveSettings: async (payload) => {
      saveCalls.push(payload)
      if (typeof saveSettings === 'function') {
        return saveSettings(payload)
      }
      return { ok: true }
    }
  }

  const registry = loadWizardSkillModule()
  const api = registry.createWizardSkill({
    elements: {
      skillHarnessInputs: [
        claude,
        codex,
        antigravity,
        cursor,
        settingsCodex,
        settingsAntigravity,
        settingsCursor
      ],
      skillInstallButtons: [wizardSkillInstallButton, settingsSkillInstallButton],
      skillInstallPaths: [wizardSkillPath, settingsSkillPath],
      skillInstallStatuses: [wizardSkillStatus, settingsSkillStatus],
      skillCursorRestartNotes: [wizardSkillCursorRestartNote, settingsSkillCursorRestartNote]
    },
    familiar,
    getState: () => ({
      currentSkillHarness: state.currentSkillHarness,
      currentSkillHarnesses: state.currentSkillHarnesses
    }),
    setSkillHarness: (harness) => {
      state.currentSkillHarness = harness
      state.currentSkillHarnesses = harness ? [harness] : []
    },
    setSkillHarnesses: (harnesses) => {
      state.currentSkillHarnesses = [...harnesses]
      state.currentSkillHarness = harnesses[0] || ''
    },
    setSkillInstalled: () => {},
    setMessage,
    updateWizardUI: () => {}
  })

  return {
    claude,
    codex,
    antigravity,
    cursor,
    settingsCodex,
    settingsAntigravity,
    settingsCursor,
    wizardSkillCursorRestartNote,
    settingsSkillCursorRestartNote,
    wizardSkillPath,
    settingsSkillPath,
    wizardSkillStatus,
    settingsSkillStatus,
    wizardSkillInstallButton,
    settingsSkillInstallButton,
    installCalls,
    statusCalls,
    saveCalls,
    api
  }
}

test('wizard skill supports multi-select and shows cursor restart note when cursor is included', async () => {
  const priorWindow = global.window
  global.window = {}

  try {
    const {
      codex,
      antigravity,
      cursor,
      settingsCodex,
      settingsAntigravity,
      settingsCursor,
      wizardSkillCursorRestartNote,
      settingsSkillCursorRestartNote
    } = createHarness()

    assert.equal(wizardSkillCursorRestartNote.classList.contains('hidden'), true)
    assert.equal(settingsSkillCursorRestartNote.classList.contains('hidden'), true)

    await codex.triggerChange(true)
    assert.equal(codex.checked, true)
    assert.equal(settingsCodex.checked, true)
    assert.equal(wizardSkillCursorRestartNote.classList.contains('hidden'), true)

    await antigravity.triggerChange(true)
    assert.equal(antigravity.checked, true)
    assert.equal(settingsAntigravity.checked, true)
    assert.equal(codex.checked, true)
    assert.equal(wizardSkillCursorRestartNote.classList.contains('hidden'), true)

    await cursor.triggerChange(true)
    assert.equal(cursor.checked, true)
    assert.equal(settingsCursor.checked, true)
    assert.equal(wizardSkillCursorRestartNote.classList.contains('hidden'), false)
    assert.equal(settingsSkillCursorRestartNote.classList.contains('hidden'), false)

    await cursor.triggerChange(false)
    assert.equal(cursor.checked, false)
    assert.equal(settingsCursor.checked, false)
    assert.equal(wizardSkillCursorRestartNote.classList.contains('hidden'), true)
    assert.equal(settingsSkillCursorRestartNote.classList.contains('hidden'), true)
    assert.equal(codex.checked, true)
    assert.equal(antigravity.checked, true)
  } finally {
    global.window = priorWindow
  }
})

test('wizard skill shows cursor restart note on init when cursor is in selected harnesses', async () => {
  const priorWindow = global.window
  global.window = {}

  try {
    const { wizardSkillCursorRestartNote, settingsSkillCursorRestartNote } = createHarness({
      currentSkillHarnesses: ['codex', 'cursor']
    })
    await new Promise((resolve) => setImmediate(resolve))

    assert.equal(wizardSkillCursorRestartNote.classList.contains('hidden'), false)
    assert.equal(settingsSkillCursorRestartNote.classList.contains('hidden'), false)
  } finally {
    global.window = priorWindow
  }
})

test('wizard skill shows missing install paths and then a multi-installed status', async () => {
  const priorWindow = global.window
  global.window = {}
  const statusByHarness = {
    codex: { ok: true, installed: false, path: '/tmp/.codex/skills/familiar' },
    cursor: { ok: true, installed: false, path: '/tmp/.cursor/skills/familiar' }
  }

  try {
    const { codex, cursor, wizardSkillPath, wizardSkillStatus, api } = createHarness({
      getStatus: ({ harness }) => statusByHarness[harness]
    })

    await codex.triggerChange(true)
    await cursor.triggerChange(true)
    assert.match(wizardSkillPath.textContent, /Install paths:/)
    assert.match(wizardSkillPath.textContent, /Codex: \/tmp\/\.codex\/skills\/familiar/)
    assert.match(wizardSkillPath.textContent, /Cursor: \/tmp\/\.cursor\/skills\/familiar/)
    assert.equal(wizardSkillStatus.textContent, '')

    statusByHarness.codex = { ok: true, installed: true, path: '/tmp/.codex/skills/familiar' }
    statusByHarness.cursor = { ok: true, installed: true, path: '/tmp/.cursor/skills/familiar' }
    await api.checkInstallStatus(['codex', 'cursor'])

    assert.equal(wizardSkillPath.textContent, '')
    assert.equal(wizardSkillStatus.textContent, 'Installed for Codex, Cursor.')
    assert.equal(wizardSkillStatus.classList.contains('hidden'), false)
  } finally {
    global.window = priorWindow
  }
})

test('wizard skill installs for all selected harnesses on install click', async () => {
  const priorWindow = global.window
  global.window = {}

  try {
    const { codex, cursor, wizardSkillInstallButton, installCalls, saveCalls, wizardSkillStatus } = createHarness({
      getStatus: ({ harness }) => ({ ok: true, installed: false, path: `/tmp/.${harness}/skills/familiar` }),
      installSkill: async ({ harness }) => ({ ok: true, path: `/tmp/.${harness}/skills/familiar` })
    })

    await codex.triggerChange(true)
    await cursor.triggerChange(true)
    await wizardSkillInstallButton.click()
    await new Promise((resolve) => setImmediate(resolve))

    assert.deepEqual(installCalls, ['codex', 'cursor'])
    assert.equal(wizardSkillStatus.textContent, 'Installed for Codex, Cursor.')
    assert.equal(saveCalls.length > 0, true)
    const latestSave = saveCalls[saveCalls.length - 1]
    assert.deepEqual(latestSave.skillInstaller.harness, ['codex', 'cursor'])
    assert.deepEqual(
      latestSave.skillInstaller.installPath,
      ['/tmp/.codex/skills/familiar', '/tmp/.cursor/skills/familiar']
    )
  } finally {
    global.window = priorWindow
  }
})

test('wizard skill clears persisted harness list when all options are deselected', async () => {
  const priorWindow = global.window
  global.window = {}

  try {
    const { codex, cursor, settingsCodex, settingsCursor, saveCalls } = createHarness({
      currentSkillHarnesses: ['codex', 'cursor']
    })

    await codex.triggerChange(false)
    await cursor.triggerChange(false)

    assert.equal(settingsCodex.checked, false)
    assert.equal(settingsCursor.checked, false)
    assert.equal(saveCalls.length > 0, true)
    const lastSave = saveCalls[saveCalls.length - 1]
    assert.deepEqual(lastSave.skillInstaller.harness, [])
    assert.deepEqual(lastSave.skillInstaller.installPath, [])
  } finally {
    global.window = priorWindow
  }
})

test('wizard skill clears all duplicate picker inputs and persists empty list when deselecting last selected harness', async () => {
  const priorWindow = global.window
  global.window = {}

  try {
    const { codex, settingsCodex, saveCalls } = createHarness({
      currentSkillHarnesses: ['codex']
    })

    codex.checked = true
    settingsCodex.checked = true

    await codex.triggerChange(false)

    assert.equal(codex.checked, false)
    assert.equal(settingsCodex.checked, false)
    const lastSave = saveCalls[saveCalls.length - 1]
    assert.deepEqual(lastSave.skillInstaller.harness, [])
    assert.deepEqual(lastSave.skillInstaller.installPath, [])
  } finally {
    global.window = priorWindow
  }
})
