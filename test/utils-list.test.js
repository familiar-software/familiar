const test = require('node:test')
const assert = require('node:assert/strict')

const { toStringArray, normalizeStringArray } = require('../src/utils/list')

test('toStringArray handles single string and arrays', () => {
  assert.deepEqual(toStringArray('codex'), ['codex'])
  assert.deepEqual(toStringArray(['codex', 1, 'cursor', null]), ['codex', 'cursor'])
  assert.deepEqual(toStringArray(undefined), [])
})

test('normalizeStringArray trims, dedupes, and can lowercase', () => {
  assert.deepEqual(
    normalizeStringArray([' codex ', 'cursor', 'codex', '']),
    ['codex', 'cursor']
  )
  assert.deepEqual(
    normalizeStringArray([' Codex ', 'CURSOR '], { lowerCase: true }),
    ['codex', 'cursor']
  )
})
