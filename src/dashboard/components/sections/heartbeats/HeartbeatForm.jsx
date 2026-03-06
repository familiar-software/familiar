import React from 'react'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '../../ui/card'
import { Checkbox } from '../../ui/checkbox'
import { Input } from '../../ui/input'
import { Label } from '../../ui/label'
import { Select } from '../../ui/select'
import { Textarea } from '../../ui/textarea'

import { getLabel } from './heartbeatsSectionUtils'

export function HeartbeatForm({
  mc,
  draft,
  setDraft,
  formError,
  timezoneOptions,
  runnerLookup,
  frequencyLookup,
  weekdayLookup
}) {
  const isWeekly = draft.frequency === 'weekly'

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.9fr)]">
        <Card className="border-zinc-200/80 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle>What to summarize</CardTitle>
            <CardDescription>
              Name the heartbeat and define the exact brief the agent should produce.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label
                htmlFor="heartbeat-topic"
                className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400"
              >
                Topic
              </Label>
              <Input
                id="heartbeat-topic"
                placeholder="Daily summary"
                value={draft.topic}
                onChange={(event) => {
                  setDraft((previous) => ({ ...previous, topic: event.target.value }))
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label
                htmlFor="heartbeat-prompt"
                className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400"
              >
                Prompt
              </Label>
              <Textarea
                id="heartbeat-prompt"
                className="min-h-36 resize-y"
                placeholder="Review the last 24 hours and summarize the most important work, blockers, and next actions."
                value={draft.prompt}
                onChange={(event) => {
                  setDraft((previous) => ({ ...previous, prompt: event.target.value }))
                }}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-200/80 bg-zinc-50/70 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/40">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle>Run settings</CardTitle>
            <CardDescription>
              Choose the runner, cadence, and timing for this heartbeat.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label
                htmlFor="heartbeat-runner"
                className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400"
              >
                Runner
              </Label>
              <Select
                id="heartbeat-runner"
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

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <div className="space-y-1.5">
                <Label
                  htmlFor="heartbeat-frequency"
                  className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400"
                >
                  Frequency
                </Label>
                <Select
                  id="heartbeat-frequency"
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

              <div className="space-y-1.5">
                <Label
                  htmlFor="heartbeat-time"
                  className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400"
                >
                  Time
                </Label>
                <Input
                  id="heartbeat-time"
                  type="time"
                  value={draft.time}
                  onChange={(event) => {
                    setDraft((previous) => ({ ...previous, time: event.target.value }))
                  }}
                />
              </div>
            </div>

            {isWeekly ? (
              <div className="space-y-1.5">
                <Label
                  htmlFor="heartbeat-day-of-week"
                  className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400"
                >
                  Day of week
                </Label>
                <Select
                  id="heartbeat-day-of-week"
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
            ) : null}

            <div className="space-y-1.5">
              <Label
                htmlFor="heartbeat-timezone"
                className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400"
              >
                Timezone
              </Label>
              <Select
                id="heartbeat-timezone"
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

            <div className="rounded-xl border border-zinc-200/80 bg-white/90 px-3 py-3 dark:border-zinc-800 dark:bg-zinc-900/80">
              <Label className="flex items-start gap-3 text-zinc-700 dark:text-zinc-200">
                <Checkbox
                  id="heartbeat-enabled"
                  className="mt-0.5"
                  checked={draft.enabled !== false}
                  onChange={(event) => {
                    setDraft((previous) => ({ ...previous, enabled: event.target.checked }))
                  }}
                />
                <span className="space-y-1">
                  <span className="block text-[14px] font-medium leading-none">Enabled</span>
                  <span className="block text-[12px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                    Run this heartbeat automatically on its schedule.
                  </span>
                </span>
              </Label>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className={`border-red-200 bg-red-50/80 shadow-sm dark:border-red-900/60 dark:bg-red-950/30 ${formError ? '' : 'hidden'}`}>
        <CardContent className="p-4">
          <p className="text-[14px] font-medium text-red-700 dark:text-red-300">
            {formError}
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
