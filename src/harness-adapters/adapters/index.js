const { createCodexAdapter } = require('./codex')
const { createClaudeCodeAdapter } = require('./claude-code')
const { createCursorAdapter } = require('./cursor')

const createHarnessAdapters = ({
  logger = console,
  runCommandImpl,
  now
} = {}) => {
  const codex = createCodexAdapter({ logger, runCommandImpl, now })
  const claudeCode = createClaudeCodeAdapter({ logger, runCommandImpl, now })
  const cursor = createCursorAdapter({ logger, runCommandImpl, now })

  return {
    codex,
    cursor,
    claude: claudeCode,
    'claude-code': claudeCode
  }
}

module.exports = {
  createHarnessAdapters
}
