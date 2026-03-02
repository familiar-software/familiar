const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { microcopy, formatters } = require('../src/microcopy')

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
  saveSettings,
  openCloudCoWorkGuide
} = {}) => {
  const state = {
    currentSkillHarness,
    currentSkillHarnesses: Array.isArray(currentSkillHarnesses) ? [...currentSkillHarnesses] : []
  }
  const claude = new TestInput('claude')
  const codex = new TestInput('codex')
  const antigravity = new TestInput('antigravity')
  const cursor = new TestInput('cursor')
  const cloudCoWork = new TestInput('cloud-cowork')
  const settingsCodex = new TestInput('codex')
  const settingsAntigravity = new TestInput('antigravity')
  const settingsCursor = new TestInput('cursor')
  const settingsCloudCoWork = new TestInput('cloud-cowork')
  const wizardSkillCursorRestartNote = { classList: new ClassList() }
  const settingsSkillCursorRestartNote = { classList: new ClassList() }
  const wizardSkillPath = { classList: new ClassList(), textContent: '' }
  const settingsSkillPath = { classList: new ClassList(), textContent: '' }
  const wizardSkillStatus = { classList: new ClassList(), textContent: '' }
  const settingsSkillStatus = { classList: new ClassList(), textContent: '' }
  const installCalls = []
  const statusCalls = []
  const saveCalls = []
  const openGuideCalls = []

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
        cloudCoWork,
        settingsCodex,
        settingsAntigravity,
        settingsCursor,
        settingsCloudCoWork
      ],
      skillInstallPaths: [wizardSkillPath, settingsSkillPath],
      skillInstallStatuses: [wizardSkillStatus, settingsSkillStatus],
      skillCursorRestartNotes: [wizardSkillCursorRestartNote, settingsSkillCursorRestartNote]
    },
    familiar,
    cloudCoWorkGuide: {
      openGuide: () => {
        openGuideCalls.push(true)
        if (typeof openCloudCoWorkGuide === 'function') {
          return openCloudCoWorkGuide()
        }
        return { ok: true }
      }
    },
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
    cloudCoWork,
    settingsCodex,
    settingsAntigravity,
    settingsCursor,
    settingsCloudCoWork,
    wizardSkillCursorRestartNote,
    settingsSkillCursorRestartNote,
    wizardSkillPath,
    settingsSkillPath,
    wizardSkillStatus,
    settingsSkillStatus,
    installCalls,
    statusCalls,
    saveCalls,
    openGuideCalls,
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

test('wizard skill auto-installs on selection changes and reports multi-installed status', async () => {
  const priorWindow = global.window
  global.window = {}

  try {
    const statusByHarness = {
      codex: { ok: true, installed: false, path: '/tmp/.codex/skills/familiar' },
      cursor: { ok: true, installed: false, path: '/tmp/.cursor/skills/familiar' }
    }
    const { codex, cursor, wizardSkillPath, wizardSkillStatus, installCalls } = createHarness({
      getStatus: ({ harness }) => statusByHarness[harness],
      installSkill: async ({ harness }) => {
        statusByHarness[harness] = { ok: true, installed: true, path: `/tmp/.${harness}/skills/familiar` }
        return { ok: true, path: `/tmp/.${harness}/skills/familiar` }
      }
    })

    await codex.triggerChange(true)
    await cursor.triggerChange(true)
    await new Promise((resolve) => setImmediate(resolve))

    assert.deepEqual(installCalls, ['codex', 'codex', 'cursor'])
    assert.equal(wizardSkillPath.textContent, '')
    assert.equal(wizardSkillStatus.textContent, formatters.wizardSkillInstalledFor('Codex, Cursor'))
    assert.equal(wizardSkillStatus.classList.contains('hidden'), false)
  } finally {
    global.window = priorWindow
  }
})

test('wizard skill installs selected harness immediately on selection', async () => {
  const priorWindow = global.window
  global.window = {}

  try {
    const { codex, installCalls, saveCalls, wizardSkillStatus } = createHarness({
      getStatus: ({ harness }) => ({ ok: true, installed: false, path: `/tmp/.${harness}/skills/familiar` }),
      installSkill: async ({ harness }) => ({ ok: true, path: `/tmp/.${harness}/skills/familiar` })
    })

    await codex.triggerChange(true)
    await new Promise((resolve) => setImmediate(resolve))

    assert.deepEqual(installCalls, ['codex'])
    assert.equal(wizardSkillStatus.textContent, formatters.wizardSkillInstalledAt('/tmp/.codex/skills/familiar'))
    assert.equal(saveCalls.length > 0, true)
    const latestSave = saveCalls[saveCalls.length - 1]
    assert.deepEqual(latestSave.skillInstaller.harness, ['codex'])
    assert.deepEqual(latestSave.skillInstaller.installPath, ['/tmp/.codex/skills/familiar'])
  } finally {
    global.window = priorWindow
  }
})

test('wizard skill opens Claude Cowork guide immediately on selection without calling installer APIs', async () => {
  const priorWindow = global.window
  global.window = {}

  try {
    const {
      cloudCoWork,
      settingsCloudCoWork,
      installCalls,
      statusCalls,
      saveCalls,
      openGuideCalls,
      wizardSkillStatus
    } = createHarness()

    await cloudCoWork.triggerChange(true)
    assert.equal(cloudCoWork.checked, true)
    assert.equal(settingsCloudCoWork.checked, true)
    assert.deepEqual(statusCalls, [])
    await new Promise((resolve) => setImmediate(resolve))

    assert.deepEqual(installCalls, [])
    assert.equal(openGuideCalls.length, 1)
    assert.equal(wizardSkillStatus.textContent, microcopy.dashboard.wizardSkill.messages.openedCloudCoworkGuide)
    assert.equal(saveCalls.length > 0, true)
    const latestSave = saveCalls[saveCalls.length - 1]
    assert.deepEqual(latestSave.skillInstaller.harness, [])
    assert.deepEqual(latestSave.skillInstaller.installPath, [])
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
