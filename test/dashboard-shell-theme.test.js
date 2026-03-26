const test = require('node:test')
const assert = require('node:assert/strict')

const {
  dashboardShellRootClassName,
  dashboardSidebarClassName,
  dashboardSidebarMenuButtonClassName
} = require('../src/dashboard/components/dashboard/dashboardShellTheme.cjs')

test('dashboard shell uses an explicit dark canvas behind all sections', () => {
  assert.equal(dashboardShellRootClassName.includes('dark:bg-[#111]'), true)
  assert.equal(dashboardShellRootClassName.includes('dark:text-zinc-100'), true)
})

test('dashboard sidebar uses an opaque dark surface instead of a translucent slab', () => {
  assert.equal(dashboardSidebarClassName.includes('dark:bg-[#111]'), true)
  assert.doesNotMatch(dashboardSidebarClassName, /\bdark:bg-zinc-900\/60\b/)
})

test('dashboard sidebar active state uses subtle dark elevation', () => {
  assert.match(dashboardSidebarMenuButtonClassName, /\bdark:data-\[active=true\]:bg-zinc-900\/90\b/)
  assert.match(dashboardSidebarMenuButtonClassName, /\bdark:data-\[active=true\]:shadow-none\b/)
})
