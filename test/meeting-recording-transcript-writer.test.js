const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { createTranscriptWriter } = require('../src/meeting-recording/transcript-writer')

const passthroughRedaction = async ({ content }) => ({
  content,
  findings: 0,
  redactionBypassed: false
})

test('transcript writer appends to an existing transcript instead of overwriting', async () => {
  const sessionDir = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-transcript-writer-'))
  const transcriptMarkdownPath = path.join(
    sessionDir,
    '2026-05-30T12-34-56-789.transcript.md'
  )
  const forbiddenJsonlPath = path.join(sessionDir, '2026-05-30T12-34-56-789.transcript.jsonl')

  const firstWriter = createTranscriptWriter({
    transcriptMarkdownPath,
    scanAndRedactContentImpl: passthroughRedaction
  })
  await firstWriter.writeEvent({
    type: 'final',
    text: 'first line',
    startedAtMs: 0
  })

  const secondWriter = createTranscriptWriter({
    transcriptMarkdownPath,
    scanAndRedactContentImpl: passthroughRedaction
  })
  await secondWriter.writeEvent({
    type: 'final',
    text: 'second line',
    startedAtMs: 1000
  })

  const markdown = fs.readFileSync(transcriptMarkdownPath, 'utf-8')
  assert.match(markdown, /first line/)
  assert.match(markdown, /second line/)
  assert.equal(markdown.match(/# Meeting transcript/g).length, 1)
  assert.doesNotMatch(markdown, /Started:/)
  assert.doesNotMatch(markdown, /\[\d{2}:\d{2}:\d{2}\]/)
  assert.equal(fs.existsSync(forbiddenJsonlPath), false)
})

test('transcript writer streams partial text into markdown until final text arrives', async () => {
  const sessionDir = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-transcript-live-'))
  const transcriptMarkdownPath = path.join(
    sessionDir,
    '2026-05-30T12-34-56-789.transcript.md'
  )
  const forbiddenJsonlPath = path.join(sessionDir, '2026-05-30T12-34-56-789.transcript.jsonl')

  const writer = createTranscriptWriter({
    transcriptMarkdownPath,
    scanAndRedactContentImpl: passthroughRedaction
  })

  await writer.writeEvent({
    type: 'partial',
    text: 'draft words',
    startedAtMs: 0,
    endedAtMs: 700
  })

  const partialMarkdown = fs.readFileSync(transcriptMarkdownPath, 'utf-8')
  assert.match(partialMarkdown, /In progress/)
  assert.match(partialMarkdown, /draft words/)
  assert.doesNotMatch(partialMarkdown, /Started:/)
  assert.doesNotMatch(partialMarkdown, /\[\d{2}:\d{2}:\d{2}\]/)

  await writer.writeEvent({
    type: 'final',
    text: 'settled words',
    startedAtMs: 0,
    endedAtMs: 1000
  })

  const finalMarkdown = fs.readFileSync(transcriptMarkdownPath, 'utf-8')
  assert.doesNotMatch(finalMarkdown, /In progress/)
  assert.doesNotMatch(finalMarkdown, /draft words/)
  assert.match(finalMarkdown, /settled words/)
  assert.doesNotMatch(finalMarkdown, /Started:/)
  assert.doesNotMatch(finalMarkdown, /\[\d{2}:\d{2}:\d{2}\]/)
  assert.equal(fs.existsSync(forbiddenJsonlPath), false)
})
