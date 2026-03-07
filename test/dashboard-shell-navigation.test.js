const test = require('node:test')
const assert = require('node:assert/strict')

const { buildDashboardNavigation } = require('../src/dashboard/components/dashboard/DashboardShellNavigation')

test('includes heartbeats in dashboard navigation', () => {
  const navigation = buildDashboardNavigation({})

  assert.equal(navigation.some((entry) => entry.id === 'heartbeats'), true)
})
