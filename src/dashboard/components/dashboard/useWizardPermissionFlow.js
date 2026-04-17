import { useCallback, useEffect, useRef, useState } from 'react'

// Drives the Permissions-step UX state machine of the onboarding wizard.
// Permissions is step 1 in the current order (Permissions -> Context ->
// Agents -> Try it -> Automate).
//
//   checking -> initial peek on step entry (no OS prompt)
//   ready    -> permission is not granted; show the "Open System Settings" CTA
//   waiting  -> user clicked the CTA; we poll for grant every 2s
//   nudge    -> 30s elapsed in waiting with no grant; surface a hint
//   granted  -> OS says granted; show the success banner, enable Next
//
// Runs only while the wizard is on the Permissions step. Cleans up its
// own polling and timers on step change, unmount, and window blur.
const POLL_INTERVAL_MS = 2000
const NUDGE_AFTER_MS = 30000

export const useWizardPermissionFlow = ({
  familiar,
  wizardStep,
  onGranted
}) => {
  const [permissionFlowState, setPermissionFlowState] = useState('checking')
  const pollRef = useRef(null)
  const nudgeRef = useRef(null)
  const activeRef = useRef(false)
  const onGrantedRef = useRef(onGranted)

  useEffect(() => {
    onGrantedRef.current = onGranted
  }, [onGranted])

  const clearPoll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  const clearNudge = useCallback(() => {
    if (nudgeRef.current) {
      clearTimeout(nudgeRef.current)
      nudgeRef.current = null
    }
  }, [])

  const runSilentCheck = useCallback(async () => {
    if (!familiar || typeof familiar.checkScreenRecordingPermission !== 'function') {
      return null
    }
    try {
      const result = await familiar.checkScreenRecordingPermission()
      return result && typeof result === 'object' ? result : null
    } catch (error) {
      console.error('Silent permission check failed', error)
      return null
    }
  }, [familiar])

  const applyResult = useCallback(
    (result) => {
      if (!activeRef.current) return
      const granted = result && (result.granted === true || result.permissionStatus === 'granted')
      if (granted) {
        clearPoll()
        clearNudge()
        setPermissionFlowState('granted')
        const handler = onGrantedRef.current
        if (typeof handler === 'function') {
          try {
            handler()
          } catch (error) {
            console.error('onGranted handler threw', error)
          }
        }
        return true
      }
      return false
    },
    [clearPoll, clearNudge]
  )

  // On step entry (or re-entry): do a silent check. If already granted,
  // jump straight to the granted banner. Otherwise sit in ready.
  useEffect(() => {
    if (wizardStep !== 1) {
      activeRef.current = false
      clearPoll()
      clearNudge()
      return undefined
    }
    activeRef.current = true
    setPermissionFlowState('checking')
    let cancelled = false
    runSilentCheck().then((result) => {
      if (cancelled || !activeRef.current) return
      if (!applyResult(result)) {
        setPermissionFlowState('ready')
      }
    })
    return () => {
      cancelled = true
      activeRef.current = false
      clearPoll()
      clearNudge()
    }
  }, [wizardStep, runSilentCheck, applyResult, clearPoll, clearNudge])

  // Re-check whenever the window regains focus while on step 1 — covers
  // the common macOS dance where granting screen recording kills the app
  // and the user comes back manually.
  useEffect(() => {
    if (wizardStep !== 1) return undefined
    const handleFocus = () => {
      if (!activeRef.current) return
      runSilentCheck().then(applyResult)
    }
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [wizardStep, runSilentCheck, applyResult])

  const openSystemSettings = useCallback(async () => {
    if (!familiar || typeof familiar.openScreenRecordingSettings !== 'function') {
      return
    }
    try {
      await familiar.openScreenRecordingSettings()
    } catch (error) {
      console.error('Failed to open Screen Recording settings', error)
    }
    if (!activeRef.current) return
    setPermissionFlowState('waiting')
    clearPoll()
    clearNudge()
    pollRef.current = setInterval(() => {
      runSilentCheck().then(applyResult)
    }, POLL_INTERVAL_MS)
    nudgeRef.current = setTimeout(() => {
      if (!activeRef.current) return
      setPermissionFlowState((current) => (current === 'waiting' ? 'nudge' : current))
    }, NUDGE_AFTER_MS)
  }, [familiar, runSilentCheck, applyResult, clearPoll, clearNudge])

  return { permissionFlowState, openSystemSettings }
}
