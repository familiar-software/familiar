const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')

const {
  createTrayIconFactory,
  getTrayIconPathForMenuBar
} = require('../src/tray/icon')

const defaultIconPath = path.join(__dirname, '..', 'src', 'icon_white_owl.png')

const createMockImage = ({ empty = false, dataUrl = 'data:image/png;base64,base' } = {}) => ({
  empty,
  resizeCalls: [],
  templateCalls: [],
  isEmpty() {
    return this.empty
  },
  resize(options) {
    this.resizeCalls.push(options)
    return this
  },
  setTemplateImage(value) {
    this.templateCalls.push(value)
  },
  toDataURL() {
    return dataUrl
  },
  toBitmap() {
    return Buffer.alloc(16 * 16 * 4)
  }
})

test('uses the configured icon path when unread badge is disabled', () => {
  const iconPath = getTrayIconPathForMenuBar({
    defaultIconPath
  })

  assert.equal(iconPath, defaultIconPath)
})

test('ignores visual state flags and always uses the configured icon path', () => {
  const iconPath = getTrayIconPathForMenuBar({
    defaultIconPath,
    isDarkMode: false
  })

  assert.equal(iconPath, defaultIconPath)
})

test('createTrayIconFactory keeps normal tray icons as template images', () => {
  const baseIcon = createMockImage()
  const nativeImage = {
    createFromPath: () => baseIcon,
    createEmpty: () => createMockImage({ empty: true })
  }
  const createTrayIcon = createTrayIconFactory({ nativeImage })

  const icon = createTrayIcon({
    defaultIconPath,
    isDarkMode: true
  })

  assert.equal(icon, baseIcon)
  assert.deepEqual(baseIcon.templateCalls, [process.platform === 'darwin'])
})

test('createTrayIconFactory uses separate cache keys for paused and active', () => {
  const baseIcon = createMockImage()
  let createFromPathCalls = 0
  const nativeImage = {
    createFromPath: () => { createFromPathCalls++; return createMockImage() },
    createEmpty: () => createMockImage({ empty: true }),
    createFromDataURL: () => createMockImage(),
    createFromBuffer: (buf, size) => createMockImage()
  }
  const createTrayIcon = createTrayIconFactory({ nativeImage })

  createTrayIcon({ defaultIconPath, isPaused: false })
  createTrayIcon({ defaultIconPath, isPaused: true })

  assert.equal(createFromPathCalls, 2, 'should create separate icons for paused and active')

  createTrayIcon({ defaultIconPath, isPaused: false })
  createTrayIcon({ defaultIconPath, isPaused: true })

  assert.equal(createFromPathCalls, 2, 'should use cache on subsequent calls')
})
