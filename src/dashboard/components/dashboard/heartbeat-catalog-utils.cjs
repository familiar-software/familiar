const rawCatalogTemplates = require('../../../heartbeats/catalog.json')

const HEARTBEAT_CATALOG_PROMPT_PREVIEW_LIMIT = 100

const toSafeString = (value, fallback = '') => (typeof value === 'string' ? value.trim() : fallback)
const toSafeItems = (value) => (Array.isArray(value) ? value : [])
const toSafeNumber = (value, fallback = 0) => {
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

const normalizeTopic = (value, fallback = 'heartbeat') => {
  const next = toSafeString(value, fallback)
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/(^-|-$)/g, '')

  return next || fallback
}

const getHeartbeatCatalogTemplates = () => {
  return toSafeItems(rawCatalogTemplates)
    .map((entry, index) => {
      const fallbackTopic = `heartbeat-${index + 1}`
      const topic = normalizeTopic(entry?.topic, fallbackTopic)
      const id = normalizeTopic(entry?.id, topic)
      const prompt = toSafeString(entry?.prompt)

      if (!prompt) {
        return null
      }

      return {
        id,
        topic,
        description: toSafeString(entry?.description),
        prompt,
        runner: toSafeString(entry?.runner, 'codex') || 'codex',
        frequency: toSafeString(entry?.frequency, 'daily') || 'daily',
        dayOfWeek: toSafeNumber(entry?.dayOfWeek, 1),
        time: toSafeString(entry?.time, '09:00') || '09:00',
        timezone: toSafeString(entry?.timezone),
        enabled: entry?.enabled !== false
      }
    })
    .filter(Boolean)
}

const buildHeartbeatPromptPreview = (
  prompt,
  limit = HEARTBEAT_CATALOG_PROMPT_PREVIEW_LIMIT
) => {
  const safePrompt = toSafeString(prompt)
  if (safePrompt.length <= limit) {
    return safePrompt
  }
  return `${safePrompt.slice(0, limit).trimEnd()}...`
}

const getNextHeartbeatTopic = (existingItems = [], baseTopic = 'heartbeat') => {
  const normalizedBaseTopic = normalizeTopic(baseTopic, 'heartbeat')
  const existingTopics = new Set(
    toSafeItems(existingItems)
      .map((entry) => normalizeTopic(entry?.topic, ''))
      .filter(Boolean)
  )

  if (!existingTopics.has(normalizedBaseTopic)) {
    return normalizedBaseTopic
  }

  let suffix = 2
  while (existingTopics.has(`${normalizedBaseTopic}-${suffix}`)) {
    suffix += 1
  }

  return `${normalizedBaseTopic}-${suffix}`
}

const buildHeartbeatFromCatalogTemplate = ({
  template,
  existingItems = [],
  fallbackTimezone,
  selectedRunner
}) => {
  const safeTemplate = template && typeof template === 'object' ? template : {}
  const topic = getNextHeartbeatTopic(existingItems, safeTemplate.topic)
  const templateTimezone = toSafeString(safeTemplate.timezone)
  const timezone = templateTimezone
    || fallbackTimezone
    || Intl.DateTimeFormat().resolvedOptions().timeZone
    || 'UTC'

  return {
    topic,
    prompt: toSafeString(safeTemplate.prompt),
    runner: toSafeString(selectedRunner),
    frequency: toSafeString(safeTemplate.frequency, 'daily') || 'daily',
    dayOfWeek: toSafeNumber(safeTemplate.dayOfWeek, 1),
    time: toSafeString(safeTemplate.time, '09:00') || '09:00',
    timezone,
    enabled: safeTemplate.enabled !== false
  }
}

module.exports = {
  HEARTBEAT_CATALOG_PROMPT_PREVIEW_LIMIT,
  buildHeartbeatFromCatalogTemplate,
  buildHeartbeatPromptPreview,
  getHeartbeatCatalogTemplates,
  getNextHeartbeatTopic
}
