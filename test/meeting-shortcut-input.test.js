const test = require('node:test')
const assert = require('node:assert/strict')

const {
  shortcutFromKeyboardEvent
} = require('../src/dashboard/components/dashboard/meetingShortcutInput.cjs')

test('shortcut parser uses physical key code for Option-modified letters', () => {
  const result = shortcutFromKeyboardEvent({
    key: 'ï',
    code: 'KeyF',
    altKey: true,
    shiftKey: true,
    metaKey: false,
    ctrlKey: false
  })

  assert.equal(result.shortcut, 'Alt+Shift+F')
  assert.equal(result.clear, false)
  assert.equal(result.needsModifier, false)
})
