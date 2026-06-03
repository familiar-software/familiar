const test = require('node:test')
const assert = require('node:assert/strict')

const {
  createMeetingRecordingShortcutController,
  normalizeMeetingRecordingShortcut
} = require('../src/audio-shortcut')

test('normalizeMeetingRecordingShortcut returns null for empty values', () => {
  assert.equal(normalizeMeetingRecordingShortcut(null), null)
  assert.equal(normalizeMeetingRecordingShortcut(undefined), null)
  assert.equal(normalizeMeetingRecordingShortcut('  '), null)
})

test('meeting recording shortcut controller registers and toggles recording', () => {
  const registered = new Map()
  let toggleCalls = 0
  const controller = createMeetingRecordingShortcutController({
    globalShortcut: {
      register: (accelerator, callback) => {
        registered.set(accelerator, callback)
        return true
      },
      unregister: (accelerator) => {
        registered.delete(accelerator)
      }
    },
    loadSettings: () => ({ meetingRecordingShortcut: 'CommandOrControl+Shift+M' }),
    onToggleMeetingRecording: () => {
      toggleCalls += 1
    },
    logger: { log: () => {}, warn: () => {}, error: () => {} }
  })

  const result = controller.registerFromSettings()

  assert.equal(result.ok, true)
  assert.equal(result.shortcut, 'CommandOrControl+Shift+M')
  registered.get('CommandOrControl+Shift+M')()
  assert.equal(toggleCalls, 1)
})

test('meeting recording shortcut controller unregisters old shortcut when cleared', () => {
  const registered = new Map()
  const unregistered = []
  let settings = { meetingRecordingShortcut: 'CommandOrControl+Shift+M' }
  const controller = createMeetingRecordingShortcutController({
    globalShortcut: {
      register: (accelerator, callback) => {
        registered.set(accelerator, callback)
        return true
      },
      unregister: (accelerator) => {
        unregistered.push(accelerator)
        registered.delete(accelerator)
      }
    },
    loadSettings: () => settings,
    onToggleMeetingRecording: () => {},
    logger: { log: () => {}, warn: () => {}, error: () => {} }
  })

  controller.registerFromSettings()
  settings = { meetingRecordingShortcut: null }
  const result = controller.registerFromSettings()

  assert.equal(result.ok, true)
  assert.equal(result.shortcut, null)
  assert.deepEqual(unregistered, ['CommandOrControl+Shift+M'])
  assert.equal(registered.size, 0)
})
