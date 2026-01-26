const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const fsp = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')

const {
  recordEvent,
  listFlows,
  listEvents,
  resolveHistoryDbPath
} = require('../src/history')

const makeTempContext = async () => {
  return await fsp.mkdtemp(path.join(os.tmpdir(), 'jiminy-context-'))
}

test('recordEvent creates flow and event rows', async () => {
  const contextFolderPath = await makeTempContext()

  const result = recordEvent({
    contextFolderPath,
    trigger: 'capture_selection',
    step: 'capture',
    status: 'success',
    summary: 'Captured screenshot',
    metadata: { source: 'test' }
  })

  assert.ok(result)
  assert.ok(result.flowId)
  assert.ok(result.eventId)

  const dbPath = resolveHistoryDbPath(contextFolderPath)
  assert.ok(dbPath)
  assert.equal(fs.existsSync(dbPath), true)

  const flows = listFlows({ contextFolderPath, limit: 10 })
  assert.equal(flows.length, 1)
  assert.equal(flows[0].status, 'success')

  const events = listEvents({ contextFolderPath, flowId: result.flowId })
  assert.equal(events.length, 1)
  assert.equal(events[0].flow_id, result.flowId)
  assert.ok(events[0].metadata_json.includes('source'))
})

test('recordEvent updates flow status to partial after failure', async () => {
  const contextFolderPath = await makeTempContext()

  const first = recordEvent({
    contextFolderPath,
    trigger: 'capture_selection',
    step: 'extraction',
    status: 'success',
    summary: 'Extraction complete'
  })

  assert.ok(first)

  recordEvent({
    contextFolderPath,
    flowId: first.flowId,
    step: 'analysis',
    status: 'failed',
    summary: 'Analysis failed'
  })

  const flows = listFlows({ contextFolderPath, limit: 10 })
  assert.equal(flows.length, 1)
  assert.equal(flows[0].status, 'partial')
})
