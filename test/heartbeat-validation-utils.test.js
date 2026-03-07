const test = require('node:test')
const assert = require('node:assert/strict')

const {
  normalizeHeartbeatTopic,
  normalizeHarnessList,
  resolveRunnerSkillHarness,
  isExecutableHeartbeatRunner,
  isHeartbeatRunnerAllowedBySkillInstaller
} = require('../src/dashboard/components/dashboard/heartbeat-validation-utils.cjs')

test('normalizeHeartbeatTopic converts whitespace into underscores and strips unsupported characters', () => {
  assert.equal(normalizeHeartbeatTopic(' Standup Summary 2026 '), 'standup_summary_2026')
  assert.equal(normalizeHeartbeatTopic('Team Sync! / blockers'), 'team_sync_blockers')
})

test('normalizeHarnessList normalizes and deduplicates configured harnesses', () => {
  assert.deepEqual(
    normalizeHarnessList({
      harness: ['codex', 'Claude', 'codex'],
      harnesses: ['antigravity', ' claude ']
    }),
    ['codex', 'claude', 'antigravity']
  )
})

test('resolveRunnerSkillHarness maps heartbeat runners to Connect Agent harness keys', () => {
  assert.equal(resolveRunnerSkillHarness('codex'), 'codex')
  assert.equal(resolveRunnerSkillHarness('claude-code'), 'claude')
  assert.equal(resolveRunnerSkillHarness('cursor'), 'cursor')
  assert.equal(resolveRunnerSkillHarness('antigravity'), 'antigravity')
})

test('isExecutableHeartbeatRunner only allows runners backed by adapters today', () => {
  assert.equal(isExecutableHeartbeatRunner('codex'), true)
  assert.equal(isExecutableHeartbeatRunner('claude-code'), true)
  assert.equal(isExecutableHeartbeatRunner('cursor'), true)
  assert.equal(isExecutableHeartbeatRunner('antigravity'), false)
})

test('isHeartbeatRunnerAllowedBySkillInstaller checks runner against configured Connect Agent harnesses', () => {
  const skillInstaller = {
    harness: ['codex', 'claude']
  }

  assert.equal(isHeartbeatRunnerAllowedBySkillInstaller({ runner: 'codex', skillInstaller }), true)
  assert.equal(isHeartbeatRunnerAllowedBySkillInstaller({ runner: 'claude-code', skillInstaller }), true)
  assert.equal(isHeartbeatRunnerAllowedBySkillInstaller({
    runner: 'cursor',
    skillInstaller: { harness: ['cursor'] }
  }), true)
  assert.equal(isHeartbeatRunnerAllowedBySkillInstaller({ runner: 'antigravity', skillInstaller }), false)
})
