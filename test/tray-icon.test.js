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
