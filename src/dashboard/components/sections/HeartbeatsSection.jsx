import React, { useMemo, useState } from 'react'

import { Button } from '../ui/button'
import {
  HEARTBEAT_DEFAULT_TIMEZONE,
  HEARTBEAT_FREQUENCIES,
  HEARTBEAT_RUNNERS,
  HEARTBEAT_WEEKDAYS
} from '../dashboard/dashboardConstants'
import { HeartbeatFormDialog } from './heartbeats/HeartbeatFormDialog'
import { HeartbeatList } from './heartbeats/HeartbeatList'
import {
  getSafeTime,
  getSafeTimezone,
  nowMinutes
} from './heartbeats/heartbeatsSectionUtils'

const resolveDefaultOutputFolderPath = (contextFolderPath) => {
  const safeContextFolderPath = typeof contextFolderPath === 'string' ? contextFolderPath.trim() : ''
  if (!safeContextFolderPath) {
    return ''
  }

  return `${safeContextFolderPath.replace(/\/+$/, '')}/familiar/heartbeats`
}

const createEmptyDraft = ({ runnerLookup, frequencyLookup, weekdayLookup }) => ({
  topic: '',
  prompt: '',
  outputFolderPath: '',
  runner: runnerLookup[0]?.value || 'codex',
  frequency: frequencyLookup[0]?.value || 'daily',
  dayOfWeek: weekdayLookup[0]?.value || '1',
  time: nowMinutes(),
  timezone: getSafeTimezone(HEARTBEAT_DEFAULT_TIMEZONE),
  enabled: true
})

