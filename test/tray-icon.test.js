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

test('uses the black owl icon for unread badge in light mode', () => {
  const iconPath = getTrayIconPathForMenuBar({
    defaultIconPath,
    hasUnreadHeartbeats: true,
    isDarkMode: false
  })

  assert.equal(iconPath, path.join(path.dirname(defaultIconPath), 'icon_green_owl.png'))
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
    hasUnreadHeartbeats: false,
    isDarkMode: true
  })

  assert.equal(icon, baseIcon)
  assert.deepEqual(baseIcon.templateCalls, [process.platform === 'darwin'])
})

test('createTrayIconFactory uses the green owl asset as a non-template unread icon', () => {
  const pathCalls = []
  const unreadIcon = createMockImage({ dataUrl: 'data:image/png;base64,green-icon' })
  const nativeImage = {
    createFromPath: (targetPath) => {
      pathCalls.push(targetPath)
      return unreadIcon
    },
    createEmpty: () => createMockImage({ empty: true })
  }
  const createTrayIcon = createTrayIconFactory({ nativeImage })

  const icon = createTrayIcon({
    defaultIconPath,
    hasUnreadHeartbeats: true,
    isDarkMode: false
  })

  assert.equal(icon, unreadIcon)
  assert.equal(pathCalls[0], path.join(path.dirname(defaultIconPath), 'icon_green_owl.png'))
  assert.deepEqual(unreadIcon.templateCalls, [false])
})
