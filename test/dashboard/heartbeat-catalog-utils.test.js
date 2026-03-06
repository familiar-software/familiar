const test = require('node:test')
const assert = require('node:assert/strict')

const {
  HEARTBEAT_CATALOG_PROMPT_PREVIEW_LIMIT,
  buildHeartbeatFromCatalogTemplate,
  buildHeartbeatPromptPreview,
  getHeartbeatCatalogTemplates,
  getNextHeartbeatTopic
} = require('../../src/dashboard/components/dashboard/heartbeat-catalog-utils.cjs')

test('getHeartbeatCatalogTemplates loads predefined heartbeats from config', () => {
  const templates = getHeartbeatCatalogTemplates()

  assert.ok(Array.isArray(templates))
  assert.ok(templates.length >= 3)
  assert.equal(typeof templates[0].topic, 'string')
  assert.equal(typeof templates[0].prompt, 'string')
  assert.ok(templates[0].prompt.length > 0)
})

test('buildHeartbeatPromptPreview truncates prompts to the first 100 characters', () => {
  const longPrompt = 'a'.repeat(HEARTBEAT_CATALOG_PROMPT_PREVIEW_LIMIT + 25)

  const preview = buildHeartbeatPromptPreview(longPrompt)

  assert.equal(preview, `${'a'.repeat(HEARTBEAT_CATALOG_PROMPT_PREVIEW_LIMIT)}...`)
})

test('getNextHeartbeatTopic appends numeric suffixes when the base topic already exists', () => {
  const existingItems = [
    { topic: 'daily_summary' },
    { topic: 'daily_summary-2' },
    { topic: 'weekly_review' }
  ]

  assert.equal(getNextHeartbeatTopic(existingItems, 'daily_summary'), 'daily_summary-3')
  assert.equal(getNextHeartbeatTopic(existingItems, 'focus_drift'), 'focus_drift')
})

test('buildHeartbeatFromCatalogTemplate creates a unique heartbeat payload and falls back to the provided timezone', () => {
  const template = {
    topic: 'daily_summary',
    prompt: 'Summarize the day.',
    runner: 'codex',
    frequency: 'daily',
    dayOfWeek: 1,
    time: '18:00',
    timezone: '',
    enabled: true
  }

  const payload = buildHeartbeatFromCatalogTemplate({
    template,
    existingItems: [{ topic: 'daily_summary' }],
    fallbackTimezone: 'Asia/Jerusalem'
  })

  assert.equal(payload.topic, 'daily_summary-2')
  assert.equal(payload.timezone, 'Asia/Jerusalem')
  assert.equal(payload.prompt, template.prompt)
  assert.equal(payload.runner, '')
})

test('buildHeartbeatFromCatalogTemplate allows the selected runtime to override the template default runner', () => {
  const payload = buildHeartbeatFromCatalogTemplate({
    template: {
      topic: 'weekly_review',
      prompt: 'Review the week.',
      runner: 'codex',
      frequency: 'weekly',
      dayOfWeek: 5,
      time: '17:00',
      timezone: 'UTC',
      enabled: true
    },
    existingItems: [],
    fallbackTimezone: 'Asia/Jerusalem',
    selectedRunner: 'claude-code'
  })

  assert.equal(payload.runner, 'claude-code')
})

test('buildHeartbeatFromCatalogTemplate does not assign a runner without an explicit runtime selection', () => {
  const payload = buildHeartbeatFromCatalogTemplate({
    template: {
      topic: 'weekly_review',
      prompt: 'Review the week.',
      runner: 'codex',
      frequency: 'weekly',
      dayOfWeek: 5,
      time: '17:00',
      timezone: 'UTC',
      enabled: true
    },
    existingItems: [],
    fallbackTimezone: 'Asia/Jerusalem'
  })

  assert.equal(payload.runner, '')
})
