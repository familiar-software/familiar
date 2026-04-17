const test = require('node:test')
const assert = require('node:assert/strict')

const { buildDashboardNavigation } = require('../src/dashboard/components/dashboard/DashboardShellNavigation')

test('includes the expected dashboard navigation sections', () => {
  const navigation = buildDashboardNavigation({})

  assert.deepEqual(
    navigation.map((entry) => entry.id),
    ['wizard', 'recording', 'storage', 'install-skill', 'automate']
  )
})
