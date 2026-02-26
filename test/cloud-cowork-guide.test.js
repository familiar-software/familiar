const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { microcopy } = require('../src/microcopy')

class ClassList {
  constructor() {
    this.names = new Set(['hidden'])
  }

  toggle(name, force) {
    if (force) {
      this.names.add(name)
      return true
    }
    this.names.delete(name)
    return false
  }

  contains(name) {
    return this.names.has(name)
  }
}

class TestElement {
  constructor() {
    this.classList = new ClassList()
    this.textContent = ''
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
  for (const target of targets) {
    target.textContent = value
    target.classList.toggle('hidden', !value)
  }
}

const loadGuideModule = () => {
  const modulePath = path.join(
    __dirname,
    '..',
    'src',
    'dashboard',
    'skill-install',
    'cloud-cowork-guide.js'
  )
  const resolvedPath = require.resolve(modulePath)
  delete require.cache[resolvedPath]
  return require(modulePath)
}

test('Claude Cowork guide opens, closes, and reports marketplace URL', async () => {
  const priorWindow = global.window
  global.window = {}

  try {
    const container = new TestElement()
    const doneButton = new TestElement()
    const copyButton = new TestElement()
    const status = new TestElement()
    const error = new TestElement()

    const registry = loadGuideModule()
    const guide = registry.createCloudCoWorkGuide({
      elements: {
        guideContainers: [container],
        closeButtons: [doneButton],
        copyLinkButtons: [copyButton],
        statusElements: [status],
        errorElements: [error]
      },
      setMessage
    })

    const openResult = guide.openGuide()
    assert.equal(openResult.ok, true)
    assert.equal(
      openResult.url,
      'https://github.com/familiar-software/familiar-claude-cowork-skill'
    )
    assert.equal(container.classList.contains('hidden'), false)

    await doneButton.click()
    assert.equal(container.classList.contains('hidden'), true)
  } finally {
    global.window = priorWindow
  }
})

test('Claude Cowork guide copy link handles clipboard success and failure', async () => {
  const priorWindow = global.window
  global.window = {
    navigator: {
      clipboard: {
        writeText: async () => {}
      }
    }
  }

  try {
    const container = new TestElement()
    const copyButton = new TestElement()
    const status = new TestElement()
    const error = new TestElement()

    const registry = loadGuideModule()
    const guide = registry.createCloudCoWorkGuide({
      elements: {
        guideContainers: [container],
        copyLinkButtons: [copyButton],
        statusElements: [status],
        errorElements: [error]
      },
      setMessage
    })

    await guide.copyMarketplaceUrl()
    assert.equal(status.textContent, microcopy.dashboard.cloudCoworkGuide.marketplaceLinkCopied)
    assert.equal(error.textContent, '')

    global.window.navigator.clipboard.writeText = async () => {
      throw new Error('denied')
    }
    await copyButton.click()
    assert.equal(status.textContent, '')
    assert.equal(error.textContent, microcopy.dashboard.cloudCoworkGuide.failedToCopyLink)
  } finally {
    global.window = priorWindow
  }
})
