const assert = require('node:assert/strict')
const { test } = require('node:test')
const path = require('node:path')

const stateModulePath = path.join(__dirname, '..', 'src', 'dashboard', 'state.js')

function loadCreateDashboardState() {
  global.FamiliarAutoCleanupRetention = {
    resolveAutoCleanupRetentionDays: (value) => {
      const numeric = Number(value)
      if (numeric === 1 || numeric === 2 || numeric === 7) {
        return numeric
      }
      return 2
    }
  }

  const resolvedPath = require.resolve(stateModulePath)
  delete require.cache[resolvedPath]
  const moduleExports = require(resolvedPath)
  return moduleExports.createDashboardState
}

test('setContextFolderValue appends familiar in display but keeps raw state path', () => {
  const createDashboardState = loadCreateDashboardState()
  const input = { value: '' }
  const state = createDashboardState({
    elements: {
      contextFolderInputs: [input]
    },
    apis: {}
  })

  state.setContextFolderValue('/tmp/context')

  assert.equal(input.value, '/tmp/context/familiar')
  assert.equal(state.getSettingsState().currentContextFolderPath, '/tmp/context')
})

test('setContextFolderValue does not duplicate familiar suffix in display', () => {
  const createDashboardState = loadCreateDashboardState()
  const input = { value: '' }
  const state = createDashboardState({
    elements: {
      contextFolderInputs: [input]
    },
    apis: {}
  })

  state.setContextFolderValue('/tmp/context/familiar')

  assert.equal(input.value, '/tmp/context/familiar')
  assert.equal(state.getSettingsState().currentContextFolderPath, '/tmp/context/familiar')
})
