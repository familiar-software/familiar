const { createCodexAdapter } = require('./codex')
const { createClaudeCodeAdapter } = require('./claude-code')

const createHarnessAdapters = ({
  logger = console,
  runCommandImpl,
  now
} = {}) => {
  const codex = createCodexAdapter({ logger, runCommandImpl, now })
  const claudeCode = createClaudeCodeAdapter({ logger, runCommandImpl, now })

  return {
    codex,
    claude: claudeCode,
    'claude-code': claudeCode
  }
}

module.exports = {
  createHarnessAdapters
}
