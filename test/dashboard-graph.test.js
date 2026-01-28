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
      }
    }
    this.hidden = false
    this.disabled = false
    this.textContent = ''
    this.className = ''
    this._listeners = {}
  }

  addEventListener(event, handler) {
    this._listeners[event] = handler
  }
}

const loadGraph = () => {
  const graphPath = path.join(__dirname, '..', 'src', 'dashboard', 'graph.js')
  const resolvedGraphPath = require.resolve(graphPath)
  delete require.cache[resolvedGraphPath]
  require(resolvedGraphPath)
  return global.window.JiminyGraph
}

test('refreshContextGraphStatus updates metrics and status text', async () => {
  const syncButton = new TestElement()
  const syncStatus = new TestElement()
  const syncStats = new TestElement()
  const syncProgress = new TestElement()
  const syncWarning = new TestElement()
  const syncError = new TestElement()
  const statusPill = new TestElement()
  const statusDot = new TestElement()
  const statusLabel = new TestElement()
  const percentLabel = new TestElement()
  const barSynced = new TestElement()
  const barPending = new TestElement()
  const barNew = new TestElement()
  const syncedCount = new TestElement()
  const pendingCount = new TestElement()
  const newCount = new TestElement()

  const jiminy = {
    getContextGraphStatus: async () => ({
      syncedNodes: 8,
      outOfSyncNodes: 2,
      newNodes: 0,
      totalNodes: 10,
      maxNodesExceeded: false
    })
  }

  const updates = []
  const previousWindow = global.window
  global.window = {}

  try {
    const graphModule = loadGraph()
    const graphApi = graphModule.createGraph({
      elements: {
        syncButtons: [syncButton],
        syncStatuses: [syncStatus],
        syncStats: [syncStats],
        syncProgress: [syncProgress],
        syncWarnings: [syncWarning],
        syncErrors: [syncError],
        statusPill,
        statusDot,
        statusLabel,
        percentLabel,
        barSynced,
        barPending,
        barNew,
        syncedCount,
        pendingCount,
        newCount
      },
      jiminy,
      getState: () => ({
        currentContextFolderPath: '/tmp/context',
        currentExclusions: []
      }),
      setGraphState: (update) => updates.push(update)
    })

    await graphApi.refreshContextGraphStatus()

    assert.equal(percentLabel.textContent, '80%')
    assert.equal(syncedCount.textContent, '8')
    assert.equal(pendingCount.textContent, '2')
    assert.equal(newCount.textContent, '0')
    assert.equal(barSynced.style.width, '80%')
    assert.equal(barPending.style.width, '20%')
    assert.equal(barNew.style.width, '0%')
    assert.equal(syncStats.textContent, 'Synced: 8/10 | Out of sync: 2/10 | New: 0 | Ignored: 0')
    assert.equal(statusLabel.textContent, 'Needs sync')
    assert.equal(updates[0].isContextGraphSynced, false)
  } finally {
    global.window = previousWindow
  }
})

test('updatePruneButtonState disables prune without a context folder', () => {
  const pruneButton = new TestElement()
  let contextFolderPath = ''
  const previousWindow = global.window
  global.window = {}

  try {
    const graphModule = loadGraph()
    const graphApi = graphModule.createGraph({
      elements: {
        pruneButtons: [pruneButton]
      },
      getState: () => ({
        currentContextFolderPath: contextFolderPath
      })
    })

    graphApi.updatePruneButtonState()
    assert.equal(pruneButton.disabled, true)

    contextFolderPath = '/tmp/context'
    graphApi.updatePruneButtonState()
    assert.equal(pruneButton.disabled, false)
  } finally {
    global.window = previousWindow
  }
})
