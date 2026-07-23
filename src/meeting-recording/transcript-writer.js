const fs = require('node:fs/promises')
const path = require('node:path')
const { randomUUID } = require('node:crypto')

const { scanAndRedactContent } = require('../security/rg-redaction')

const LIVE_BLOCK_START = '<!-- familiar-live-transcript:start -->'
const LIVE_BLOCK_END = '<!-- familiar-live-transcript:end -->'
const TRANSCRIPT_LINE_MAX_WORDS = 8
const OTHER_VOICES_SOURCES = new Set(['microphone', 'system-audio'])

function noop () {}

function normalizeTranscriptEvent (event = {}) {
  const type = typeof event.type === 'string' ? event.type : ''
  const text = typeof event.text === 'string' ? event.text : ''
  const startedAtMs = Number.isFinite(event.startedAtMs) ? event.startedAtMs : null
  const endedAtMs = Number.isFinite(event.endedAtMs) ? event.endedAtMs : null
  const segments = normalizeTranscriptSegments(event.segments)
  return {
    ...event,
    type,
    text,
    startedAtMs,
    endedAtMs,
    segments,
    replaceTranscript: event.replaceTranscript === true,
    otherVoicesSource: OTHER_VOICES_SOURCES.has(event.otherVoicesSource)
      ? event.otherVoicesSource
      : ''
  }
}

function buildTranscriptHeader (event = {}) {
  const sourceMetadata = OTHER_VOICES_SOURCES.has(event.otherVoicesSource)
    ? `<!-- familiar-other-voices-source: ${event.otherVoicesSource} -->\n\n`
    : ''
  return `# Meeting transcript\n\n${sourceMetadata}`
}

function normalizeTranscriptWords (words = []) {
  if (!Array.isArray(words)) {
    return []
  }
  return words.map((word) => ({
    text: typeof word?.text === 'string' ? word.text.trim() : '',
    startedAtMs: Number.isFinite(word?.startedAtMs) ? word.startedAtMs : null,
    endedAtMs: Number.isFinite(word?.endedAtMs) ? word.endedAtMs : null
  })).filter((word) => word.text)
}

function normalizeTranscriptSegments (segments = []) {
  if (!Array.isArray(segments)) {
    return []
  }
  return segments.map((segment) => {
    const words = normalizeTranscriptWords(segment?.words)
    const normalizedSegment = {
      text: typeof segment?.text === 'string' ? segment.text.trim() : '',
      startedAtMs: Number.isFinite(segment?.startedAtMs) ? segment.startedAtMs : null,
      endedAtMs: Number.isFinite(segment?.endedAtMs) ? segment.endedAtMs : null,
      speaker: typeof segment?.speaker === 'string' ? segment.speaker.trim() : ''
    }
    if (words.length > 0) {
      normalizedSegment.words = words
    }
    return normalizedSegment
  }).filter((segment) => segment.text)
}

function countTranscriptWords (text = '') {
  return (text.match(/\S+/g) || []).length
}

function splitTranscriptPartByWordLimit (text, baseWordOffset) {
  const words = text.match(/\S+/g) || []
  if (words.length <= TRANSCRIPT_LINE_MAX_WORDS) {
    return [{ text, wordOffset: baseWordOffset }]
  }
  const parts = []
  for (let index = 0; index < words.length; index += TRANSCRIPT_LINE_MAX_WORDS) {
    parts.push({
      text: words.slice(index, index + TRANSCRIPT_LINE_MAX_WORDS).join(' '),
      wordOffset: baseWordOffset + index
    })
  }
  return parts
}

function splitTranscriptTextIntoLineParts (text = '') {
  const trimmed = typeof text === 'string' ? text.trim() : ''
  if (!trimmed) {
    return []
  }

  const sentenceParts = trimmed.match(/[^.!?]+[.!?]+(?=\s|$)|[^.!?]+$/g) || [trimmed]
  const lineParts = []
  let wordOffset = 0
  for (const sentencePart of sentenceParts) {
    const softParts = sentencePart.match(/[^,;:]+[,;:]+(?=\s|$)|[^,;:]+$/g) || [sentencePart]
    for (const softPart of softParts) {
      const part = softPart.trim()
      lineParts.push(...splitTranscriptPartByWordLimit(part, wordOffset))
      wordOffset += countTranscriptWords(part)
    }
  }
  return lineParts
}

function splitTranscriptTextIntoLines (text = '') {
  return splitTranscriptTextIntoLineParts(text).map((part) => part.text)
}

function normalizeTimestampMs (value) {
  if (!Number.isFinite(value) || value <= 0) {
    return 0
  }
  return Math.floor(value)
}

