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

  async triggerChange() {
    if (typeof this._listeners.change === 'function') {
      await this._listeners.change({ target: this })
    }
  }
}

const loadWizardSkillModule = () => {
  const modulePath = path.join(__dirname, '..', 'src', 'dashboard', 'wizard-skill.js')
  const resolvedPath = require.resolve(modulePath)
  delete require.cache[resolvedPath]
  return require(modulePath)
}

const createHarness = ({ currentSkillHarness = '' } = {}) => {
  const state = { currentSkillHarness }
  const claude = new TestInput('claude')
  const codex = new TestInput('codex')
  const cursor = new TestInput('cursor')
  const settingsCodex = new TestInput('codex')
  const settingsCursor = new TestInput('cursor')
  const wizardSkillCursorRestartNote = { classList: new ClassList() }
  const settingsSkillCursorRestartNote = { classList: new ClassList() }

  const familiar = {
    getSkillInstallStatus: async () => ({ ok: true, installed: false, path: '' }),
    installSkill: async () => ({ ok: true, path: '/tmp/skills/familiar' })
  }

  const registry = loadWizardSkillModule()
  registry.createWizardSkill({
    elements: {
      skillHarnessInputs: [claude, codex, cursor, settingsCodex, settingsCursor],
      skillInstallButtons: [
        { disabled: false, addEventListener: () => {} },
        { disabled: false, addEventListener: () => {} }
      ],
      skillInstallPaths: [
        { classList: new ClassList(), textContent: '' },
        { classList: new ClassList(), textContent: '' }
      ],
      skillCursorRestartNotes: [wizardSkillCursorRestartNote, settingsSkillCursorRestartNote]
    },
    familiar,
    getState: () => ({ currentSkillHarness: state.currentSkillHarness }),
    setSkillHarness: (harness) => {
      state.currentSkillHarness = harness
    },
    setSkillInstalled: () => {},
    setMessage: () => {},
    updateWizardUI: () => {}
  })

  return {
    claude,
    codex,
    cursor,
    settingsCodex,
    settingsCursor,
    wizardSkillCursorRestartNote,
    settingsSkillCursorRestartNote
  }
}

test('wizard skill shows cursor restart note only for cursor harness selection', async () => {
  const priorWindow = global.window
  global.window = {}

  try {
    const {
      claude,
      codex,
      cursor,
      settingsCodex,
      settingsCursor,
      wizardSkillCursorRestartNote,
      settingsSkillCursorRestartNote
    } = createHarness()

    assert.equal(wizardSkillCursorRestartNote.classList.contains('hidden'), true)
    assert.equal(settingsSkillCursorRestartNote.classList.contains('hidden'), true)

    await codex.triggerChange()
    assert.equal(wizardSkillCursorRestartNote.classList.contains('hidden'), true)
    assert.equal(settingsSkillCursorRestartNote.classList.contains('hidden'), true)
    assert.equal(codex.checked, true)
    assert.equal(settingsCodex.checked, true)

    await cursor.triggerChange()
    assert.equal(wizardSkillCursorRestartNote.classList.contains('hidden'), false)
    assert.equal(settingsSkillCursorRestartNote.classList.contains('hidden'), false)
    assert.equal(codex.checked, false)
    assert.equal(settingsCodex.checked, false)
    assert.equal(cursor.checked, true)
    assert.equal(settingsCursor.checked, true)

    await claude.triggerChange()
    assert.equal(wizardSkillCursorRestartNote.classList.contains('hidden'), true)
    assert.equal(settingsSkillCursorRestartNote.classList.contains('hidden'), true)
  } finally {
    global.window = priorWindow
  }
})

test('wizard skill shows cursor restart note on init when cursor is already selected', async () => {
  const priorWindow = global.window
  global.window = {}

  try {
    const { wizardSkillCursorRestartNote, settingsSkillCursorRestartNote } = createHarness({ currentSkillHarness: 'cursor' })
    await new Promise((resolve) => setImmediate(resolve))

    assert.equal(wizardSkillCursorRestartNote.classList.contains('hidden'), false)
    assert.equal(settingsSkillCursorRestartNote.classList.contains('hidden'), false)
  } finally {
    global.window = priorWindow
  }
})
