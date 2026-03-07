const { runCommand } = require('./process-executor')

const DEFAULT_SHELL_PATH = '/bin/zsh'
const DEFAULT_RESOLVE_EXECUTABLE_TIMEOUT_MS = 5_000

const resolveExecutablePath = async (commandName, {
  logger = console,
  runCommandImpl = runCommand,
  shellPath = DEFAULT_SHELL_PATH,
  timeoutMs = DEFAULT_RESOLVE_EXECUTABLE_TIMEOUT_MS
} = {}) => {
  const normalizedCommandName = typeof commandName === 'string' ? commandName.trim() : ''
  if (!normalizedCommandName) {
    return ''
  }

  // This intentionally spawns a login shell so tools installed via shell init
  // systems like nvm can be discovered from GUI-launched app processes.
  const commandResult = await runCommandImpl({
    command: shellPath,
    args: [
      '-ilc',
      'command -v "$1"',
      'resolve-executable-path',
      normalizedCommandName
    ],
    timeoutMs,
    logger
  })

  if (!commandResult.ok) {
    return ''
  }

  const resolvedPath = typeof commandResult.stdout === 'string'
    ? commandResult.stdout.trim()
    : ''

  if (!resolvedPath.startsWith('/')) {
    return ''
  }

  return resolvedPath
}

module.exports = {
  DEFAULT_RESOLVE_EXECUTABLE_TIMEOUT_MS,
  DEFAULT_SHELL_PATH,
  resolveExecutablePath
}
