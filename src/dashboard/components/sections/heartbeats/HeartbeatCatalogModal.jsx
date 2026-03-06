import React, { useEffect, useState } from 'react'

import { Badge } from '../../ui/badge'
import { Button } from '../../ui/button'
import { buildHeartbeatPromptPreview } from '../../dashboard/heartbeat-catalog-utils.cjs'
import {
  resolveFrequencyLabel,
} from './heartbeatsSectionUtils'

const resolveScheduleLabel = (template) => {
  const frequencyLabel = resolveFrequencyLabel(template.frequency)
  if (template.frequency === 'weekly') {
    return `${frequencyLabel} · ${template.time || '09:00'}`
  }
  return `${frequencyLabel} · ${template.time || '09:00'}`
}

export function HeartbeatCatalogModal({
  isOpen,
  templates,
  runnerOptions,
  onClose,
  onAddTemplate,
  isSubmitting,
  errorMessage
}) {
  const [runtimePickerTemplateId, setRuntimePickerTemplateId] = useState('')

  useEffect(() => {
    if (!isOpen) {
      return undefined
    }

    const onKeyDown = (event) => {
      if (event.key === 'Escape' && !isSubmitting) {
        onClose()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [isOpen, isSubmitting, onClose])

  useEffect(() => {
    if (!isOpen || isSubmitting) {
      return
    }
    setRuntimePickerTemplateId('')
  }, [isOpen, isSubmitting])

  if (!isOpen) {
    return null
  }

  return (
    <div
      className="react-install-guide-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="heartbeat-catalog-title"
      onClick={(event) => {
        if (event.target === event.currentTarget && !isSubmitting) {
          onClose()
        }
      }}
    >
      <div className="w-full max-w-[760px] rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 shadow-lg max-h-[calc(100vh-48px)] overflow-hidden flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <h2
              id="heartbeat-catalog-title"
              className="text-[18px] font-semibold text-zinc-900 dark:text-zinc-100"
            >
              Heartbeat Catalog
            </h2>
            <p className="text-[14px] text-zinc-500 dark:text-zinc-400">
              Choose a predefined heartbeat and add it instantly. You can edit it later.
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Close catalog"
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

        <p className={`text-[14px] text-red-600 dark:text-red-400 ${errorMessage ? '' : 'hidden'}`}>
          {errorMessage}
        </p>

        <div className="overflow-y-auto pr-1">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {templates.map((template) => (
              <div
                key={template.id || template.topic}
                className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-950/40 p-4 transition-colors hover:bg-white dark:hover:bg-zinc-950"
              >
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className="text-[15px] font-semibold text-zinc-900 dark:text-zinc-100">
                        {template.topic}
                      </p>
                      <Badge>{resolveScheduleLabel(template)}</Badge>
                    </div>
                    {template.description ? (
                      <p className="text-[13px] text-zinc-500 dark:text-zinc-400">
                        {template.description}
                      </p>
                    ) : null}
                  </div>
                  <p className="text-[14px] leading-relaxed text-zinc-700 dark:text-zinc-300">
                    {buildHeartbeatPromptPreview(template.prompt)}
                  </p>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[12px] uppercase tracking-[0.08em] text-zinc-400 dark:text-zinc-500">
                      Topic and prompt preview
                    </p>
                    {runtimePickerTemplateId === (template.id || template.topic) ? (
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        {runnerOptions.map((entry) => (
                          <Button
                            key={`${template.id || template.topic}-${entry.value}`}
                            id={`heartbeats-catalog-runtime-${template.id || template.topic}-${entry.value}`}
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              void onAddTemplate(template, entry.value)
                            }}
                            disabled={isSubmitting}
                          >
                            {isSubmitting ? 'Adding…' : entry.label}
                          </Button>
                        ))}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setRuntimePickerTemplateId('')
                          }}
                          disabled={isSubmitting}
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <Button
                        id={`heartbeats-catalog-add-${template.id || template.topic}`}
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setRuntimePickerTemplateId(template.id || template.topic)
                        }}
                        disabled={isSubmitting}
                      >
                        Add heartbeat
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
