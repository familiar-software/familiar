const fs = require('node:fs')
const path = require('node:path')

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

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta'
const GEMINI_MODEL_DEFAULT = 'gemini-2.5-flash'
const GEMINI_VIDEO_FPS_DEFAULT = 3.0
const GEMINI_POLL_INTERVAL_DEFAULT = 5.0
const GEMINI_MAX_WAIT_SECONDS_DEFAULT = 1800.0

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const getMimeType = (videoPath) => {
  const ext = path.extname(videoPath).toLowerCase()
  switch (ext) {
    case '.mp4':
      return 'video/mp4'
    case '.mov':
      return 'video/quicktime'
    case '.mpeg':
    case '.mpg':
      return 'video/mpeg'
    case '.avi':
      return 'video/x-msvideo'
    case '.flv':
      return 'video/x-flv'
    case '.m2ts':
      return 'video/mp2t'
    case '.mkv':
      return 'video/x-matroska'
    case '.webm':
      return 'video/webm'
    case '.wmv':
      return 'video/x-ms-wmv'
    default:
      return null
  }
}

const validateVideoPath = (videoPath) => {
  if (!videoPath || typeof videoPath !== 'string') {
    return toErrorResult('GEMINI_FAILED', 'Video path is required.')
  }
  if (!fs.existsSync(videoPath)) {
    return toErrorResult('GEMINI_FAILED', `video path does not exist: ${videoPath}`)
  }
  const stats = fs.statSync(videoPath)
  if (!stats.isFile()) {
    return toErrorResult('GEMINI_FAILED', `video path must be a file: ${videoPath}`)
  }
  const ext = path.extname(videoPath).toLowerCase()
  if (!SUPPORTED_VIDEO_EXTENSIONS.has(ext)) {
    return toErrorResult('GEMINI_FAILED', `Unsupported video extension: ${ext}`)
  }
  return { ok: true }
}

const extractTextFromPayload = (payload) => {
  const candidates = payload?.candidates
  if (!Array.isArray(candidates) || candidates.length === 0) {
    return ''
  }

  const parts = candidates[0]?.content?.parts
  if (!Array.isArray(parts) || parts.length === 0) {
    return ''
  }

  return parts.map((part) => part?.text || '').join('')
}

const extractTokenUsage = (response) => {
  const usage = response?.usage_metadata || response?.usage
  if (!usage) {
    return null
  }

  const readValue = (keys) => {
    for (const key of keys) {
      const value = usage[key]
      if (value === undefined || value === null) {
        continue
      }
      const parsed = Number(value)
      if (Number.isFinite(parsed)) {
        return parsed
      }
    }
    return null
  }

  const tokenUsage = {}
  const promptTokens = readValue(['prompt_token_count', 'prompt_tokens', 'input_tokens'])
  if (promptTokens !== null) {
    tokenUsage.prompt_token_count = promptTokens
  }
  const candidateTokens = readValue([
    'candidates_token_count',
    'completion_token_count',
    'output_tokens',
    'generated_tokens'
  ])
  if (candidateTokens !== null) {
    tokenUsage.candidates_token_count = candidateTokens
  }
  const totalTokens = readValue(['total_token_count', 'total_tokens'])
  if (totalTokens !== null) {
    tokenUsage.total_token_count = totalTokens
  }

  return Object.keys(tokenUsage).length > 0 ? tokenUsage : null
}

const logTokenUsage = (logger, response) => {
  const usage = extractTokenUsage(response)
  if (!usage) {
    logger.warn('Gemini response had no token usage metadata.')
    return
  }

  const formatToken = (value) => (value === undefined ? 'n/a' : String(value))

  logger.info('Gemini token usage', {
    prompt: formatToken(usage.prompt_token_count),
    candidates: formatToken(usage.candidates_token_count),
    total: formatToken(usage.total_token_count)
  })
}

const uploadVideo = async ({ apiKey, videoPath, logger }) => {
  const stats = fs.statSync(videoPath)
  const mimeType = getMimeType(videoPath)
  if (!mimeType) {
    throw new Error('Unable to determine mime type for uploaded video.')
  }

  const startResponse = await fetch('https://generativelanguage.googleapis.com/upload/v1beta/files', {
    method: 'POST',
    headers: {
      'x-goog-api-key': apiKey,
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(stats.size),
      'X-Goog-Upload-Header-Content-Type': mimeType,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      file: {
        display_name: path.basename(videoPath)
      }
    })
  })

  if (!startResponse.ok) {
    const message = await startResponse.text()
    throw new Error(`Gemini upload start failed: ${startResponse.status} ${message}`)
  }

  const uploadUrl = startResponse.headers.get('x-goog-upload-url')
  if (!uploadUrl) {
    throw new Error('Gemini upload start missing upload URL.')
  }

  logger.info('Uploading video to Gemini', { videoPath })
  const stream = fs.createReadStream(videoPath)
  const uploadResponse = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Content-Length': String(stats.size),
      'X-Goog-Upload-Offset': '0',
      'X-Goog-Upload-Command': 'upload, finalize'
    },
    body: stream,
    duplex: 'half'
  })

  if (!uploadResponse.ok) {
    const message = await uploadResponse.text()
    throw new Error(`Gemini upload failed: ${uploadResponse.status} ${message}`)
  }

  const payload = await uploadResponse.json()
  const file = payload.file || payload
  if (!file || !file.name) {
    throw new Error('Gemini upload response missing file reference.')
  }

  return { file, mimeType }
}

