const fs = require('node:fs')
const path = require('node:path')

const {
  FAMILIAR_BEHIND_THE_SCENES_DIR_NAME,
  STILLS_MARKDOWN_DIR_NAME
} = require('../const')
const { formatLocalTimestamp } = require('../utils/timestamp-utils')

const SESSION_ID_PATTERN = /^session-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z?$/

function createSessionId (date = new Date()) {
  return `session-${formatLocalTimestamp(date)}`
}

function createTranscriptMarkdownFilename (date = new Date()) {
  return `${formatLocalTimestamp(date)}.transcript.md`
}

function normalizeSessionId (sessionId) {
  if (typeof sessionId !== 'string') {
    return ''
  }
  const trimmed = sessionId.trim()
  return SESSION_ID_PATTERN.test(trimmed) ? trimmed : ''
}

function resolveMeetingSession ({
  contextFolderPath,
  preferredSessionId,
  startedAt = new Date()
} = {}) {
  if (!contextFolderPath) {
    throw new Error('Context folder path is required for meeting recording.')
  }

  const sessionId = normalizeSessionId(preferredSessionId) || createSessionId(startedAt)
  const sessionDir = path.join(
    contextFolderPath,
    FAMILIAR_BEHIND_THE_SCENES_DIR_NAME,
    STILLS_MARKDOWN_DIR_NAME,
    sessionId
  )
  fs.mkdirSync(sessionDir, { recursive: true })

  return {
    sessionDir,
    sessionId,
    startedAt,
    transcriptMarkdownPath: path.join(sessionDir, createTranscriptMarkdownFilename(startedAt))
  }
}

function resolveDefaultSpeechHelperPath ({ env = process.env, resourcesPath = '' } = {}) {
  const explicitPath = env.FAMILIAR_E2E_SPEECH_HELPER_PATH ||
    env.FAMILIAR_SPEECH_HELPER_PATH
  if (typeof explicitPath === 'string' && explicitPath.trim()) {
    return explicitPath.trim()
  }

  if (resourcesPath) {
    const packagedPath = path.join(resourcesPath, 'familiar-speech-helper')
    if (fs.existsSync(packagedPath)) {
      return packagedPath
    }
  }

  const helperPath = path.join(__dirname, '..', '..', 'scripts', 'bin', 'familiar-speech-helper')
  return fs.existsSync(helperPath) ? helperPath : ''
}

module.exports = {
  SESSION_ID_PATTERN,
  createSessionId,
  createTranscriptMarkdownFilename,
  normalizeSessionId,
  resolveDefaultSpeechHelperPath,
  resolveMeetingSession
}
