const fs = require('node:fs')
const path = require('node:path')
const { spawn } = require('node:child_process')

const { toErrorResult } = require('./errors')

const SUPPORTED_VIDEO_EXTENSIONS = new Set([
  '.avi',
  '.flv',
  '.m2ts',
  '.mkv',
  '.mov',
  '.mp4',
  '.mpeg',
  '.mpg',
  '.webm',
  '.wmv'
])

const parseFraction = (value) => {
  if (typeof value !== 'string' || value.trim() === '') {
    return 0
  }
  if (value.includes('/')) {
    const [numerator, denominator] = value.split('/', 2)
    const denom = Number(denominator)
    if (!Number.isFinite(denom) || denom === 0) {
      return 0
    }
    return Number(numerator) / denom
  }
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const parseFfprobePayload = (payload) => {
  const streams = Array.isArray(payload?.streams) ? payload.streams : []
  if (streams.length === 0) {
    throw new Error('ffprobe payload missing video stream data')
  }
  const stream = streams[0] || {}
  const duration = stream.duration ?? payload?.format?.duration
  if (duration === undefined || duration === null) {
    throw new Error('ffprobe payload missing duration')
  }
  const fps = parseFraction(stream.r_frame_rate || '0')
  return { durationSeconds: Number(duration), fps }
}

const runCommand = ({ command, args, logger, spawnFn = spawn }) => new Promise((resolve) => {
  const child = spawnFn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] })
  let stdout = ''
  let stderr = ''

  if (child.stdout) {
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })
  }

  if (child.stderr) {
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })
  }

  child.on('error', (error) => {
    if (error && error.code === 'ENOENT') {
      resolve({ ok: false, missing: true, error })
      return
    }
    logger?.error?.('Command execution failed', { command, error })
    resolve({ ok: false, error })
  })

  child.on('close', (code) => {
    resolve({ ok: code === 0, code, stdout, stderr })
  })
})

const readVideoMetadata = async ({ videoPath, logger, spawnFn }) => {
  const args = [
    '-v',
    'error',
    '-select_streams',
    'v:0',
    '-show_entries',
    'stream=r_frame_rate,duration',
    '-show_entries',
    'format=duration',
    '-of',
    'json',
    videoPath
  ]

  logger.info('Reading video metadata with ffprobe')
  const result = await runCommand({ command: 'ffprobe', args, logger, spawnFn })
  if (!result.ok) {
    if (result.missing) {
      return toErrorResult('FFMPEG_MISSING', 'ffprobe not found; install ffmpeg to read video metadata.')
    }
    logger.error('ffprobe failed', { stderr: result.stderr?.trim() })
    return toErrorResult('SPEEDUP_FAILED', 'ffprobe failed to read video metadata.')
  }

  let payload
  try {
    payload = JSON.parse(result.stdout || '{}')
  } catch (error) {
    logger.error('Failed to parse ffprobe output', { error })
    return toErrorResult('SPEEDUP_FAILED', 'ffprobe output invalid.')
  }

  try {
    const metadata = parseFfprobePayload(payload)
    return { ok: true, metadata }
  } catch (error) {
    logger.error('Invalid ffprobe payload', { error })
    return toErrorResult('SPEEDUP_FAILED', 'ffprobe payload missing required fields.')
  }
}

const buildFfmpegArgs = ({ inputPath, outputPath, speedUp, targetFps }) => {
  const filterChain = `setpts=PTS/${speedUp},fps=${targetFps}`
  return ['-y', '-i', inputPath, '-vf', filterChain, '-an', '-movflags', '+faststart', outputPath]
}

const validateVideoPath = (videoPath) => {
  if (!videoPath || typeof videoPath !== 'string') {
    return toErrorResult('SPEEDUP_FAILED', 'Video path is required.')
  }
  if (!fs.existsSync(videoPath)) {
    return toErrorResult('SPEEDUP_FAILED', `video path does not exist: ${videoPath}`)
  }
  const stats = fs.statSync(videoPath)
  if (!stats.isFile()) {
    return toErrorResult('SPEEDUP_FAILED', `video path must be a file: ${videoPath}`)
  }
  const ext = path.extname(videoPath).toLowerCase()
  if (!SUPPORTED_VIDEO_EXTENSIONS.has(ext)) {
    return toErrorResult('SPEEDUP_FAILED', `Unsupported video extension: ${ext}`)
  }
  return { ok: true }
}

const speedupVideo = async ({ inputPath, outputPath, speedFactor, logger = console, spawnFn }) => {
  const inputValidation = validateVideoPath(inputPath)
  if (!inputValidation.ok) {
    return inputValidation
  }

  if (!outputPath || typeof outputPath !== 'string') {
    return toErrorResult('SPEEDUP_FAILED', 'Output path is required.')
  }

  if (path.resolve(outputPath) === path.resolve(inputPath)) {
    return toErrorResult('SPEEDUP_FAILED', 'Output path must be different from input video.')
  }

  if (!Number.isFinite(speedFactor) || speedFactor <= 0) {
    return toErrorResult('SPEEDUP_FAILED', 'Speed factor must be greater than 0.')
  }

  const metadataResult = await readVideoMetadata({ videoPath: inputPath, logger, spawnFn })
  if (!metadataResult.ok) {
    return metadataResult
  }

  const metadata = metadataResult.metadata
  if (!Number.isFinite(metadata.fps) || metadata.fps <= 0) {
    logger.error('Unable to determine source FPS')
    return toErrorResult('SPEEDUP_FAILED', 'source FPS is missing or invalid')
  }

  const targetFps = metadata.fps * speedFactor
  fs.mkdirSync(path.dirname(outputPath), { recursive: true })

  logger.info('Speeding up video', {
    inputPath,
    outputPath,
    sourceFps: metadata.fps,
    speedFactor,
    targetFps
  })

  const args = buildFfmpegArgs({ inputPath, outputPath, speedUp: speedFactor, targetFps })
  logger.info('Running ffmpeg', { args })

  const result = await runCommand({ command: 'ffmpeg', args, logger, spawnFn })
  if (!result.ok) {
    if (result.missing) {
      return toErrorResult('FFMPEG_MISSING', 'ffmpeg not found; install ffmpeg to process video.')
    }
    logger.error('ffmpeg failed', { stderr: result.stderr?.trim() })
    return toErrorResult('SPEEDUP_FAILED', 'ffmpeg failed to speed up the video.')
  }

  logger.info('Sped-up video written', { outputPath })
  return { ok: true, outputPath }
}

module.exports = {
  SUPPORTED_VIDEO_EXTENSIONS,
  parseFraction,
  parseFfprobePayload,
  buildFfmpegArgs,
  speedupVideo
}
