const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { EventEmitter } = require('node:events')

const { concatSegments, writeConcatList, escapeConcatPath } = require('../../src/recording-query/concat')

const makeTempFile = (name) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jiminy-concat-'))
  const filePath = path.join(dir, name)
  fs.writeFileSync(filePath, '')
  return { dir, filePath }
}

test('writeConcatList writes ffmpeg concat file', () => {
  const { dir, filePath } = makeTempFile('segment-0001.mp4')
  const listPath = path.join(dir, 'segments.txt')
  writeConcatList({ segments: [filePath], listPath })
  const content = fs.readFileSync(listPath, 'utf-8')
  assert.equal(content.trim(), `file '${filePath}'`)
})

test('escapeConcatPath escapes single quotes', () => {
  const value = "/tmp/it's-here.mp4"
  assert.equal(escapeConcatPath(value), "/tmp/it'\\''s-here.mp4")
})

test('concatSegments returns NO_SEGMENTS on empty input', async () => {
  const result = await concatSegments({ segments: [], listPath: '/tmp/segments.txt', outputPath: '/tmp/out.mp4' })
  assert.equal(result.ok, false)
  assert.equal(result.error.code, 'NO_SEGMENTS')
})

test('concatSegments returns FFMPEG_MISSING on missing ffmpeg', async () => {
  const { dir, filePath } = makeTempFile('segment-0001.mp4')
  const listPath = path.join(dir, 'segments.txt')
  const outputPath = path.join(dir, 'out.mp4')

  const spawnFn = () => {
    const child = new EventEmitter()
    child.stderr = new EventEmitter()
    process.nextTick(() => {
      const error = new Error('not found')
      error.code = 'ENOENT'
      child.emit('error', error)
    })
    return child
  }

  const result = await concatSegments({
    segments: [filePath],
    listPath,
    outputPath,
    spawnFn
  })

  assert.equal(result.ok, false)
  assert.equal(result.error.code, 'FFMPEG_MISSING')
})
