const path = require('node:path')

const { FAMILIAR_BEHIND_THE_SCENES_DIR_NAME, HEARTBEATS_DIR_NAME } = require('../const')
const { safeFsPath, toSafeString } = require('./utils')

const resolveDefaultHeartbeatOutputFolderPath = ({ contextFolderPath } = {}) => {
  const safeContextFolderPath = safeFsPath(contextFolderPath)
  if (!safeContextFolderPath) {
    return ''
  }

  return path.join(
    path.resolve(safeContextFolderPath),
    FAMILIAR_BEHIND_THE_SCENES_DIR_NAME,
    HEARTBEATS_DIR_NAME
  )
}

const resolveHeartbeatOutputFolderRoot = ({ heartbeat, contextFolderPath } = {}) => {
  const explicitOutputFolderPath = safeFsPath(heartbeat?.outputFolderPath)
  if (explicitOutputFolderPath) {
    return {
      path: path.resolve(explicitOutputFolderPath),
      source: 'custom'
    }
  }

  const defaultOutputFolderPath = resolveDefaultHeartbeatOutputFolderPath({ contextFolderPath })
  if (!defaultOutputFolderPath) {
    return {
      path: '',
      source: 'missing'
    }
  }

  return {
    path: defaultOutputFolderPath,
    source: 'default'
  }
}

const resolveHeartbeatTopicFolderPath = ({ heartbeat, contextFolderPath } = {}) => {
  const outputRoot = resolveHeartbeatOutputFolderRoot({ heartbeat, contextFolderPath })
  const topic = toSafeString(heartbeat?.topic)
  if (!outputRoot.path || !topic) {
    return {
      path: '',
      source: outputRoot.source
    }
  }

  return {
    path: path.join(outputRoot.path, topic),
    source: outputRoot.source
  }
}

module.exports = {
  resolveDefaultHeartbeatOutputFolderPath,
  resolveHeartbeatOutputFolderRoot,
  resolveHeartbeatTopicFolderPath
}
