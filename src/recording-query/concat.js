const fs = require('node:fs')
const { spawn } = require('node:child_process')

const { toErrorResult } = require('./errors')

const escapeConcatPath = (filePath) => filePath.replace(/'/g, "'\\''")

const writeConcatList = ({ segments, listPath }) => {
  const lines = segments.map((segmentPath) => `file '${escapeConcatPath(segmentPath)}'`)
  fs.writeFileSync(listPath, `${lines.join('\n')}\n`, 'utf-8')
}

const runFfmpeg = ({ args, logger, spawnFn = spawn }) => new Promise((resolve) => {
  const child = spawnFn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] })
  let stderr = ''

  if (child.stderr) {
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })
  }

  child.on('error', (error) => {
    if (error && error.code === 'ENOENT') {
      resolve(toErrorResult('FFMPEG_MISSING', 'ffmpeg not found on PATH.'))
      return
    }
    logger?.error?.('ffmpeg execution failed', { error })
    resolve(toErrorResult('CONCAT_FAILED', 'ffmpeg failed to concatenate videos.'))
  })

  child.on('close', (code) => {
    if (code === 0) {
      resolve({ ok: true })
      return
    }
    logger?.error?.('ffmpeg concat failed', { code, stderr: stderr.trim() })
    resolve(toErrorResult('CONCAT_FAILED', stderr.trim() || 'ffmpeg failed to concatenate videos.'))
  })
})

const concatSegments = async ({ segments, listPath, outputPath, logger = console, spawnFn } = {}) => {
  if (!Array.isArray(segments) || segments.length === 0) {
    return toErrorResult('NO_SEGMENTS', 'No recording segments to concatenate.')
  }

  writeConcatList({ segments, listPath })

  const args = ['-y', '-f', 'concat', '-safe', '0', '-i', listPath, '-c', 'copy', '-an', outputPath]

  logger.info('Concatenating recordings', { segments: segments.length, outputPath })

  return runFfmpeg({ args, logger, spawnFn })
}

module.exports = {
  concatSegments,
  writeConcatList,
  escapeConcatPath
}
