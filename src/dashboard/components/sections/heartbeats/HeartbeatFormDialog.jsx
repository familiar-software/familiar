import React from 'react'

import { Badge } from '../../ui/badge'
import { Button } from '../../ui/button'
import { Dialog, DialogContent } from '../../ui/dialog'

import { HeartbeatForm } from './HeartbeatForm'

export function HeartbeatFormDialog({
  isOpen,
  editingId,
  isSubmitting,
  onClose,
  draft,
  runnerLookup = [],
  frequencyLookup = [],
  weekdayLookup = [],
  save,
  ...formProps
}) {
  const runnerLabel = runnerLookup.find((entry) => entry.value === draft?.runner)?.label || 'Runner'
  const frequencyLabel = frequencyLookup.find((entry) => entry.value === draft?.frequency)?.label || 'Schedule'
  const weekdayLabel = weekdayLookup.find((entry) => String(entry.value) === String(draft?.dayOfWeek))?.label || ''
  const scheduleLabel = draft?.frequency === 'weekly' && weekdayLabel
    ? `${frequencyLabel} · ${weekdayLabel}`
    : frequencyLabel

  return (
    <Dialog
      open={isOpen}
      dismissible={!isSubmitting}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && !isSubmitting) {
          onClose()
        }
      }}
    >
      <DialogContent
        className="max-w-[860px] overflow-hidden p-0"
        aria-label={editingId ? 'Edit Heartbeat' : 'New Heartbeat'}
      >
        <div className="flex max-h-[calc(100vh-48px)] flex-col">
          <div className="border-b border-zinc-200/80 bg-zinc-50/80 px-6 py-5 dark:border-zinc-800 dark:bg-zinc-950/60">
            <div className="flex items-start justify-end">
              <Button
                variant="ghost"
                size="icon"
                aria-label="Close heartbeat form"
                className="rounded-full border border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
                onClick={onClose}
                disabled={isSubmitting}
              >
                <svg
                  viewBox="0 0 24 24"
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <path d="M6 6l12 12M18 6l-12 12" />
                </svg>
              </Button>
            </div>
          </div>

          <div className="overflow-y-auto px-6 py-6">
            <HeartbeatForm
              draft={draft}
              runnerLookup={runnerLookup}
              frequencyLookup={frequencyLookup}
              weekdayLookup={weekdayLookup}
              {...formProps}
            />
          </div>

          <div className="border-t border-zinc-200/80 bg-white/95 px-6 py-4 dark:border-zinc-800 dark:bg-zinc-950/95">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <Badge className="border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-900/60 dark:bg-indigo-950/50 dark:text-indigo-300">
                  {runnerLabel}
                </Badge>
                <Badge>{scheduleLabel}</Badge>
                <Badge>{draft?.time || '09:00'}</Badge>
                <Badge className={draft?.enabled === false ? 'border-zinc-300 text-zinc-500 dark:border-zinc-700 dark:text-zinc-400' : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/50 dark:text-emerald-300'}>
                  {draft?.enabled === false ? 'Paused' : 'Enabled'}
                </Badge>
              </div>
              <div className="flex items-center justify-end gap-2">
                <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
                  Cancel
                </Button>
                <Button onClick={save} disabled={isSubmitting}>
                  {isSubmitting ? 'Saving…' : 'Save heartbeat'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
