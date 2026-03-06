import React from 'react'

import { Badge } from '../../ui/badge'
import { Button } from '../../ui/button'
import { ButtonGroup } from '../../ui/button-group'
import { Card, CardFooter } from '../../ui/card'
import { Checkbox } from '../../ui/checkbox'
import { Label } from '../../ui/label'

import { HEARTBEAT_DEFAULT_TIMEZONE } from '../../dashboard/dashboardConstants'
import {
  resolveDayLabel,
  resolveFrequencyLabel,
  resolveLastRunText,
  resolveRunnerLabel,
  toSafeItems
} from './heartbeatsSectionUtils'

export function HeartbeatList({
  heartbeats,
  hasContextFolder,
  runningHeartbeatIds,
  setHeartbeatEnabled,
  openEditForm,
  openDuplicateForm,
  onDelete,
  onRunNow,
  toDisplayText,
  weekdayLookup
}) {
  const heartbeatItems = toSafeItems(heartbeats)

  if (heartbeatItems.length === 0) {
    return (
      <div className="text-[14px] text-zinc-500 dark:text-zinc-400">
        No heartbeats yet. Set one up to turn raw context into periodic insights.
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {heartbeatItems.map((entry) => {
        const frequencyLabel = resolveFrequencyLabel(entry.schedule?.frequency)
        const dayLabel =
          entry.schedule?.frequency === 'weekly'
            ? resolveDayLabel(entry.schedule?.dayOfWeek, weekdayLookup)
            : ''
        const metadata = [
          resolveRunnerLabel(entry.runner),
          dayLabel ? `${frequencyLabel} · ${dayLabel}` : frequencyLabel,
          entry.schedule?.time || '09:00',
          entry.schedule?.timezone || HEARTBEAT_DEFAULT_TIMEZONE
        ]

        return (
          <Card
            key={entry.id || `heartbeat-${entry.topic}`}
            className="p-0"
          >
            <div className="p-3 flex items-start justify-between gap-3">
              <div className="space-y-1 min-w-0">
                <p className="text-[14px] font-semibold text-zinc-900 dark:text-zinc-100">
                  {entry.topic || 'Unnamed heartbeat'}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {metadata.map((label) => (
                    <Badge key={`${entry.id || entry.topic}-${label}`}>{label}</Badge>
                  ))}
                </div>
                <p className="text-[14px] text-zinc-500 dark:text-zinc-400">
                  {runningHeartbeatIds?.[entry.id] ? (
                    <span className="inline-flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                      <svg
                        viewBox="0 0 24 24"
                        className="w-3 h-3 animate-spin"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        aria-hidden="true"
                      >
                        <path
                          d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M16.9 16.9l2.1 2.1M2 12h3M19 12h3M4.9 19.1l2.1-2.1M16.9 7.1l2.1-2.1"
                        />
                      </svg>
                      Running
                    </span>
                  ) : (
                    resolveLastRunText(entry, toDisplayText)
                  )}
                </p>
                {entry.lastRunError ? (
                  <p className="text-[14px] text-red-500 dark:text-red-400" title={entry.lastRunError}>
                    {entry.lastRunError}
                  </p>
                ) : null}
              </div>
              <Label className="inline-flex items-center gap-2 text-[14px] text-zinc-600 dark:text-zinc-300">
                <Checkbox
                  type="checkbox"
                  className="h-3.5 w-3.5 accent-indigo-600 dark:accent-indigo-400"
                  checked={entry.enabled !== false}
                  onChange={(event) => {
                    if (typeof setHeartbeatEnabled === 'function') {
                      void setHeartbeatEnabled(entry.id, event.target.checked)
                    }
                  }}
                />
                Enabled
              </Label>
            </div>
            <CardFooter className="px-3 pb-3 pt-2 flex flex-wrap items-center justify-between gap-2">
              <ButtonGroup>
                <Button
                  id={`heartbeats-run-${entry.id || 'anonymous'}`}
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    onRunNow(entry.id)
                  }}
                  disabled={!entry.id || !hasContextFolder || Boolean(runningHeartbeatIds?.[entry.id])}
                >
                  Run now
                </Button>
              </ButtonGroup>
              <div className="flex flex-wrap items-center gap-2">
                <ButtonGroup>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      openEditForm(entry)
                    }}
                  >
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      openDuplicateForm(entry)
                    }}
                  >
                    Duplicate
                  </Button>
                </ButtonGroup>
                <ButtonGroup>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => {
                      void onDelete(entry.id)
                    }}
                    disabled={Boolean(runningHeartbeatIds?.[entry.id])}
                  >
                    Delete
                  </Button>
                </ButtonGroup>
              </div>
            </CardFooter>
          </Card>
        )
      })}
    </div>
  )
}
