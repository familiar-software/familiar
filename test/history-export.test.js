const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { randomUUID } = require('node:crypto')
const { test } = require('node:test')

const { recordEvent, exportFlowEvents } = require('../src/history')
const { JIMINY_BEHIND_THE_SCENES_DIR_NAME } = require('../src/const')

test('exportFlowEvents writes all event fields to json', () => {
  const contextFolderPath = fs.mkdtempSync(path.join(os.tmpdir(), 'jiminy-history-export-'))
  const flowId = randomUUID()

  recordEvent({
    contextFolderPath,
    flowId,
    trigger: 'capture_screen',
    step: 'capture',
    status: 'success',
    summary: 'Captured screen',
    detail: 'Saved screenshot',
    sourcePath: '/tmp/source.png',
    outputPath: '/tmp/output.png',
    errorCode: 'E_NONE',
    errorMessage: '',
    metadata: { source: 'test' }
  })

  recordEvent({
    contextFolderPath,
    flowId,
    trigger: 'capture_screen',
    step: 'analysis',
    status: 'failed',
    summary: 'Analysis failed',
    detail: 'Model timeout',
    sourcePath: '/tmp/source.png',
    outputPath: '',
    errorCode: 'E_TIMEOUT',
    errorMessage: 'Timeout',
    metadata: { attempt: 1 }
  })

  const result = exportFlowEvents({ contextFolderPath, flowId })
  assert.equal(result.ok, true)

  const expectedPath = path.join(
    contextFolderPath,
    JIMINY_BEHIND_THE_SCENES_DIR_NAME,
    'history-exports',
    `${flowId}.json`
  )
  assert.equal(result.path, expectedPath)

  const payload = JSON.parse(fs.readFileSync(result.path, 'utf8'))
  assert.equal(payload.flow_id, flowId)
  assert.equal(payload.events.length, 2)

  const requiredKeys = [
    'id',
    'flow_id',
    'created_at',
    'step',
    'status',
    'summary',
    'detail',
    'source_path',
    'output_path',
    'error_code',
    'error_message',
    'metadata_json'
  ]

  payload.events.forEach((event) => {
    requiredKeys.forEach((key) => {
      assert.ok(Object.prototype.hasOwnProperty.call(event, key))
    })
  })
})
