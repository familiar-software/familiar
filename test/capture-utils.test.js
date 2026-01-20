const test = require('node:test')
const assert = require('node:assert/strict')

const { normalizeRect, getCropRect } = require('../screenshot/capture-utils')

test('normalizeRect handles negative dimensions', () => {
  const result = normalizeRect({ x: 10, y: 8, width: -6, height: -4 })
  assert.deepEqual(result, { x: 4, y: 4, width: 6, height: 4 })
})

test('normalizeRect returns null for invalid input', () => {
  assert.equal(normalizeRect(null), null)
  assert.equal(normalizeRect({ x: 1, y: 2, width: 'nope', height: 3 }), null)
})

test('getCropRect scales and clamps to bounds', () => {
  const rectCss = { x: 10, y: 10, width: 60, height: 50 }
  const cropRect = getCropRect(rectCss, 2, { width: 160, height: 140 })

  assert.deepEqual(cropRect, { x: 20, y: 20, width: 120, height: 100 })
})

test('getCropRect clamps overflow', () => {
  const rectCss = { x: 90, y: 80, width: 30, height: 30 }
  const cropRect = getCropRect(rectCss, 2, { width: 200, height: 200 })

  assert.deepEqual(cropRect, { x: 180, y: 160, width: 20, height: 40 })
})

test('getCropRect returns null when selection is outside', () => {
  const rectCss = { x: 200, y: 200, width: 20, height: 20 }
  const cropRect = getCropRect(rectCss, 2, { width: 300, height: 300 })

  assert.equal(cropRect, null)
})
