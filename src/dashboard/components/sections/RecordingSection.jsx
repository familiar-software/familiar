import React from 'react'

import { Button } from '../ui/button'
import { ButtonGroup } from '../ui/button-group'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { Label } from '../ui/label'
import { Checkbox } from '../ui/checkbox'
import { resolveRecordingIndicatorVisuals } from '../dashboard/dashboardUtils'

export function RecordingSection({
  mc,
  toDisplayText,
  recordingStatus,
  recordingIndicator: providedRecordingIndicator,
  settings,
  recordingMessage,
  recordingError,
  setAlwaysRecord,
  checkPermissions,
  openScreenRecordingSettings,
  copyDebugLog,
  copyLogMessage,
  copyLogError,
  permissionCheckState,
  copyLogBusy
}) {
  const htmlCopy = mc?.dashboard?.html || {}
  const isPermissionCheckGranted = permissionCheckState === 'granted'
  const isPermissionCheckDenied = permissionCheckState === 'denied'
  const isCheckingPermissions = permissionCheckState === 'checking'
  const checkPermissionsLabel = isCheckingPermissions
    ? mc.dashboard.stills.checkingPermissions
    : isPermissionCheckGranted
      ? mc.dashboard.stills.permissionsGranted
      : mc.dashboard.settingsActions.checkPermissions
  const openScreenRecordingLabel = toDisplayText(htmlCopy.recordingEnableFamiliarInScreenRecording)
  const isPathSet = Boolean(settings.contextFolderPath)
  const checkPermissionsClasses = isPermissionCheckGranted
    ? 'text-emerald-600 hover:text-emerald-700 border-emerald-600 hover:border-emerald-700'
    : 'text-indigo-600 hover:text-indigo-700 border-indigo-600 hover:border-indigo-700'

  const recordingIndicator = providedRecordingIndicator || resolveRecordingIndicatorVisuals({
    enabled: recordingStatus?.enabled,
    state: recordingStatus?.state,
    manualPaused: recordingStatus?.manualPaused,
    permissionGranted: recordingStatus?.permissionGranted,
    permissionStatus: recordingStatus?.permissionStatus,
    copy: mc?.dashboard?.recordingIndicator || {}
  })
  const recordingStatusText = toDisplayText(recordingIndicator.label) || 'Off'
  const recordingDotClass = recordingIndicator.dotClass || 'bg-zinc-400'
  const recordingIndicatorStatus = recordingIndicator.status || 'off'
  const statusBadgeStyleMap = {
    off: 'border-zinc-200 bg-zinc-100 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200',
    paused: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-300',
    'permission-needed': 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300',
    recording: 'border-emerald-100 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-900/20 dark:text-emerald-300',
    idle: 'border-zinc-200 bg-zinc-100 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200'
  }
  const statusBadgeClasses =
    statusBadgeStyleMap[recordingIndicatorStatus] ||
    statusBadgeStyleMap.off

  return (
    <section id="section-recording" className="space-y-6">
      <section
        id="recording-recording-toggle-section"
        data-role="permission-recording-toggle-section"
        data-permission-toggle-visibility="always"
        className="space-y-2"
      >
        <Label htmlFor="recording-always-record-when-active" className="relative block w-full cursor-pointer group">
          <Checkbox
            id="recording-always-record-when-active"
            data-setting="always-record-when-active"
            type="checkbox"
            className="sr-only peer"
            checked={settings.alwaysRecordWhenActive}
            onChange={(event) => {
              void setAlwaysRecord(event.target.checked)
            }}
          />
          <div className="wizard-capture-toggle-card rounded-xl border-2 border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900 p-4 transition-all duration-300 hover:border-zinc-300 dark:hover:border-zinc-600 hover:bg-zinc-100 dark:hover:bg-zinc-800 peer-checked:bg-indigo-50/40 dark:peer-checked:bg-indigo-500/10 peer-checked:shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="wizard-capture-toggle-icon w-8 h-8 rounded-full flex items-center justify-center transition-colors duration-300 bg-white dark:bg-black border border-zinc-200 dark:border-zinc-700 text-zinc-400 group-hover:text-zinc-600 dark:group-hover:text-zinc-300 peer-checked:bg-indigo-100 dark:peer-checked:bg-indigo-900/50 peer-checked:border-transparent peer-checked:text-indigo-600 dark:peer-checked:text-indigo-400">
                  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                    <rect x="3" y="7" width="13" height="10" rx="2" />
                    <path d="M16 10l5-3v10l-5-3z" />
                  </svg>
                </div>
                <div className="flex flex-col gap-0.5 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[14px] font-medium text-zinc-900 dark:text-zinc-100">
                      {toDisplayText(htmlCopy.recordingCaptureWhileActive)}
                    </span>
                    <div
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[14px] font-medium uppercase tracking-wide ${statusBadgeClasses}`}
                      hidden={recordingIndicatorStatus !== 'paused'}
                    >
                      <span id="recording-status-dot" className={`w-2 h-2 rounded-full ${recordingDotClass}`} />
                      <span id="recording-status">{recordingStatusText}</span>
                    </div>
                  </div>
                  <span className="wizard-capture-toggle-subtitle-off text-[14px] text-zinc-500 dark:text-zinc-400 block peer-checked:hidden transition-opacity">
                    {toDisplayText(htmlCopy.recordingActionRequiredToProceed)}
                  </span>
                </div>
              </div>
              <div className="wizard-capture-toggle-switch relative w-12 h-6 rounded-full bg-zinc-300 dark:bg-zinc-700 transition-colors duration-300 ease-in-out peer-checked:bg-indigo-600 shadow-inner group-hover:bg-zinc-400 dark:group-hover:bg-zinc-600 peer-checked:group-hover:bg-indigo-700">
                <div className="wizard-capture-toggle-knob absolute left-1 top-1 w-4 h-4 rounded-full bg-white shadow-sm transform transition-transform duration-300 peer-checked:translate-x-6" />
              </div>
            </div>
          </div>
        </Label>
        <p
          id="recording-always-record-when-active-error"
          data-setting-error="always-record-when-active-error"
          className={`text-[14px] text-red-600 dark:text-red-400 ${toDisplayText(recordingError) ? '' : 'hidden'}`}
        >
          {toDisplayText(recordingError)}
        </p>
        <span
          id="recording-always-record-when-active-status"
          data-setting-status="always-record-when-active-status"
          className={`text-[14px] text-emerald-600 dark:text-emerald-400 ${toDisplayText(recordingMessage) ? '' : 'hidden'}`}
          aria-live="polite"
        >
          {toDisplayText(recordingMessage)}
        </span>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>{toDisplayText(htmlCopy.recordingAdvancedTitle)}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <ButtonGroup>
                <Button
                  id="recording-check-permissions"
                  data-action="check-permissions"
                  variant="outline"
                  size="sm"
                  className={checkPermissionsClasses}
                  disabled={isCheckingPermissions}
                  onClick={() => {
                    void checkPermissions()
                  }}
                >
                  {checkPermissionsLabel}
                </Button>
                <Button
                  id="copy-debug-log"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    void copyDebugLog()
                  }}
                  disabled={copyLogBusy}
                >
                  {mc.dashboard.settingsActions.copyLog}
                </Button>
              </ButtonGroup>
              <ButtonGroup hidden={!isPermissionCheckDenied}>
                <Button
                  id="recording-open-screen-recording-settings"
                  data-action="open-screen-recording-settings"
                  variant="outline"
                  size="sm"
                  onClick={openScreenRecordingSettings}
                >
                  {openScreenRecordingLabel}
                </Button>
              </ButtonGroup>
            </div>
            <p
              id="recording-open-screen-recording-settings-note"
              data-open-screen-recording-settings-note
              className="text-[14px] font-semibold text-zinc-500 dark:text-zinc-400"
              hidden={!isPermissionCheckDenied}
            >
              {toDisplayText(htmlCopy.recordingScreenRecordingSettingsNote)}
            </p>
            <span id="copy-log-status" data-setting-status="copy-log-status" className={`text-[14px] text-emerald-600 dark:text-emerald-400 ${toDisplayText(copyLogMessage) ? '' : 'hidden'}`} aria-live="polite">
              {toDisplayText(copyLogMessage)}
            </span>
            <span id="copy-log-error" data-setting-error="copy-log-error" className={`text-[14px] text-red-600 dark:text-red-400 ${toDisplayText(copyLogError) ? '' : 'hidden'}`} role="alert" aria-live="polite">
              {toDisplayText(copyLogError)}
            </span>
          </div>
        </CardContent>
      </Card>
    </section>
  )
}
