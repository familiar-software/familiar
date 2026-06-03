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

function wordsWithStarts (words, starts) {
  return words.map((word, index) => ({
    text: word,
    startedAtMs: starts[index],
    endedAtMs: starts[index] + 300
  }))
}

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
  assert.match(markdown, /\[00:00:00\] first line/)
  assert.match(markdown, /\[00:00:01\] second line/)
  assert.equal(markdown.match(/# Meeting transcript/g).length, 1)
  assert.doesNotMatch(markdown, /Started:/)
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
    text: 'draft words next words',
    startedAtMs: 0,
    endedAtMs: 2200,
    segments: [
      { text: 'draft words', startedAtMs: 0, endedAtMs: 700 },
      { text: 'next words', startedAtMs: 1500, endedAtMs: 2200 }
    ]
  })

  const partialMarkdown = fs.readFileSync(transcriptMarkdownPath, 'utf-8')
  assert.match(partialMarkdown, /In progress/)
  assert.match(partialMarkdown, /draft words/)
  assert.match(partialMarkdown, /\[00:00:00\] draft words\n\[00:00:01\] next words/)
  assert.doesNotMatch(partialMarkdown, /Started:/)

  await writer.writeEvent({
    type: 'final',
    text: 'settled words. More settled words.',
    startedAtMs: 0,
    endedAtMs: 4000
  })

  const finalMarkdown = fs.readFileSync(transcriptMarkdownPath, 'utf-8')
  assert.doesNotMatch(finalMarkdown, /In progress/)
  assert.doesNotMatch(finalMarkdown, /draft words/)
  assert.match(finalMarkdown, /settled words/)
  assert.match(finalMarkdown, /\[00:00:00\] settled words\.\n\[00:00:02\] More settled words\./)
  assert.doesNotMatch(finalMarkdown, /Started:/)
  assert.equal(fs.existsSync(forbiddenJsonlPath), false)
})

test('transcript writer breaks one long helper segment into timestamped lines', async () => {
  const sessionDir = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-transcript-segment-'))
  const transcriptMarkdownPath = path.join(
    sessionDir,
    '2026-05-30T12-34-56-789.transcript.md'
  )
  const writer = createTranscriptWriter({
    transcriptMarkdownPath,
    scanAndRedactContentImpl: passthroughRedaction
  })
  const words = [
    'So',
    'what',
    "I'm",
    'saying',
    'is',
    'I',
    'think',
    'I',
    'just',
    'want',
    'to',
    'go',
    'to',
    'sleep,',
    'yep',
    "that's",
    'it'
  ]

  await writer.writeEvent({
    type: 'final',
    text: "So what I'm saying is I think I just want to go to sleep, yep that's it",
    startedAtMs: 0,
    endedAtMs: 9000,
    segments: [{
      text: "So what I'm saying is I think I just want to go to sleep, yep that's it",
      startedAtMs: 0,
      endedAtMs: 9000,
      words: wordsWithStarts(words, [
        0,
        600,
        1200,
        1800,
        2400,
        3000,
        3700,
        4400,
        5000,
        5500,
        6000,
        6500,
        7000,
        7500,
        8000,
        8400,
        8800
      ])
    }]
  })

  const markdown = fs.readFileSync(transcriptMarkdownPath, 'utf-8')
  assert.match(markdown, /\[00:00:00\] So what I'm saying is I think I/)
  assert.match(markdown, /\[00:00:05\] just want to go to sleep,/)
  assert.match(markdown, /\[00:00:08\] yep that's it/)
})
