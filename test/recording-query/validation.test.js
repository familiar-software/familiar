const test = require('node:test')
const assert = require('node:assert/strict')

const { parseDateRange, validateQuestion } = require('../../src/recording-query/validation')

test('parseDateRange accepts valid range', () => {
  const result = parseDateRange({ fromDate: '2025-01-01', toDate: '2025-01-02' })
  assert.equal(result.ok, true)
  assert.ok(Number.isFinite(result.startMs))
  assert.ok(Number.isFinite(result.endMs))
})

test('parseDateRange rejects invalid dates', () => {
  assert.equal(parseDateRange({ fromDate: '', toDate: '2025-01-02' }).ok, false)
  assert.equal(parseDateRange({ fromDate: '2025-02-30', toDate: '2025-03-01' }).ok, false)
})

test('parseDateRange rejects reversed range', () => {
  const result = parseDateRange({ fromDate: '2025-01-05', toDate: '2025-01-01' })
  assert.equal(result.ok, false)
})

test('validateQuestion requires non-empty string', () => {
  assert.equal(validateQuestion('').ok, false)
  assert.equal(validateQuestion('  ').ok, false)
  assert.equal(validateQuestion('What happened?').ok, true)
})