function formatTranscriptTimestamp (startedAtMs) {
  const totalSeconds = Math.floor(normalizeTimestampMs(startedAtMs) / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return [hours, minutes, seconds]
    .map((part) => String(part).padStart(2, '0'))
    .join(':')
}

function buildTranscriptLine (event) {
  const text = event.text.trim()
  const timestamp = `[${formatTranscriptTimestamp(event.startedAtMs)}]`
  const body = event.speaker ? `${event.speaker}: ${text}` : text
  return `${timestamp} ${body}\n`
}

function resolveTextPartTimestampMs ({ event, part, index, count }) {
  const word = Array.isArray(event.words) ? event.words[part.wordOffset] : null
  if (Number.isFinite(word?.startedAtMs)) {
    return word.startedAtMs
  }

  const startedAtMs = normalizeTimestampMs(event.startedAtMs)
  const endedAtMs = normalizeTimestampMs(event.endedAtMs)
  if (endedAtMs <= startedAtMs) {
    return startedAtMs
  }
  const wordCount = countTranscriptWords(event.text)
  if (part.wordOffset > 0 && wordCount > TRANSCRIPT_LINE_MAX_WORDS) {
    return startedAtMs + Math.floor(((endedAtMs - startedAtMs) * part.wordOffset) / wordCount)
  }
  if (count <= 1) {
    return startedAtMs
  }
  return startedAtMs + Math.floor(((endedAtMs - startedAtMs) * index) / count)
}

function resolveTextLineEvents (event) {
  const parts = splitTranscriptTextIntoLineParts(event.text)
  return parts.map((part, index) => ({
    text: part.text,
    startedAtMs: resolveTextPartTimestampMs({
      event,
      part,
      index,
      count: parts.length
    }),
    speaker: event.speaker
  }))
}

function resolveTranscriptLineEvents (event) {
  if (Array.isArray(event.segments) && event.segments.length > 0) {
    return event.segments.flatMap((segment) => resolveTextLineEvents({
      ...segment,
      startedAtMs: Number.isFinite(segment.startedAtMs)
        ? segment.startedAtMs
        : event.startedAtMs,
      endedAtMs: Number.isFinite(segment.endedAtMs)
        ? segment.endedAtMs
        : event.endedAtMs
    }))
  }
  return resolveTextLineEvents(event)
}

function buildTranscriptLines (event) {
  return resolveTranscriptLineEvents(event)
    .filter((line) => line.text.trim())
    .map(buildTranscriptLine)
    .join('')
}

function buildLiveBlock (event) {
  return [
    LIVE_BLOCK_START,
    'In progress:',
    buildTranscriptLines(event).trimEnd(),
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

async function writeFileAtomically (filePath, content) {
  const temporaryPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${randomUUID()}.tmp`
  )
  try {
    await fs.writeFile(temporaryPath, content, {
      encoding: 'utf-8',
      flag: 'wx',
      mode: 0o600
    })
    await fs.rename(temporaryPath, filePath)
  } catch (error) {
    try {
      await fs.unlink(temporaryPath)
    } catch (cleanupError) {
      if (cleanupError?.code !== 'ENOENT') {
        throw new AggregateError(
          [error, cleanupError],
          `Failed to replace transcript and clean temporary file: ${temporaryPath}`
        )
      }
    }
    throw error
  }
}

function createTranscriptWriter ({
  transcriptMarkdownPath,
  onRedactionWarning = noop,
  scanAndRedactContentImpl = scanAndRedactContent,
  writeFileAtomicallyImpl = writeFileAtomically
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
    await writeFileAtomicallyImpl(
      transcriptMarkdownPath,
      `${baseContent}\n\n${buildLiveBlock(event)}`
    )
  }

  async function writeFinalToMarkdown (event) {
    const currentContent = await readMarkdownContent()
    const baseContent = stripLiveBlock(currentContent).trimEnd()
    await writeFileAtomicallyImpl(
      transcriptMarkdownPath,
      `${baseContent}\n${buildTranscriptLines(event)}`
    )
  }

  async function replaceFinalMarkdown (event) {
    await writeFileAtomicallyImpl(
      transcriptMarkdownPath,
      `${buildTranscriptHeader(event)}${buildTranscriptLines(event)}`
    )
  }

  async function discardLiveTranscript () {
    await ensureInitialized()
    const currentContent = await readMarkdownContent()
    const finalizedContent = stripLiveBlock(currentContent)
    if (finalizedContent === currentContent) {
      return
    }
    await writeFileAtomicallyImpl(transcriptMarkdownPath, finalizedContent)
  }

  async function writeEvent (event = {}) {
    await ensureInitialized()
    try {
      const normalizedEvent = normalizeTranscriptEvent(event)
      if (normalizedEvent.text) {
        normalizedEvent.text = await redactText({
          text: normalizedEvent.text,
          eventType: normalizedEvent.type
        })
      }
      for (const segment of normalizedEvent.segments) {
        segment.text = await redactText({
          text: segment.text,
          eventType: normalizedEvent.type
        })
      }

      if (!normalizedEvent.text.trim() && normalizedEvent.segments.length === 0) {
        return
      }
      if (normalizedEvent.type === 'final') {
        if (normalizedEvent.replaceTranscript) {
          await replaceFinalMarkdown(normalizedEvent)
          return
        }
        await writeFinalToMarkdown(normalizedEvent)
        return
      }
      if (normalizedEvent.type === 'partial') {
        await writePartialToMarkdown(normalizedEvent)
      }
    } catch (error) {
      try {
        await discardLiveTranscript()
      } catch (cleanupError) {
        throw new AggregateError(
          [error, cleanupError],
          'Failed to write the meeting transcript and remove its live draft.'
        )
      }
      throw error
    }
  }

  return {
    discardLiveTranscript,
    ensureInitialized,
    writeEvent
  }
}

module.exports = {
  LIVE_BLOCK_END,
  LIVE_BLOCK_START,
  buildTranscriptLines,
  createTranscriptWriter,
  formatTranscriptTimestamp,
  normalizeTranscriptEvent,
  splitTranscriptTextIntoLines
}
