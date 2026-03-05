const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const {
  createTimestampForFilename,
  resolveHeartbeatOutputPath,
  writeHeartbeatOutput,
  persistHeartbeatOutput
} = require('../../src/heartbeats/output')
const {
  FAMILIAR_BEHIND_THE_SCENES_DIR_NAME,
  HEARTBEATS_DIR_NAME
} = require('../../src/const')

test('createTimestampForFilename creates deterministic timezone-aware filenames', () => {
  const timestampMs = Date.parse('2026-03-05T08:09:00Z')
  const fallbackFormatter = new Intl.DateTimeFormat('en-GB', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: 'UTC'
  })
  const filename = createTimestampForFilename({
    timestampMs,
    timezone: 'UTC',
    fallbackFormatter
  })

  assert.equal(filename, '2026-03-05_0809')
})

test('resolveHeartbeatOutputPath builds correct topic folder and runner filename', () => {
  const contextFolderPath = '/tmp/heartbeats'
  const result = resolveHeartbeatOutputPath({
    contextFolderPath,
    topic: 'daily-topic',
    timestampMs: Date.parse('2026-03-05T08:09:00Z'),
    runner: 'claude code',
    timezone: 'UTC',
    fallbackFormatter: new Intl.DateTimeFormat('en-GB', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      timeZone: 'UTC'
    })
  })

  assert.equal(
    result.directory,
    path.join(contextFolderPath, FAMILIAR_BEHIND_THE_SCENES_DIR_NAME, HEARTBEATS_DIR_NAME, 'daily-topic')
  )
  assert.equal(result.filename.includes('daily-topic.md'), true)
  assert.equal(result.filename.includes('claude-code'), true)
  assert.equal(result.filename.startsWith('2026-03-05_0809'), true)
})

test('writeHeartbeatOutput creates directories and appends newline for non-empty output', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'heartbeat-output-'))
  const outputPath = path.join(root, 'nested', 'result.md')

  const filePath = await writeHeartbeatOutput({
    outputPath,
    content: 'hello world'
  })

  const contents = fs.readFileSync(filePath, 'utf8')
  assert.equal(filePath, outputPath)
  assert.equal(contents, 'hello world\n')
})

test('persistHeartbeatOutput writes heartbeat content and returns markdown path', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'heartbeat-output-'))
  const heartbeat = {
    id: 'hb-1',
    topic: 'daily-topic',
    runner: 'codex',
    schedule: {
      timezone: 'UTC'
    }
  }
  const result = await persistHeartbeatOutput({
    heartbeat,
    scheduledAtMs: Date.UTC(2026, 2, 5, 8, 9, 0),
    contextFolderPath: root,
    output: 'captured heartbeat output',
    fallbackFormatter: new Intl.DateTimeFormat('en-GB', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      timeZone: 'UTC'
    })
  })

  const contents = fs.readFileSync(result.outputPath, 'utf8')
  assert.equal(result.ok, true)
  assert.equal(result.output, 'captured heartbeat output')
  assert.equal(contents, 'captured heartbeat output\n')
  assert.equal(fs.existsSync(result.outputPath), true)
})

test('persistHeartbeatOutput handles write failures and returns error', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'heartbeat-output-'))
  const blockedBase = path.join(root, FAMILIAR_BEHIND_THE_SCENES_DIR_NAME)
  fs.writeFileSync(blockedBase, 'file-blocking-folder')

  const heartbeat = {
    id: 'hb-2',
    topic: 'failing-topic',
    runner: 'codex',
    schedule: {
      timezone: 'UTC'
    }
  }
  const result = await persistHeartbeatOutput({
    heartbeat,
    scheduledAtMs: Date.UTC(2026, 2, 5, 8, 9, 0),
    contextFolderPath: root,
    output: 'should fail',
    fallbackFormatter: new Intl.DateTimeFormat('en-GB', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      timeZone: 'UTC'
    })
  })

  assert.equal(result.ok, false)
  assert.equal(result.status, 'error')
  assert.equal(
    result.outputPath,
    path.join(root, FAMILIAR_BEHIND_THE_SCENES_DIR_NAME, HEARTBEATS_DIR_NAME, 'failing-topic')
  )
  assert.equal(result.error.length > 0, true)
})
