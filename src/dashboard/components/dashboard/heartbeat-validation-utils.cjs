const EXECUTABLE_HEARTBEAT_RUNNERS = new Set(['codex', 'claude-code', 'cursor'])

const HEARTBEAT_RUNNER_TO_SKILL_HARNESS = {
  codex: 'codex',
  'claude-code': 'claude',
  cursor: 'cursor',
  antigravity: 'antigravity'
}

const toSafeString = (value, fallback = '') => (typeof value === 'string' ? value.trim() : fallback)

const toSafeArray = (value) => {
  if (Array.isArray(value)) {
    return value
  }
  if (typeof value === 'string' && value.trim().length > 0) {
    return [value]
  }
  return []
}

const normalizeHarnessList = (skillInstaller = {}) => {
  const harnesses = [
    ...toSafeArray(skillInstaller?.harness),
    ...toSafeArray(skillInstaller?.harnesses)
  ]

  return Array.from(new Set(
    harnesses
      .map((entry) => toSafeString(entry).toLowerCase())
      .filter(Boolean)
  ))
}

const normalizeHeartbeatTopic = (value) => {
  const safeValue = toSafeString(value).toLowerCase()

  return safeValue
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_-]/g, '')
    .replace(/_+/g, '_')
    .replace(/-+/g, '-')
    .replace(/^[_-]+|[_-]+$/g, '')
}

const resolveRunnerSkillHarness = (runner) => HEARTBEAT_RUNNER_TO_SKILL_HARNESS[toSafeString(runner).toLowerCase()] || ''

const isExecutableHeartbeatRunner = (runner) => EXECUTABLE_HEARTBEAT_RUNNERS.has(toSafeString(runner).toLowerCase())

const isHeartbeatRunnerAllowedBySkillInstaller = ({ runner, skillInstaller } = {}) => {
  const requiredHarness = resolveRunnerSkillHarness(runner)
  if (!requiredHarness) {
    return false
  }

  return normalizeHarnessList(skillInstaller).includes(requiredHarness)
}

module.exports = {
  normalizeHeartbeatTopic,
  normalizeHarnessList,
  resolveRunnerSkillHarness,
  isExecutableHeartbeatRunner,
  isHeartbeatRunnerAllowedBySkillInstaller
}
