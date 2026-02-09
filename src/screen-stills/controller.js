const { validateContextFolderPath } = require('../settings');
const { createPresenceMonitor } = require('../screen-capture/presence');
const { createRecorder } = require('./recorder');
const { createStillsMarkdownWorker } = require('./stills-markdown-worker');
const { createClipboardMirror } = require('../clipboard/mirror');

const DEFAULT_PAUSE_DURATION_MS = 10 * 60 * 1000;

const STATES = Object.freeze({
  DISABLED: 'disabled',
  ARMED: 'armed',
  RECORDING: 'recording',
  IDLE_GRACE: 'idleGrace',
  STOPPING: 'stopping'
});

function noop() {}

function createScreenStillsController(options = {}) {
  const logger = options.logger || console;
  const onError = typeof options.onError === 'function' ? options.onError : noop;
  const idleThresholdSeconds =
    typeof options.idleThresholdSeconds === 'number' ? options.idleThresholdSeconds : 60;
  const pauseDurationMs =
    Number.isFinite(options.pauseDurationMs) && options.pauseDurationMs > 0
      ? options.pauseDurationMs
      : DEFAULT_PAUSE_DURATION_MS;
  const scheduler = options.scheduler || { setTimeout, clearTimeout };
  const presenceMonitor = options.presenceMonitor ||
    createPresenceMonitor({ idleThresholdSeconds, logger });
  const recorder = options.recorder || createRecorder({ logger });
  const markdownWorker = options.markdownWorker || createStillsMarkdownWorker({ logger });
  const clipboardMirror = options.clipboardMirror
    || ((process.versions && process.versions.electron)
      ? createClipboardMirror({ logger })
      : null);

  let state = STATES.DISABLED;
  let settings = { enabled: false, contextFolderPath: '' };
  let started = false;
  let presenceRunning = false;
  let pendingStart = false;
  let manualPaused = false;
  let pauseTimer = null;
  let activeSessionId = null;

  function setState(nextState, details = {}) {
    if (state === nextState) {
      return;
    }
    const prevState = state;
    if (prevState === STATES.RECORDING && nextState !== STATES.RECORDING) {
      if (clipboardMirror && typeof clipboardMirror.stop === 'function') {
        clipboardMirror.stop(`state:${prevState}->${nextState}`);
      }
      activeSessionId = null;
    }
    logger.log('Recording state change', {
      from: prevState,
      to: nextState,
      ...details
    });
    state = nextState;
  }

  function validateContext() {
    if (!settings.contextFolderPath) {
      return { ok: false, message: 'Context folder path missing.' };
    }
    return validateContextFolderPath(settings.contextFolderPath);
  }

  function canRecord() {
    if (!settings.enabled) {
      return false;
    }
    const validation = validateContext();
    if (!validation.ok) {
      logger.warn('Recording disabled: invalid context folder path', {
        message: validation.message
      });
      onError({ message: validation.message, reason: 'invalid-context' });
      return false;
    }
    return true;
  }

  function ensurePresenceRunning() {
    if (presenceRunning) {
      return;
    }
    presenceMonitor.start();
    presenceRunning = true;
  }

  function stopPresence() {
    if (!presenceRunning) {
      return;
    }
    presenceMonitor.stop();
    presenceRunning = false;
  }

  function clearPauseTimer() {
    if (!pauseTimer) {
      return;
    }
    scheduler.clearTimeout(pauseTimer);
    pauseTimer = null;
  }

  function schedulePauseResume() {
    clearPauseTimer();
    pauseTimer = scheduler.setTimeout(() => {
      pauseTimer = null;
      if (!manualPaused) {
        return;
      }
      manualPaused = false;
      logger.log('Recording pause window elapsed', { durationMs: pauseDurationMs });
      syncPresenceState('pause-elapsed');
    }, pauseDurationMs);
    if (pauseTimer && typeof pauseTimer.unref === 'function') {
      pauseTimer.unref();
    }
  }

  async function startRecording(source) {
    if (!canRecord()) {
      setState(STATES.DISABLED, { reason: 'invalid-context' });
      return;
    }
    if (state === STATES.RECORDING) {
      return;
    }
    pendingStart = false;
    setState(STATES.RECORDING, { source });
    try {
      markdownWorker.start({ contextFolderPath: settings.contextFolderPath });
      const result = await recorder.start({ contextFolderPath: settings.contextFolderPath });
      activeSessionId = typeof result?.sessionId === 'string' ? result.sessionId : null;
      if (state !== STATES.RECORDING) {
        logger.log('Clipboard mirror start skipped: recording not active', { state });
        activeSessionId = null;
        return;
      }
      if (!activeSessionId) {
        logger.warn('Clipboard mirror disabled: missing recording session id');
      } else if (clipboardMirror && typeof clipboardMirror.start === 'function') {
        clipboardMirror.start({
          contextFolderPath: settings.contextFolderPath,
          sessionId: activeSessionId
        });
      }
    } catch (error) {
      logger.error('Failed to start recording', error);
      onError({ message: error?.message || 'Failed to start recording.', reason: 'start-failed' });
      if (clipboardMirror && typeof clipboardMirror.stop === 'function') {
        clipboardMirror.stop('start-failed');
      }
      activeSessionId = null;
      setState(settings.enabled ? STATES.ARMED : STATES.DISABLED, { reason: 'start-failed' });
    }
  }

  async function stopRecording(reason) {
    if (state !== STATES.RECORDING && state !== STATES.IDLE_GRACE) {
      return;
    }
    setState(STATES.STOPPING, { reason });
    try {
      await recorder.stop({ reason });
    } catch (error) {
      logger.error('Failed to stop recording', error);
      onError({ message: error?.message || 'Failed to stop recording.', reason: 'stop-failed' });
    }
    markdownWorker.stop();
    if (clipboardMirror && typeof clipboardMirror.stop === 'function') {
      clipboardMirror.stop(`stop:${reason || 'stop'}`);
    }
    activeSessionId = null;

    if (settings.enabled) {
      if (pendingStart) {
        pendingStart = false;
        await startRecording('resume');
        return;
      }
      setState(STATES.ARMED, { reason: 'stopped' });
      return;
    }

    setState(STATES.DISABLED, { reason: 'disabled' });
  }

  function handleActive() {
    if (!settings.enabled || manualPaused) {
      return;
    }
    if (state === STATES.STOPPING) {
      pendingStart = true;
      return;
    }
    if (state === STATES.ARMED || state === STATES.IDLE_GRACE) {
      void startRecording('active');
    }
  }

  function syncPresenceState(reason) {
    if (!presenceMonitor || typeof presenceMonitor.getState !== 'function') {
      return;
    }
    const presenceState = presenceMonitor.getState().state;
    if (presenceState === 'active') {
      logger.log('Recording presence active; syncing state', { reason });
      handleActive();
    }
  }

  function handleIdle({ idleSeconds } = {}) {
    if (state !== STATES.RECORDING) {
      return;
    }
    setState(STATES.IDLE_GRACE, { idleSeconds });
    void stopRecording('idle');
  }

  function simulateIdle(idleSeconds = idleThresholdSeconds + 1) {
    const nextIdleSeconds = Number.isFinite(idleSeconds) && idleSeconds >= 0
      ? idleSeconds
      : idleThresholdSeconds + 1;
    logger.log('Recording idle simulation', { idleSeconds: nextIdleSeconds });
    handleIdle({ idleSeconds: nextIdleSeconds });
  }

  function handleLock() {
    if (state === STATES.RECORDING || state === STATES.IDLE_GRACE) {
      void stopRecording('lock');
    }
  }

  function handleSuspend() {
    if (state === STATES.RECORDING || state === STATES.IDLE_GRACE) {
      void stopRecording('suspend');
    }
  }

  function updateSettings({ enabled, contextFolderPath } = {}) {
    settings = {
      enabled: enabled === true,
      contextFolderPath: typeof contextFolderPath === 'string' ? contextFolderPath : ''
    };

    if (!settings.enabled) {
      manualPaused = false;
      clearPauseTimer();
      stopPresence();
      markdownWorker.stop();
      if (clipboardMirror && typeof clipboardMirror.stop === 'function') {
        clipboardMirror.stop('disabled');
      }
      activeSessionId = null;
      if (state === STATES.RECORDING || state === STATES.IDLE_GRACE) {
        void stopRecording('disabled');
      }
      setState(STATES.DISABLED, { reason: 'disabled' });
      return;
    }

    if (!canRecord()) {
      stopPresence();
      markdownWorker.stop();
      if (clipboardMirror && typeof clipboardMirror.stop === 'function') {
        clipboardMirror.stop('invalid-context');
      }
      activeSessionId = null;
      setState(STATES.DISABLED, { reason: 'invalid-context' });
      return;
    }

    if (recorder && typeof recorder.recover === 'function') {
      recorder.recover(settings.contextFolderPath);
    }

    setState(STATES.ARMED, { reason: 'enabled' });
    ensurePresenceRunning();
    markdownWorker.start({ contextFolderPath: settings.contextFolderPath });
    syncPresenceState('settings-update');
  }

  async function manualStart() {
    if (!settings.enabled) {
      return { ok: false, message: 'Recording is disabled.' };
    }
    const wasPaused = manualPaused;
    manualPaused = false;
    clearPauseTimer();
    if (wasPaused) {
      logger.log('Recording resumed manually');
    }
    await startRecording('manual');
    return { ok: true };
  }

  async function manualPause() {
    if (!settings.enabled) {
      return { ok: false, message: 'Recording is disabled.' };
    }
    if (manualPaused) {
      schedulePauseResume();
      logger.log('Recording pause extended', { durationMs: pauseDurationMs });
      return { ok: true, alreadyPaused: true };
    }
    if (state !== STATES.RECORDING && state !== STATES.IDLE_GRACE) {
      return { ok: false, message: 'Recording is not active.' };
    }
    manualPaused = true;
    pendingStart = false;
    schedulePauseResume();
    logger.log('Recording paused manually', { durationMs: pauseDurationMs });
    await stopRecording('manual-pause');
    return { ok: true };
  }

  async function manualStop() {
    return manualPause();
  }

  function start() {
    if (started) {
      return;
    }
    started = true;
    presenceMonitor.on('active', handleActive);
    presenceMonitor.on('idle', handleIdle);
    presenceMonitor.on('lock', handleLock);
    presenceMonitor.on('suspend', handleSuspend);
    presenceMonitor.on('unlock', handleActive);
    presenceMonitor.on('resume', handleActive);
  }

  async function shutdown(reason = 'quit') {
    stopPresence();
    manualPaused = false;
    clearPauseTimer();
    pendingStart = false;
    if (state === STATES.RECORDING || state === STATES.IDLE_GRACE) {
      await recorder.stop({ reason });
    }
    markdownWorker.stop();
    if (clipboardMirror && typeof clipboardMirror.stop === 'function') {
      clipboardMirror.stop(`shutdown:${reason}`);
    }
    activeSessionId = null;
    setState(STATES.DISABLED, { reason });
  }

  function dispose() {
    stopPresence();
    manualPaused = false;
    clearPauseTimer();
    markdownWorker.stop();
    if (clipboardMirror && typeof clipboardMirror.stop === 'function') {
      clipboardMirror.stop('dispose');
    }
    activeSessionId = null;
    presenceMonitor.off('active', handleActive);
    presenceMonitor.off('idle', handleIdle);
    presenceMonitor.off('lock', handleLock);
    presenceMonitor.off('suspend', handleSuspend);
    presenceMonitor.off('unlock', handleActive);
    presenceMonitor.off('resume', handleActive);
  }

  function getState() {
    return { ...settings, state, manualPaused, activeSessionId };
  }

  return {
    start,
    dispose,
    shutdown,
    manualStart,
    manualPause,
    manualStop,
    simulateIdle,
    updateSettings,
    getState
  };
}

module.exports = {
  STATES,
  createScreenStillsController
};
