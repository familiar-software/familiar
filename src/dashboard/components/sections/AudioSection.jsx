import React from 'react'

import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { shortcutFromKeyboardEvent } from '../dashboard/meetingShortcutInput'

const resolveAutomaticSourceStatus = ({ htmlCopy, meetingRecordingStatus }) => {
  const isChecking = meetingRecordingStatus?.availability === 'checking'
  const isGloballyUnavailable = meetingRecordingStatus?.availability === 'unavailable'
  let status = htmlCopy.audioAutomaticSourceHelp
  let isUnavailable = false
  if (isChecking) {
    status = htmlCopy.audioAutomaticSourceChecking
  } else if (isGloballyUnavailable) {
    status = meetingRecordingStatus?.unavailableReason ||
      htmlCopy.audioAutomaticSourceUnavailable
    isUnavailable = true
  }
  return { isUnavailable, status }
}

function AutomaticVoiceSource({
  htmlCopy,
  meetingRecordingStatus,
  toDisplayText
}) {
  const sourceStatus = resolveAutomaticSourceStatus({
    htmlCopy,
    meetingRecordingStatus
  })
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <h3 className="text-[16px] font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
          {toDisplayText(htmlCopy.audioAutomaticSourceTitle)}
        </h3>
        <p
          id="audio-automatic-source"
          className="text-[14px] font-medium text-zinc-900 dark:text-zinc-100"
        >
          {toDisplayText(htmlCopy.audioAutomaticSourceLabel)}
        </p>
      </div>
      <p
        id="audio-automatic-source-status"
        className={
          sourceStatus.isUnavailable
            ? 'text-[14px] text-red-600 dark:text-red-400'
            : 'text-[14px] text-zinc-500 dark:text-zinc-400'
        }
        aria-live="polite"
      >
        {toDisplayText(sourceStatus.status)}
      </p>
    </div>
  )
}

function MeetingShortcutField({
  htmlCopy,
  saveShortcut,
  shortcutValue,
  setLocalError,
  toDisplayText
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <h3 className="text-[16px] font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
          {toDisplayText(htmlCopy.audioMeetingShortcutTitle)}
        </h3>
        <p className="text-[14px] text-zinc-500 dark:text-zinc-400">
          {toDisplayText(htmlCopy.audioMeetingShortcutDescription)}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Input
          id="audio-meeting-recording-shortcut"
          data-setting="meeting-recording-shortcut"
          type="text"
          readOnly
          value={shortcutValue}
          placeholder={toDisplayText(htmlCopy.audioMeetingShortcutPlaceholder)}
          className="font-medium"
          onKeyDown={(event) => {
            event.preventDefault()
            const result = shortcutFromKeyboardEvent(event)
            if (result.clear) {
              void saveShortcut(null)
              return
            }
            if (result.needsModifier) {
              setLocalError(toDisplayText(htmlCopy.audioMeetingShortcutModifierRequired))
              return
            }
            if (result.shortcut) {
              void saveShortcut(result.shortcut)
            }
          }}
        />
        <Button
          id="audio-meeting-recording-shortcut-clear"
          type="button"
          variant="outline"
          disabled={!shortcutValue}
          onClick={() => {
            void saveShortcut(null)
          }}
        >
          {toDisplayText(htmlCopy.audioMeetingShortcutClear)}
        </Button>
      </div>
    </div>
  )
}

export function AudioSection({
  mc,
  toDisplayText,
  settings,
  meetingRecordingStatus,
  audioMessage,
  audioError,
  saveMeetingRecordingShortcut
}) {
  const htmlCopy = mc?.dashboard?.html || {}
  const [localError, setLocalError] = React.useState('')
  const shortcutValue = settings?.meetingRecordingShortcut || ''
  const statusText = toDisplayText(audioMessage)
  const bridgeErrorText = toDisplayText(audioError)
  const localErrorText = toDisplayText(localError)
  const errorText = bridgeErrorText || localErrorText

  const saveShortcut = async (nextShortcut) => {
    setLocalError('')
    await saveMeetingRecordingShortcut(nextShortcut)
  }

  return (
    <section
      id="section-audio"
      aria-label={toDisplayText(htmlCopy.audioAriaLabelAudioSettings)}
      className="space-y-6 max-w-[520px] flex flex-col flex-1"
    >
      <AutomaticVoiceSource
        htmlCopy={htmlCopy}
        meetingRecordingStatus={meetingRecordingStatus}
        toDisplayText={toDisplayText}
      />
      <div className="space-y-3">
        <MeetingShortcutField
          htmlCopy={htmlCopy}
          saveShortcut={saveShortcut}
          shortcutValue={shortcutValue}
          setLocalError={setLocalError}
          toDisplayText={toDisplayText}
        />

        <span
          id="audio-settings-status"
          data-setting-status="audio-settings-status"
          className={
            `text-[14px] text-emerald-600 dark:text-emerald-400 ${
              statusText ? '' : 'hidden'
            }`
          }
          aria-live="polite"
        >
          {statusText}
        </span>
        <p
          id="audio-settings-error"
          data-setting-error="audio-settings-error"
          className={`text-[14px] text-red-600 dark:text-red-400 ${errorText ? '' : 'hidden'}`}
          role="alert"
          aria-live="polite"
        >
          {errorText}
        </p>
      </div>
    </section>
  )
}
