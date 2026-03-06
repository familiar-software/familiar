const test = require('node:test')
const assert = require('node:assert/strict')

const { openFileInTextEdit } = require('../src/utils/open-in-textedit')

test('openFileInTextEdit invokes macOS open with TextEdit', async () => {
  const calls = []

  const result = await openFileInTextEdit({
    targetPath: '/tmp/heartbeat.md',
    execFileFn: (command, args, callback) => {
      calls.push({ command, args })
      callback(null)
    }
  })

  assert.deepEqual(calls, [
    {
      command: 'open',
      args: ['-a', 'TextEdit', '/tmp/heartbeat.md']
    }
  ])
  assert.deepEqual(result, {
    ok: true,
    targetPath: '/tmp/heartbeat.md'
  })
})

test('openFileInTextEdit rejects empty target paths', async () => {
  await assert.rejects(
    () => openFileInTextEdit({
      targetPath: '   ',
      execFileFn: () => {}
    }),
    /targetPath is required to open TextEdit/
  )
})
