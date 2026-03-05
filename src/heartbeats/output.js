const path = require('node:path')
const outputFs = require('node:fs/promises')
const { FAMILIAR_BEHIND_THE_SCENES_DIR_NAME, HEARTBEATS_DIR_NAME } = require('../const')
const {
  toSafeString
} = require('./utils')
const {
  safeZonePartsTime
} = require('./schedule')

const createTimestampForFilename = ({ timestampMs, timezone, fallbackFormatter }) => {
  let partsByZone = null
  try {
    const formatter = fallbackFormatter
      || new Intl.DateTimeFormat('en-GB', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23'
      })
    const nowMs = Number.parseInt(timestampMs, 10)
    partsByZone = safeZonePartsTime({ formatter, timestampMs: nowMs })
  } catch {
    partsByZone = null
  }

  if (!partsByZone) {
    const fallback = new Date(timestampMs)
    const y = fallback.getFullYear()
    const m = String(fallback.getMonth() + 1).padStart(2, '0')
    const d = String(fallback.getDate()).padStart(2, '0')
    const hh = String(fallback.getHours()).padStart(2, '0')
    const mm = String(fallback.getMinutes()).padStart(2, '0')
    return `${y}-${m}-${d}_${hh}${mm}`
  }

  const year = Number.parseInt(partsByZone.year, 10)
  const month = Number.parseInt(partsByZone.month, 10)
  const day = Number.parseInt(partsByZone.day, 10)
  const hour = Number.parseInt(partsByZone.hour, 10)
  const minute = Number.parseInt(partsByZone.minute, 10)
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day) || !Number.isFinite(hour) || !Number.isFinite(minute)) {
    const fallback = new Date(timestampMs)
    const y = fallback.getFullYear()
    const m = String(fallback.getMonth() + 1).padStart(2, '0')
    const d = String(fallback.getDate()).padStart(2, '0')
    const hh = String(fallback.getHours()).padStart(2, '0')
    const mm = String(fallback.getMinutes()).padStart(2, '0')
    return `${y}-${m}-${d}_${hh}${mm}`
  }

  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` +
    `_${String(hour).padStart(2, '0')}${String(minute).padStart(2, '0')}`
}

const resolveHeartbeatOutputPath = ({
  contextFolderPath,
  topic,
  timestampMs,
  runner,
  timezone,
  fallbackFormatter
}) => {
  const baseFolder = path.join(contextFolderPath, FAMILIAR_BEHIND_THE_SCENES_DIR_NAME, HEARTBEATS_DIR_NAME, topic)
  const runnerPart = toSafeString(runner, 'unknown').replace(/\W+/g, '-').slice(0, 32)
  const fileTimestamp = createTimestampForFilename({ timestampMs, timezone, fallbackFormatter })
  return {
    directory: baseFolder,
    filename: `${fileTimestamp}_${runnerPart}_${toSafeString(topic)}.md`
  }
}

const writeHeartbeatOutput = async ({ outputPath, content }) => {
  const outputDirectory = path.dirname(outputPath)
  await outputFs.mkdir(outputDirectory, { recursive: true })
  const nextContent = content === '' ? '' : `${content}\n`
  await outputFs.writeFile(outputPath, nextContent, 'utf8')
  return outputPath
}

const logger = console

const persistHeartbeatOutput = async ({
  heartbeat,
  scheduledAtMs,
  contextFolderPath,
  output,
  fallbackFormatter
}) => {
  const target = resolveHeartbeatOutputPath({
    contextFolderPath,
    topic: heartbeat.topic,
    timestampMs: scheduledAtMs,
    runner: heartbeat.runner,
    timezone: heartbeat.schedule.timezone,
    fallbackFormatter
  })

  try {
    const outputPath = path.join(target.directory, target.filename)
    await writeHeartbeatOutput({ outputPath, content: output })
    logger.log('Heartbeat output written', {
      id: heartbeat.id,
      topic: heartbeat.topic,
      outputPath
    })
    return {
      ok: true,
      outputPath,
      output
    }
  } catch (error) {
    const message = error?.message || 'Failed to write heartbeat output.'
    logger.error('Failed to write heartbeat output', {
      id: heartbeat.id,
      topic: heartbeat.topic,
      message
    })
    return {
      ok: false,
      status: 'error',
      error: message,
      outputPath: target.directory,
      output
    }
  }
}

module.exports = {
  createTimestampForFilename,
  resolveHeartbeatOutputPath,
  writeHeartbeatOutput,
  persistHeartbeatOutput
}
