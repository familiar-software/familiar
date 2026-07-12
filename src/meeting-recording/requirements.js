const fs = require('node:fs')

const { validateContextFolderPath } = require('../settings')
const { resolveDefaultSpeechHelperPath } = require('./paths')

function createMeetingRecordingRequirements (options = {}) {
  const getContextFolderPath = options.getContextFolderPath || (() => '')
  const validateContextFolderPathImpl = options.validateContextFolderPathImpl ||
    validateContextFolderPath
  const resolveSpeechHelperPathImpl = options.resolveSpeechHelperPathImpl || (() => (
    resolveDefaultSpeechHelperPath({
      env: process.env,
      resourcesPath: process.resourcesPath || ''
    })
  ))

  function resolveContextFolder () {
    const contextFolderPath = getContextFolderPath()
    const validation = validateContextFolderPathImpl(contextFolderPath)
    if (!validation.ok) {
      throw new Error(validation.message || 'Context folder path is invalid.')
    }
    return contextFolderPath
  }

  function resolveSpeechHelper () {
    const helperPath = resolveSpeechHelperPathImpl()
    if (!helperPath || !fs.existsSync(helperPath)) {
      throw new Error('Speech helper is not available.')
    }
    return helperPath
  }

  return { resolveContextFolder, resolveSpeechHelper }
}

module.exports = { createMeetingRecordingRequirements }
