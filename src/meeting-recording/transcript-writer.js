const fs = require('node:fs/promises')
const path = require('node:path')

const { scanAndRedactContent } = require('../security/rg-redaction')

const LIVE_BLOCK_START = '<!-- familiar-live-transcript:start -->'
const LIVE_BLOCK_END = '<!-- familiar-live-transcript:end -->'

function noop () {}

function normalizeTranscriptEvent (event = {}) {
  const type = typeof event.type === 'string' ? event.type : ''
  const text = typeof event.text === 'string' ? event.text : ''
  const startedAtMs = Number.isFinite(event.startedAtMs) ? event.startedAtMs : null
  const endedAtMs = Number.isFinite(event.endedAtMs) ? event.endedAtMs : null
  return {
    ...event,
    type,
    text,
    startedAtMs,
    endedAtMs
  }
}

function buildTranscriptHeader () {
  return '# Meeting transcript\n\n'
}

function buildTranscriptLine (event) {
  return `${event.text.trim()}\n`
}

function buildLiveBlock (event) {
  return [
    LIVE_BLOCK_START,
    'In progress:',
    buildTranscriptLine(event).trimEnd(),
    LIVE_BLOCK_END,
    ''
  ].join('\n')
}

function stripLiveBlock (content) {
  const startIndex = content.indexOf(LIVE_BLOCK_START)
  if (startIndex === -1) {
    return content
  }

  const endIndex = content.indexOf(LIVE_BLOCK_END, startIndex)
  if (endIndex === -1) {
    return content.slice(0, startIndex)
  }

  const beforeBlock = content.slice(0, startIndex).trimEnd()
  const afterBlock = content.slice(endIndex + LIVE_BLOCK_END.length).trimStart()
  return afterBlock ? `${beforeBlock}\n${afterBlock}` : `${beforeBlock}\n`
}

function createTranscriptWriter ({
  transcriptMarkdownPath,
  onRedactionWarning = noop,
  scanAndRedactContentImpl = scanAndRedactContent
} = {}) {
  if (!transcriptMarkdownPath) {
    throw new Error('Transcript markdown output path is required.')
  }

  let initialized = false

  async function fileHasContent (filePath) {
    try {
      const stats = await fs.stat(filePath)
      return stats.size > 0
    } catch (error) {
      if (error?.code === 'ENOENT') {
        return false
      }
      throw error
    }
  }

  async function readMarkdownContent () {
    try {
      return await fs.readFile(transcriptMarkdownPath, 'utf-8')
    } catch (error) {
      if (error?.code === 'ENOENT') {
        return ''
      }
      throw error
    }
  }

  async function redactText ({ text, eventType }) {
    if (!text) {
      return text
    }
    const redactionResult = await scanAndRedactContentImpl({
      content: text,
      fileType: 'meeting-transcript',
      fileIdentifier: `${transcriptMarkdownPath}:${eventType || 'event'}`,
      onRedactionWarning
    })
    return redactionResult.content
  }

  async function ensureInitialized () {
    if (initialized) {
      return
    }
    await fs.mkdir(path.dirname(transcriptMarkdownPath), { recursive: true })
    if (!await fileHasContent(transcriptMarkdownPath)) {
      await fs.writeFile(transcriptMarkdownPath, buildTranscriptHeader(), 'utf-8')
    }
    initialized = true
  }

  async function writePartialToMarkdown (event) {
    const currentContent = await readMarkdownContent()
    const baseContent = stripLiveBlock(currentContent).trimEnd()
    await fs.writeFile(
      transcriptMarkdownPath,
      `${baseContent}\n\n${buildLiveBlock(event)}`,
      'utf-8'
    )
  }

  async function writeFinalToMarkdown (event) {
    const currentContent = await readMarkdownContent()
    const baseContent = stripLiveBlock(currentContent).trimEnd()
    await fs.writeFile(
      transcriptMarkdownPath,
      `${baseContent}\n${buildTranscriptLine(event)}`,
      'utf-8'
    )
  }

  async function writeEvent (event = {}) {
    await ensureInitialized()
    const normalizedEvent = normalizeTranscriptEvent(event)
    if (normalizedEvent.text) {
      normalizedEvent.text = await redactText({
        text: normalizedEvent.text,
        eventType: normalizedEvent.type
      })
    }

    if (!normalizedEvent.text.trim()) {
      return
    }
    if (normalizedEvent.type === 'final') {
      await writeFinalToMarkdown(normalizedEvent)
      return
    }
    if (normalizedEvent.type === 'partial') {
      await writePartialToMarkdown(normalizedEvent)
    }
  }

  return {
    ensureInitialized,
    writeEvent
  }
}

module.exports = {
  LIVE_BLOCK_END,
  LIVE_BLOCK_START,
  createTranscriptWriter,
  normalizeTranscriptEvent
}