export function HeartbeatsSection({
  mc,
  toDisplayText,
  settings,
  heartbeats = [],
  heartbeatMessage,
  heartbeatError,
  saveHeartbeat,
  deleteHeartbeat,
  setHeartbeatEnabled,
  pickHeartbeatOutputFolder,
  runHeartbeatNow,
  openHeartbeatOutputFolder,
  runningHeartbeatIds
}) {
  const heartbeatsCopy = mc?.dashboard?.heartbeats || {}
  const heartbeatMessages = heartbeatsCopy.messages || {}
  const settingsErrors = mc?.dashboard?.settings?.errors || {}
  const timezoneOptions = useMemo(() => {
    const source = typeof Intl.supportedValuesOf === 'function'
      ? Intl.supportedValuesOf('timeZone')
      : []
    const fallbackZone = HEARTBEAT_DEFAULT_TIMEZONE
    const set = new Set(source)
    set.add(fallbackZone)
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [])
  const weekdayLookup = useMemo(() => HEARTBEAT_WEEKDAYS, [])
  const runnerLookup = useMemo(() => HEARTBEAT_RUNNERS, [])
  const frequencyLookup = useMemo(() => HEARTBEAT_FREQUENCIES, [])
  const hasContextFolder = Boolean(settings?.contextFolderPath)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingId, setEditingId] = useState('')
  const [formError, setFormError] = useState('')
  const [isFormSubmitting, setIsFormSubmitting] = useState(false)
  const [draft, setDraft] = useState(() => createEmptyDraft({
    runnerLookup,
    frequencyLookup,
    weekdayLookup
  }))

  const closeForm = () => {
    setIsFormOpen(false)
    setEditingId('')
    setFormError('')
    setIsFormSubmitting(false)
  }

  const openNewForm = () => {
    setDraft(createEmptyDraft({ runnerLookup, frequencyLookup, weekdayLookup }))
    setIsFormOpen(true)
    setEditingId('')
    setFormError('')
    setIsFormSubmitting(false)
  }

  const openEditForm = (entry) => {
    setDraft({
      topic: entry.topic || '',
      prompt: entry.prompt || '',
      outputFolderPath: entry.outputFolderPath || '',
      runner: entry.runner || runnerLookup[0]?.value || 'codex',
      frequency: entry.schedule?.frequency || frequencyLookup[0]?.value || 'daily',
      dayOfWeek: String(entry.schedule?.dayOfWeek || weekdayLookup[0]?.value || '1'),
      time: getSafeTime(entry.schedule?.time) || nowMinutes(),
      timezone: getSafeTimezone(entry.schedule?.timezone),
      enabled: entry.enabled !== false
    })
    setEditingId(entry.id || '')
    setIsFormOpen(true)
    setFormError('')
    setIsFormSubmitting(false)
  }

  const openDuplicateForm = (entry) => {
    openEditForm(entry)
    setDraft((previous) => ({
      ...previous,
      topic: `${previous.topic || 'heartbeat'}-copy`,
      enabled: true
    }))
    setEditingId('')
  }

  const save = async () => {
    if (typeof saveHeartbeat !== 'function') {
      setFormError(toDisplayText(settingsErrors.bridgeUnavailableRestart))
      return
    }
    if (!draft.topic.trim()) {
      setFormError(heartbeatMessages.topicRequired)
      return
    }
    if (!draft.prompt.trim()) {
      setFormError(heartbeatMessages.promptRequired)
      return
    }
    setIsFormSubmitting(true)
    setFormError('')

    const payload = {
      id: editingId,
      topic: draft.topic.trim(),
      prompt: draft.prompt.trim(),
      outputFolderPath: draft.outputFolderPath.trim(),
      runner: draft.runner,
      frequency: draft.frequency,
      dayOfWeek: Number.parseInt(draft.dayOfWeek, 10),
      time: draft.time,
      timezone: draft.timezone,
      enabled: draft.enabled
    }
    const scheduleTime = getSafeTime(payload.time)
    const result = await saveHeartbeat({
      ...payload,
      time: scheduleTime || '09:00'
    })
    setIsFormSubmitting(false)

    if (!result || result.ok !== true) {
      setFormError(result?.message || heartbeatMessages.failedToSave)
      return
    }

    closeForm()
  }

  const onDelete = async (id) => {
    if (!window?.confirm) {
      return deleteHeartbeat?.(id)
    }
    if (!window.confirm(heartbeatsCopy.deleteConfirm)) {
      return undefined
    }
    return deleteHeartbeat?.(id)
  }

  const onRunNow = (id) => {
    if (!id || !hasContextFolder) {
      return
    }
    void runHeartbeatNow?.(id)
  }

  const onOpenOutputFolder = (id) => {
    if (!id) {
      return
    }
    void openHeartbeatOutputFolder?.(id)
  }

  const onPickOutputFolder = async () => {
    const result = await pickHeartbeatOutputFolder?.()
    if (!result || result.ok !== true) {
      if (!result?.canceled && result?.message) {
        setFormError(result.message)
      }
      return
    }

    setFormError('')
    setDraft((previous) => ({
      ...previous,
      outputFolderPath: result.path
    }))
  }

  return (
    <section id="section-heartbeats" className="space-y-5 max-w-[680px]">
      <div className="flex items-start justify-end gap-3">
        <Button
          id="heartbeats-add"
          variant="default"
          size="sm"
          onClick={openNewForm}
        >
          + {heartbeatsCopy.add}
        </Button>
      </div>

      <div className={`text-[14px] ${toDisplayText(heartbeatMessage) ? '' : 'hidden'}`}>
        <span className="text-emerald-600 dark:text-emerald-400">{toDisplayText(heartbeatMessage)}</span>
      </div>
      <p className={`text-[14px] text-red-600 dark:text-red-400 ${toDisplayText(heartbeatError) ? '' : 'hidden'}`}>
        {toDisplayText(heartbeatError)}
      </p>

      <HeartbeatList
        mc={mc}
        heartbeats={heartbeats}
        hasContextFolder={hasContextFolder}
        runningHeartbeatIds={runningHeartbeatIds}
        setHeartbeatEnabled={setHeartbeatEnabled}
        openEditForm={openEditForm}
        openDuplicateForm={openDuplicateForm}
        onDelete={onDelete}
        onRunNow={onRunNow}
        onOpenOutputFolder={onOpenOutputFolder}
        toDisplayText={toDisplayText}
        weekdayLookup={weekdayLookup}
      />

      <HeartbeatFormDialog
        isOpen={isFormOpen}
        mc={mc}
        editingId={editingId}
        draft={draft}
        setDraft={setDraft}
        save={save}
        onClose={closeForm}
        isSubmitting={isFormSubmitting}
        pickOutputFolder={onPickOutputFolder}
        displayedOutputFolderPath={draft.outputFolderPath || resolveDefaultOutputFolderPath(settings?.contextFolderPath)}
        formError={formError}
        timezoneOptions={timezoneOptions}
        runnerLookup={runnerLookup}
        frequencyLookup={frequencyLookup}
        weekdayLookup={weekdayLookup}
      />
    </section>
  )
}
