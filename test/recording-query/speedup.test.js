const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { EventEmitter } = require('node:events')

const {
  parseFraction,
  parseFfprobePayload,
  buildFfmpegArgs,
  speedupVideo
} = require('../../src/recording-query/speedup')

test('parseFraction handles ratios', () => {
  assert.equal(parseFraction('30/2'), 15)
  assert.equal(parseFraction('0'), 0)
  assert.equal(parseFraction('24'), 24)
})

test('parseFfprobePayload extracts fps and duration', () => {
  const payload = {
    streams: [{ r_frame_rate: '30/1', duration: '5.5' }],
    format: { duration: '5.5' }
  }
  const result = parseFfprobePayload(payload)
  assert.equal(result.fps, 30)
  assert.equal(result.durationSeconds, 5.5)
})

test('buildFfmpegArgs matches speedup filter chain', () => {
  const args = buildFfmpegArgs({
    inputPath: '/in.mp4',
    outputPath: '/out.mp4',
    speedUp: 30,
    targetFps: 90
  })
  assert.deepEqual(args, ['-y', '-i', '/in.mp4', '-vf', 'setpts=PTS/30,fps=90', '-an', '-movflags', '+faststart', '/out.mp4'])
})

test('speedupVideo returns FFMPEG_MISSING when ffprobe missing', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jiminy-speedup-'))
  const inputPath = path.join(dir, 'input.mp4')
  const outputPath = path.join(dir, 'output.mp4')
  fs.writeFileSync(inputPath, '')

  const spawnFn = () => {
    const child = new EventEmitter()
    child.stdout = new EventEmitter()
    child.stderr = new EventEmitter()
    process.nextTick(() => {
      const error = new Error('not found')
      error.code = 'ENOENT'
      child.emit('error', error)
    })
    return child
  }

  const result = await speedupVideo({
    inputPath,
    outputPath,
    speedFactor: 30,
    spawnFn
  })

  assert.equal(result.ok, false)
  assert.equal(result.error.code, 'FFMPEG_MISSING')
})
