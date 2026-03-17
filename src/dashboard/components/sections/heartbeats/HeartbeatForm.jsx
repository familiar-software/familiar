import React from 'react'

import { Button } from '../../ui/button'
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

export function HeartbeatForm({
  mc,
  draft,
  setDraft,
  pickOutputFolder,
  displayedOutputFolderPath,
  formError,
  timezoneOptions,
  runnerLookup,
  frequencyLookup,
  weekdayLookup
}) {
  const isWeekly = draft.frequency === 'weekly'
  const formCopy = mc?.dashboard?.heartbeats?.form || {}

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.9fr)]">
        <Card className="border-zinc-200/80 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle>{formCopy.summarizeTitle}</CardTitle>
            <CardDescription>
              {formCopy.summarizeDescription}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label
                htmlFor="heartbeat-topic"
                className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400"
              >
                {formCopy.topicLabel}
              </Label>
              <Input
                id="heartbeat-topic"
                placeholder={formCopy.topicPlaceholder}
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
                {formCopy.promptLabel}
              </Label>
              <Textarea
                id="heartbeat-prompt"
                className="min-h-36 resize-y"
                placeholder={formCopy.promptPlaceholder}
                value={draft.prompt}
                onChange={(event) => {
                  setDraft((previous) => ({ ...previous, prompt: event.target.value }))
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label
                htmlFor="heartbeat-output-folder"
                className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400"
              >
                {formCopy.outputFolderLabel}
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id="heartbeat-output-folder"
                  readOnly
                  value={displayedOutputFolderPath || ''}
                  placeholder={formCopy.outputFolderPlaceholder}
                />
                <Button
                  id="heartbeat-output-folder-pick"
                  type="button"
                  variant="outline"
                  onClick={() => {
                    void pickOutputFolder?.()
                  }}
                >
                  {draft.outputFolderPath ? formCopy.outputFolderChangeAction : formCopy.outputFolderPickAction}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-zinc-200/80 bg-zinc-50/70 shadow-sm dark:border-zinc-800 dark:bg-zinc-950/40">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle>{formCopy.runSettingsTitle}</CardTitle>
            <CardDescription>
              {formCopy.runSettingsDescription}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label
                htmlFor="heartbeat-runner"
                className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400"
              >
                {formCopy.runnerLabel}
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
                      {entry.label}
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
                  {formCopy.frequencyLabel}
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
                      {entry.label}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label
                htmlFor="heartbeat-time"
                className="text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400"
              >
                  {formCopy.timeLabel}
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
                  {formCopy.dayOfWeekLabel}
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
                {formCopy.timezoneLabel}
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
                  <span className="block text-[14px] font-medium leading-none">{formCopy.enabledTitle}</span>
                  <span className="block text-[12px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                    {formCopy.enabledDescription}
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
