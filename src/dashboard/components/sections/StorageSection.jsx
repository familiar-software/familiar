import React from 'react'

import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { Select } from '../ui/select'

export function StorageSection({
  mc,
  displayedContextFolderPath,
  settings,
  storageUsage,
  storageUsageLoaded,
  storageMessage,
  storageError,
  storageDeleteMessage,
  storageDeleteError,
  deleteBusy,
  deleteWindow,
  setDeleteWindow,
  pickContextFolder,
  openCurrentContextFolder,
  saveStorageRetention,
  isContextFolderMoveInProgress,
  isDeleteControlsDisabled,
  deleteRecentFiles,
  formatBytes,
  toDisplayText
}) {
  const htmlCopy = mc?.dashboard?.html || {}
  const autoCleanupOptions = [
    { value: '2', label: toDisplayText(htmlCopy.storageRetention2d) },
    { value: '7', label: toDisplayText(htmlCopy.storageRetention7d) }
  ]
  const storageDeletePresets = [
    { value: '15m', label: toDisplayText(htmlCopy.storageDeleteWindow15m) },
    { value: '1h', label: toDisplayText(htmlCopy.storageDeleteWindow1h) },
    { value: '1d', label: toDisplayText(htmlCopy.storageDeleteWindow1d) },
    { value: '7d', label: toDisplayText(htmlCopy.storageDeleteWindow7d) },
    { value: 'all', label: toDisplayText(htmlCopy.storageDeleteWindowAll) }
  ]
  const isPickerDisabled = Boolean(isContextFolderMoveInProgress)
  const isDeleteDisabled = Boolean(isDeleteControlsDisabled || deleteBusy)
  const moveFolderLabel = toDisplayText(mc?.dashboard?.settingsActions?.moveFolder)
  const isStorageUsageLoaded = Boolean(storageUsageLoaded)
  const contextFolderTitle = settings.contextFolderPath
    ? `${settings.contextFolderPath}/familiar`
    : ''
  const storagePathValue = displayedContextFolderPath || ''
  const storageUsageStatusText = toDisplayText(storageMessage)
  const storageDeleteStatusText = toDisplayText(storageDeleteMessage)
  const storageDeleteErrorText = toDisplayText(storageDeleteError)
  const contextFolderErrorText = toDisplayText(storageError)
  const splitUsageValue = (bytes) => {
    const formatted = formatBytes(bytes)
    const [amount = '0', unit = 'B'] = formatted.split(' ')
    return { amount, unit }
  }
  const textUsage = splitUsageValue(storageUsage.steelsMarkdownBytes)
  const screenshotUsage = splitUsageValue(storageUsage.screenshotsBytes)

  const shouldOpenCurrentFolder = (event) => {
    if (!event || isPickerDisabled) {
      return false
    }
    const target = event.target
    if (!target || typeof target.closest !== 'function') {
      return true
    }
    if (target.closest('[data-action="storage-open-folder"]')) {
      return false
    }
    return true
  }

  const handleStoragePickerActivation = (event) => {
    if (isPickerDisabled) {
      return
    }
    if (!shouldOpenCurrentFolder(event)) {
      return
    }
    void openCurrentContextFolder()
  }

  const storageUsageErrorText = toDisplayText(storageError)

  return (
    <section id="section-storage" className="space-y-6 max-w-[520px] flex flex-col flex-1">
      <div className="space-y-3">
        <h3 className="text-[16px] font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
          {toDisplayText(htmlCopy.storageContextFolder)}
        </h3>
        <div
          id="context-folder-picker-surface"
          data-action="context-folder-picker-surface"
          role="button"
          tabIndex={isPickerDisabled ? -1 : 0}
          title={contextFolderTitle}
          className="input-ring flex items-center gap-2 px-3 py-2.5 bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg cursor-pointer focus:outline-none"
          onClick={handleStoragePickerActivation}
          onKeyDown={(event) => {
            if (isPickerDisabled) {
              return
            }
            if (event.key !== 'Enter' && event.key !== ' ') {
              return
            }
            event.preventDefault()
            handleStoragePickerActivation(event)
          }}
        >
          <div
            className="flex items-center justify-center w-6 h-6 rounded-md bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-400"
          >
            <svg
              viewBox="0 0 24 24"
              className="w-3.5 h-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              aria-hidden="true"
            >
              <path d="M3 6.5A2.5 2.5 0 0 1 5.5 4H10l2 2h6.5A2.5 2.5 0 0 1 21 8.5v8A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5v-10Z" />
            </svg>
          </div>
          <Input
            id="context-folder-path"
            data-setting="context-folder-path"
            type="text"
            placeholder={toDisplayText(htmlCopy.storageContextFolderPlaceholderNoFolderSelected)}
            readOnly
            value={storagePathValue}
            className="flex-1 min-w-0 bg-transparent text-[14px] font-medium text-zinc-900 dark:text-zinc-100 placeholder-zinc-400 dark:placeholder-zinc-500 truncate cursor-pointer"
          />
          <Button
            id="recording-move-folder"
            data-action="storage-open-folder"
            title=""
            size="sm"
            variant="outline"
            disabled={isPickerDisabled}
            onClick={(event) => {
              event.stopPropagation()
              void pickContextFolder(true)
            }}
          >
            {moveFolderLabel}
          </Button>
        </div>
        <span
          id="context-folder-status"
          data-setting-status="context-folder-status"
          className={`text-[14px] text-emerald-600 dark:text-emerald-400 ${storageUsageStatusText ? '' : 'hidden'}`}
          aria-live="polite"
        >
          {storageUsageStatusText}
        </span>
        <p
          id="context-folder-error"
          data-setting-error="context-folder-error"
          className={`text-[14px] text-red-600 dark:text-red-400 ${contextFolderErrorText ? '' : 'hidden'}`}
          role="alert"
          aria-live="polite"
        >
          {contextFolderErrorText}
        </p>
      </div>

      <div className="space-y-3">
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-[16px] font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
              {toDisplayText(htmlCopy.storageUsageBreakdown)}
            </h3>
            <span
              id="storage-usage-computing-tag"
              className={`text-[14px] text-zinc-400 ${isStorageUsageLoaded ? 'hidden' : ''}`}
            >
              {toDisplayText(htmlCopy.storageUsageComputing)}
            </span>
          </div>
          <div
            id="storage-usage-loading-indicator"
            className={`items-center gap-1.5 text-zinc-400 ${isStorageUsageLoaded ? 'hidden' : ''}`}
          >
            <svg
              viewBox="0 0 24 24"
              className="w-3.5 h-3.5 animate-spin"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              aria-hidden="true"
            >
              <path d="M12 3a9 9 0 1 0 9 9" />
            </svg>
            <span className="text-[14px]">{toDisplayText(htmlCopy.storageUsageCalculating)}</span>
          </div>
        </div>

        <div
          id="storage-usage-loading"
          className={`grid grid-cols-2 gap-3 ${isStorageUsageLoaded ? 'hidden' : ''}`}
        >
          <div className="h-14 bg-zinc-200 dark:bg-zinc-700 rounded-xl animate-pulse" />
          <div className="h-14 bg-zinc-200 dark:bg-zinc-700 rounded-xl animate-pulse" />
        </div>

        <div id="storage-usage-loaded" className={`grid grid-cols-2 gap-3 ${isStorageUsageLoaded ? '' : 'hidden'}`}>
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 shadow-sm">
            <div className="flex items-center gap-2 text-[14px] font-medium text-zinc-600 dark:text-zinc-300">
              <span>{toDisplayText(htmlCopy.storageUsageTextFilesUsing)}</span>
            </div>
            <div className="mt-2 flex items-baseline gap-1">
              <span
                id="storage-usage-value-steels-markdown"
                className="font-semibold text-zinc-900 dark:text-zinc-100 tabular-nums"
                style={{ fontSize: '22px', lineHeight: '1.2' }}
              >
                {textUsage.amount}
              </span>
              <span
                className="font-semibold text-zinc-500 dark:text-zinc-400"
                style={{ fontSize: '12px', lineHeight: '1.1' }}
              >
                {textUsage.unit}
              </span>
            </div>
          </div>
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 shadow-sm">
            <div className="flex items-center gap-2 text-[14px] font-medium text-zinc-600 dark:text-zinc-300">
              <span>{toDisplayText(htmlCopy.storageUsageScreenshotsUsing)}</span>
            </div>
            <div className="mt-2 flex items-baseline gap-1">
              <span
                id="storage-usage-value-screenshots"
                className="font-semibold text-zinc-900 dark:text-zinc-100 tabular-nums"
                style={{ fontSize: '22px', lineHeight: '1.2' }}
              >
                {screenshotUsage.amount}
              </span>
              <span
                className="font-semibold text-zinc-500 dark:text-zinc-400"
                style={{ fontSize: '12px', lineHeight: '1.1' }}
              >
                {screenshotUsage.unit}
              </span>
            </div>
          </div>
        </div>
        <p
          id="storage-usage-error"
          data-setting-error="storage-usage-error"
          className={`text-[14px] text-red-600 dark:text-red-400 ${storageUsageErrorText ? '' : 'hidden'}`}
          role="alert"
          aria-live="polite"
        >
          {storageUsageErrorText}
        </p>
      </div>

      <div className="space-y-3">
        <div className="space-y-1">
          <h3 className="text-[16px] font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            {toDisplayText(htmlCopy.storageImagesRetentionTitle)}
          </h3>
          <p className="text-[14px] text-zinc-500 dark:text-zinc-400">
            {toDisplayText(htmlCopy.storageImagesRetentionDescription)}
          </p>
        </div>
        <div className="relative w-fit">
          <Select
            id="storage-auto-cleanup-retention-days"
            data-setting="storage-auto-cleanup-retention-days"
            className="appearance-none bg-white dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 text-[14px] font-medium rounded-md py-2 pl-3 pr-8 outline-none focus:ring-2 focus:ring-zinc-400/20 cursor-pointer transition-all"
            value={String(settings.storageAutoCleanupRetentionDays)}
            onChange={(event) => {
              void saveStorageRetention(event.target.value)
            }}
          >
            {autoCleanupOptions.map((entry) => (
              <option key={entry.value} value={entry.value}>
                {entry.label}
              </option>
            ))}
          </Select>
          <svg
            viewBox="0 0 24 24"
            className="w-3.5 h-3.5 absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden="true"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </div>
      </div>

      <div className="space-y-3">
        <div className="space-y-1">
          <h3 className="text-[16px] font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            {toDisplayText(htmlCopy.storageDeleteRecentFilesTitle)}
          </h3>
          <p className="text-[14px] text-zinc-500 dark:text-zinc-400">
            {toDisplayText(htmlCopy.storageDeleteRecentFilesDescription)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Select
              id="storage-delete-window"
              data-setting="storage-delete-window"
              className="appearance-none bg-white dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 text-[14px] font-medium rounded-md py-2 pl-3 pr-8 outline-none focus:ring-2 focus:ring-zinc-400/20 cursor-pointer transition-all"
              value={deleteWindow}
              onChange={(event) => {
                setDeleteWindow(event.target.value)
              }}
              disabled={isDeleteDisabled}
            >
              {storageDeletePresets.map((entry) => (
                <option key={entry.value} value={entry.value}>
                  {entry.label}
                </option>
              ))}
            </Select>
            <svg
              viewBox="0 0 24 24"
              className="w-3.5 h-3.5 absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 pointer-events-none"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              aria-hidden="true"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </div>
          <Button
            id="storage-delete-files"
            data-action="storage-delete-files"
            variant="destructive"
            size="sm"
            onClick={() => {
              void deleteRecentFiles()
            }}
            disabled={isDeleteDisabled}
          >
            {toDisplayText(htmlCopy.storageDeleteFiles)}
          </Button>
        </div>
      </div>

      <div>
        <span
          id="storage-delete-files-status"
          data-setting-status="storage-delete-files-status"
          className={`text-[14px] text-emerald-600 dark:text-emerald-400 ${storageDeleteStatusText ? '' : 'hidden'}`}
          aria-live="polite"
        >
          {storageDeleteStatusText}
        </span>
      </div>
      {storageDeleteError ? (
        <p
          id="storage-delete-files-error"
          data-setting-error="storage-delete-files-error"
          className={`text-[14px] text-red-600 dark:text-red-400 ${storageDeleteErrorText ? '' : 'hidden'}`}
          role="alert"
          aria-live="polite"
        >
          {storageDeleteErrorText}
        </p>
      ) : null}
    </section>
  )
}
