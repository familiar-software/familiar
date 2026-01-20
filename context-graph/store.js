const fs = require('node:fs')
const path = require('node:path')
const { resolveSettingsDir } = require('../settings')

const { CONTEXT_GRAPH_FILE_NAME } = require('../const')

class ContextGraphStore {
  load () {
    throw new Error('ContextGraphStore.load not implemented')
  }

  save (_graph) {
    throw new Error('ContextGraphStore.save not implemented')
  }

  getPath () {
    throw new Error('ContextGraphStore.getPath not implemented')
  }
}

class JsonContextGraphStore extends ContextGraphStore {
  constructor (options = {}) {
    super()
    this.settingsDir = resolveSettingsDir(options.settingsDir)
    this.graphPath = path.join(this.settingsDir, CONTEXT_GRAPH_FILE_NAME)
  }

  getPath () {
    return this.graphPath
  }

  load () {
    if (!fs.existsSync(this.graphPath)) {
      return null
    }

    const raw = fs.readFileSync(this.graphPath, 'utf-8')
    if (!raw.trim()) {
      return null
    }

    try {
      return JSON.parse(raw)
    } catch (error) {
      console.error('Failed to parse context graph', error)
      return null
    }
  }

  save (graph) {
    fs.mkdirSync(this.settingsDir, { recursive: true })
    fs.writeFileSync(this.graphPath, JSON.stringify(graph, null, 2), 'utf-8')
    return this.graphPath
  }
}

module.exports = {
  ContextGraphStore,
  JsonContextGraphStore,
  CONTEXT_GRAPH_FILE_NAME
}
