const MODIFIER_KEYS = new Set(['Alt', 'Control', 'Meta', 'Shift'])

const KEY_NAME_MAP = {
  ' ': 'Space',
  '+': 'Plus',
  '-': 'Minus',
  '=': 'Plus',
  Escape: 'Escape'
}

const CODE_NAME_MAP = {
  Backquote: '`',
  Backslash: '\\',
  BracketLeft: '[',
  BracketRight: ']',
  Comma: ',',
  Equal: 'Plus',
  Minus: 'Minus',
  Period: '.',
  Quote: "'",
  Semicolon: ';',
  Slash: '/'
}

const keyNameFromCode = (code) => {
  if (typeof code !== 'string') {
    return null
  }
  if (/^Key[A-Z]$/.test(code)) {
    return code.slice(3)
  }
  if (/^Digit[0-9]$/.test(code)) {
    return code.slice(5)
  }
  if (/^F(?:[1-9]|1[0-9]|2[0-4])$/.test(code)) {
    return code
  }
  return CODE_NAME_MAP[code] || null
}

const shortcutFromKeyboardEvent = (event) => {
  if (!event || MODIFIER_KEYS.has(event.key)) {
    return { shortcut: null, clear: false, needsModifier: false }
  }

  if (event.key === 'Escape' || event.key === 'Backspace' || event.key === 'Delete') {
    return { shortcut: null, clear: true, needsModifier: false }
  }

  const modifiers = []
  if (event.metaKey || event.ctrlKey) {
    modifiers.push('CommandOrControl')
  }
  if (event.altKey) {
    modifiers.push('Alt')
  }
  if (event.shiftKey) {
    modifiers.push('Shift')
  }

  const hasRequiredModifier = event.metaKey || event.ctrlKey || event.altKey
  if (!hasRequiredModifier) {
    return { shortcut: null, clear: false, needsModifier: true }
  }

  const mappedKey = keyNameFromCode(event.code) || KEY_NAME_MAP[event.key]
  const baseKey = mappedKey || (
    event.key.length === 1 ? event.key.toUpperCase() : event.key
  )

  return {
    shortcut: [...modifiers, baseKey].join('+'),
    clear: false,
    needsModifier: false
  }
}

module.exports = {
  shortcutFromKeyboardEvent
}
