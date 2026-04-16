import React from 'react'

import { Button } from '../ui/button'

export function CompleteSection({ mc, toDisplayText }) {
  const htmlCopy = mc?.dashboard?.html || {}
  const headline = toDisplayText(htmlCopy.completeHeadline)
  const menuBarPointer = toDisplayText(htmlCopy.completeMenuBarPointer)
  const tryBody = toDisplayText(htmlCopy.completeTryBody)
  const tryCommand = toDisplayText(htmlCopy.completeTryCommand)
  const ideasLinkLabel = toDisplayText(htmlCopy.completeIdeasLinkLabel)
  const ideasLinkHref = toDisplayText(htmlCopy.completeIdeasLinkHref)
  const closeCta = toDisplayText(htmlCopy.completeCloseCta)

  const handleClose = () => {
    if (typeof window !== 'undefined' && typeof window.close === 'function') {
      window.close()
    }
  }

  return (
    <section
      id="section-complete"
      role="tabpanel"
      aria-labelledby="section-title"
      className="flex-1 flex flex-col items-center justify-center px-8 py-12 overflow-y-auto scrollbar-slim bg-white dark:bg-[#111]"
    >
      <div className="max-w-xl w-full space-y-10 text-center">
        <h2 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
          {headline}
        </h2>

        <div className="flex items-center justify-center gap-3 text-zinc-700 dark:text-zinc-300">
          <p className="text-base">{menuBarPointer}</p>
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className="text-zinc-500 dark:text-zinc-400"
          >
            <path d="M7 17L17 7" />
            <path d="M8 7h9v9" />
          </svg>
        </div>

        <p className="text-base text-zinc-700 dark:text-zinc-300">
          {tryBody}{' '}
          <code className="font-mono text-[13px] bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 rounded-md px-2 py-1 border border-zinc-200 dark:border-zinc-700">
            {tryCommand}
          </code>
        </p>

        <p>
          <a
            href={ideasLinkHref}
            target="_blank"
            rel="noreferrer noopener"
            className="text-sm text-indigo-600 dark:text-indigo-300 underline-offset-4 hover:underline"
          >
            {ideasLinkLabel} →
          </a>
        </p>

        <div className="pt-4">
          <Button
            type="button"
            variant="default"
            size="lg"
            onClick={handleClose}
            data-action="complete-close"
            className="w-full max-w-md"
          >
            {closeCta}
          </Button>
        </div>
      </div>
    </section>
  )
}
