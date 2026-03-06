const test = require('node:test')
const assert = require('node:assert/strict')

const { buildDashboardNavigation } = require('../src/dashboard/components/dashboard/DashboardShellNavigation')

test('omits heartbeats from dashboard navigation outside development mode', () => {
  const navigation = buildDashboardNavigation({}, { isDevelopmentMode: false })

  assert.equal(navigation.some((entry) => entry.id === 'heartbeats'), false)
})

test('includes heartbeats in dashboard navigation during development mode', () => {
  const navigation = buildDashboardNavigation({}, { isDevelopmentMode: true })

  assert.equal(navigation.some((entry) => entry.id === 'heartbeats'), true)
})
