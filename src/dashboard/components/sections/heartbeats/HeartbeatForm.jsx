import React from 'react'

import { Button } from '../../ui/button'
import { Checkbox } from '../../ui/checkbox'
import { Input } from '../../ui/input'
import { Label } from '../../ui/label'
import { Select } from '../../ui/select'
import { Textarea } from '../../ui/textarea'
import { CardTitle } from '../../ui/card'

import { getLabel } from './heartbeatsSectionUtils'

export function HeartbeatForm({
  mc,
  editingId,
  draft,
  setDraft,
  save,
  closeForm,
  isFormSubmitting,
  formError,
  timezoneOptions,
  runnerLookup,
  frequencyLookup,
  weekdayLookup
}) {
  const isWeekly = draft.frequency === 'weekly'

  return (
    <section className="pt-4 border-t border-zinc-200 dark:border-zinc-800 space-y-4">
      <CardTitle>
        {editingId ? 'Edit Heartbeat' : 'New Heartbeat'}
      </CardTitle>
      <div className="space-y-3">
        <Label htmlFor="heartbeat-topic" className="section-label">
          Topic
        </Label>
        <Input
          id="heartbeat-topic"
          value={draft.topic}
          onChange={(event) => {
            setDraft((previous) => ({ ...previous, topic: event.target.value }))
          }}
        />
        <Label htmlFor="heartbeat-prompt" className="section-label">
          Prompt
        </Label>
        <Textarea
          id="heartbeat-prompt"
          className="min-h-24"
          value={draft.prompt}
          onChange={(event) => {
            setDraft((previous) => ({ ...previous, prompt: event.target.value }))
          }}
        />

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="heartbeat-runner" className="section-label">
              Runner
            </Label>
            <Select
              id="heartbeat-runner"
              className="input-ring w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg py-2 px-3 text-[14px]"
              value={draft.runner}
              onChange={(event) => {
                setDraft((previous) => ({ ...previous, runner: event.target.value }))
              }}
            >
              {runnerLookup.map((entry) => (
                <option key={entry.value} value={entry.value}>
                  {getLabel(mc?.dashboard?.heartbeats, entry, entry.label)}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="heartbeat-frequency" className="section-label">
              Frequency
            </Label>
            <Select
              id="heartbeat-frequency"
              className="input-ring w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg py-2 px-3 text-[14px]"
              value={draft.frequency}
              onChange={(event) => {
                setDraft((previous) => ({ ...previous, frequency: event.target.value }))
              }}
            >
              {frequencyLookup.map((entry) => (
                <option key={entry.value} value={entry.value}>
                  {getLabel(mc?.dashboard?.heartbeats, entry, entry.label)}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="heartbeat-time" className="section-label">Time</Label>
            <Input
              id="heartbeat-time"
              type="time"
              value={draft.time}
              onChange={(event) => {
                setDraft((previous) => ({ ...previous, time: event.target.value }))
              }}
            />
          </div>
          {isWeekly ? (
            <div className="space-y-1">
              <Label htmlFor="heartbeat-day-of-week" className="section-label">
                Day of week
              </Label>
              <Select
                id="heartbeat-day-of-week"
                className="input-ring w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg py-2 px-3 text-[14px]"
                value={draft.dayOfWeek}
                onChange={(event) => {
                  setDraft((previous) => ({ ...previous, dayOfWeek: event.target.value }))
                }}
              >
                {weekdayLookup.map((entry) => (
                  <option key={entry.value} value={entry.value}>
                    {entry.label}
                  </option>
                ))}
              </Select>
            </div>
          ) : (
            <div />
          )}
        </div>

        <div className="space-y-1">
          <Label htmlFor="heartbeat-timezone" className="section-label">Timezone</Label>
          <Select
            id="heartbeat-timezone"
            className="input-ring w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg py-2 px-3 text-[14px]"
            value={draft.timezone}
            onChange={(event) => {
              setDraft((previous) => ({ ...previous, timezone: event.target.value }))
            }}
          >
            {timezoneOptions.map((entry) => (
              <option key={entry} value={entry}>
                {entry}
              </option>
            ))}
          </Select>
        </div>

        <Label className="inline-flex items-center gap-2 text-[14px] text-zinc-600 dark:text-zinc-300">
          <Checkbox
            type="checkbox"
            className="h-3.5 w-3.5 accent-indigo-600 dark:accent-indigo-400"
            checked={draft.enabled !== false}
            onChange={(event) => {
              setDraft((previous) => ({ ...previous, enabled: event.target.checked }))
            }}
          />
          Enabled
        </Label>

        <p className={`text-[14px] text-red-600 dark:text-red-400 ${formError ? '' : 'hidden'}`}>
          {formError}
        </p>

        <div className="flex items-center gap-2">
          <Button onClick={save} disabled={isFormSubmitting}>
            {isFormSubmitting ? 'Saving…' : 'Save heartbeat'}
          </Button>
          <Button variant="outline" onClick={closeForm} disabled={isFormSubmitting}>
            Cancel
          </Button>
        </div>
      </div>
    </section>
  )
}