const waitForFileActive = async ({ apiKey, file, pollInterval, maxWaitSeconds, logger }) => {
  const start = Date.now()
  let current = file

  const getStateName = (value) => {
    if (!value) {
      return 'UNKNOWN'
    }
    if (typeof value === 'string') {
      return value
    }
    return value.name || 'UNKNOWN'
  }

  const getFile = async () => {
    const name = current.name
    let url = name
    if (name && name.startsWith('files/')) {
      url = `${GEMINI_BASE_URL}/${name}`
    } else if (name && !name.startsWith('http')) {
      url = `${GEMINI_BASE_URL}/files/${name}`
    }
    const urlWithKey = url.includes('?') ? `${url}&key=${apiKey}` : `${url}?key=${apiKey}`
    const response = await fetch(urlWithKey)
    if (!response.ok) {
      const message = await response.text()
      throw new Error(`Gemini file status failed: ${response.status} ${message}`)
    }
    return response.json()
  }

  while (true) {
    const elapsedSeconds = (Date.now() - start) / 1000
    if (elapsedSeconds > maxWaitSeconds) {
      throw new Error(`File processing exceeded ${maxWaitSeconds} seconds.`)
    }

    const stateName = getStateName(current.state)
    if (stateName === 'ACTIVE') {
      logger.info('File is ACTIVE and ready for inference.')
      return current
    }
    if (stateName === 'FAILED') {
      throw new Error('Gemini file processing failed.')
    }

    logger.info('Waiting for file processing', { state: stateName })
    await sleep(pollInterval * 1000)
    current = await getFile()
  }
}

const buildVideoPart = ({ file, videoPath, videoFps, mimeType, logger }) => {
  const fileUri = file.uri
  if (!fileUri) {
    throw new Error('Uploaded file missing uri.')
  }

  const effectiveMimeType = file.mimeType || mimeType || getMimeType(videoPath)
  if (!effectiveMimeType) {
    throw new Error('Unable to determine mime type for uploaded video.')
  }

  logger.info('Using Gemini video sampling fps', { videoFps })

  return {
    file_data: {
      file_uri: fileUri,
      mime_type: effectiveMimeType
    },
    video_metadata: {
      fps: videoFps
    }
  }
}

const generateResponse = async ({ apiKey, model, videoPart, prompt }) => {
  const response = await fetch(`${GEMINI_BASE_URL}/models/${model}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [videoPart, { text: prompt }]
        }
      ]
    })
  })

  if (!response.ok) {
    const message = await response.text()
    throw new Error(`Gemini generateContent failed: ${response.status} ${message}`)
  }

  return response.json()
}

const countTokens = async ({ apiKey, model, videoPart, prompt }) => {
  const response = await fetch(`${GEMINI_BASE_URL}/models/${model}:countTokens?key=${apiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [videoPart, { text: prompt }]
        }
      ]
    })
  })

  if (!response.ok) {
    const message = await response.text()
    throw new Error(`Gemini countTokens failed: ${response.status} ${message}`)
  }

  return response.json()
}

const processVideoWithGemini = async ({
  videoPath,
  question,
  apiKey,
  model = GEMINI_MODEL_DEFAULT,
  videoFps = GEMINI_VIDEO_FPS_DEFAULT,
  pollInterval = GEMINI_POLL_INTERVAL_DEFAULT,
  maxWaitSeconds = GEMINI_MAX_WAIT_SECONDS_DEFAULT,
  countTokens: countTokensOnly = false,
  logger = console
}) => {
  const validation = validateVideoPath(videoPath)
  if (!validation.ok) {
    return validation
  }

  if (!question || typeof question !== 'string' || question.trim().length === 0) {
    return toErrorResult('GEMINI_FAILED', 'Prompt is required.')
  }

  if (!apiKey || typeof apiKey !== 'string' || apiKey.trim().length === 0) {
    return toErrorResult('GEMINI_FAILED', 'Missing Gemini API key.')
  }

  if (!Number.isFinite(videoFps) || videoFps <= 0 || videoFps > 24) {
    return toErrorResult('GEMINI_FAILED', 'Video fps must be between 0 and 24.')
  }

  try {
    const { file, mimeType } = await uploadVideo({ apiKey, videoPath, logger })
    const activeFile = await waitForFileActive({
      apiKey,
      file,
      pollInterval,
      maxWaitSeconds,
      logger
    })
    const videoPart = buildVideoPart({
      file: activeFile,
      videoPath,
      videoFps,
      mimeType,
      logger
    })

    if (countTokensOnly) {
      const estimate = await countTokens({ apiKey, model, videoPart, prompt: question })
      return { ok: true, estimate }
    }

    logger.info('Sending video + prompt to Gemini', { model })
    const response = await generateResponse({ apiKey, model, videoPart, prompt: question })
    logTokenUsage(logger, response)
    const responseText = extractTextFromPayload(response)
    if (!responseText) {
      return toErrorResult('GEMINI_FAILED', 'Gemini response had no text output.')
    }

    return { ok: true, answerText: responseText }
  } catch (error) {
    logger.error('Gemini video processing failed', { error })
    return toErrorResult('GEMINI_FAILED', error?.message || 'Gemini video processing failed.')
  }
}

module.exports = {
  SUPPORTED_VIDEO_EXTENSIONS,
  GEMINI_MODEL_DEFAULT,
  GEMINI_VIDEO_FPS_DEFAULT,
  GEMINI_POLL_INTERVAL_DEFAULT,
  GEMINI_MAX_WAIT_SECONDS_DEFAULT,
  getMimeType,
  processVideoWithGemini
}
