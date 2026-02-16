const { validateContextFolderPath } = require('../settings');
const { createPresenceMonitor } = require('../screen-capture/presence');
const { createRecorder } = require('./recorder');
const { createStillsMarkdownWorker } = require('./stills-markdown-worker');
const { createClipboardMirror } = require('../clipboard/mirror');

const DEFAULT_PAUSE_DURATION_MS = 10 * 60 * 1000;
const DEFAULT_START_RETRY_INTERVAL_MS = 60 * 1000;

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
  const clock = options.clock || { now: () => Date.now() };
  const presenceMonitor = options.presenceMonitor ||
    createPresenceMonitor({ idleThresholdSeconds, logger });
  const recorder = options.recorder || createRecorder({ logger });
  const markdownWorker = options.markdownWorker || createStillsMarkdownWorker({ logger });
  const clipboardMirror = options.clipboardMirror
    || ((process.versions && process.versions.electron)
      ? createClipboardMirror({ logger })
      : null);
  const startRetryIntervalMs =
    Number.isFinite(options.startRetryIntervalMs) && options.startRetryIntervalMs > 0
      ? options.startRetryIntervalMs
      : DEFAULT_START_RETRY_INTERVAL_MS;

  let state = STATES.DISABLED;
  let settings = { enabled: false, contextFolderPath: '' };
  let started = false;
  let presenceRunning = false;
  let pendingStart = false;
  let manualPaused = false;
  let manualPauseStartedAt = null;
  let pauseTimer = null;
  let activeSessionId = null;
  let lastPresenceState = null;
  let startRetryTimer = null;
  let startRetryAttempt = 0;

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

  function clearManualPauseState() {
    manualPaused = false;
    manualPauseStartedAt = null;
    clearPauseTimer();
  }

  function getPauseRemainingMs() {
    if (!manualPaused || !manualPauseStartedAt) {
      return 0;
    }
    const elapsedMs = Math.max(0, clock.now() - manualPauseStartedAt);
    return Math.max(0, pauseDurationMs - elapsedMs);
  }

  function clearStartRetryTimer() {
    if (!startRetryTimer) {
      return;
    }
    scheduler.clearTimeout(startRetryTimer);
    startRetryTimer = null;
  }

  function resetStartRetry() {
    clearStartRetryTimer();
    startRetryAttempt = 0;
  }

  function shouldRetryStart(error) {
    const message = error?.message || '';
    if (typeof message !== 'string') {
      return true;
    }
    // These require user intervention; retrying just spams logs/toasts.
    if (message.includes('Screen Recording permission is not granted')) {
      return false;
    }
    if (message.includes('Context folder path missing')) {
      return false;
    }
    return true;
  }

  function scheduleStartRetry(error) {
    if (startRetryTimer) {
      return;
    }
    if (!settings.enabled || manualPaused) {
      return;
    }
    if (lastPresenceState !== 'active') {
      return;
    }
    if (!canRecord()) {
      return;
    }
    if (!shouldRetryStart(error)) {
      return;
    }

    startRetryAttempt += 1;
    const delayMs = startRetryIntervalMs;

    logger.warn('Recording start failed; scheduling retry', {
      attempt: startRetryAttempt,
      delayMs,
      message: error?.message || 'start-failed'
    });

    onError({
      message: error?.message || 'Failed to start recording.',
      reason: 'start-failed',
      willRetry: true,
      retryDelayMs: delayMs,
      attempt: startRetryAttempt
    });

    startRetryTimer = scheduler.setTimeout(() => {
      startRetryTimer = null;
      if (!settings.enabled || manualPaused) {
        return;
      }
      if (lastPresenceState !== 'active') {
        return;
      }
      void startRecording('retry');
    }, delayMs);
    if (startRetryTimer && typeof startRetryTimer.unref === 'function') {
      startRetryTimer.unref();
    }
  }

  function schedulePauseResume() {
    clearPauseTimer();
    pauseTimer = scheduler.setTimeout(() => {
      pauseTimer = null;
      if (!manualPaused) {
        return;
      }
      clearManualPauseState();
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
    clearStartRetryTimer();
    pendingStart = false;
    setState(STATES.RECORDING, { source });
    try {
      markdownWorker.start({ contextFolderPath: settings.contextFolderPath });
      const result = await recorder.start({ contextFolderPath: settings.contextFolderPath });
      resetStartRetry();
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
      if (clipboardMirror && typeof clipboardMirror.stop === 'function') {
        clipboardMirror.stop('start-failed');
      }
      activeSessionId = null;
      setState(settings.enabled ? STATES.ARMED : STATES.DISABLED, { reason: 'start-failed' });
      scheduleStartRetry(error);
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
    lastPresenceState = 'active';
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
    lastPresenceState = presenceState;
    if (presenceState === 'active') {
      logger.log('Recording presence active; syncing state', { reason });
      handleActive();
    }
  }

  function handleIdle({ idleSeconds } = {}) {
    lastPresenceState = 'idle';
    clearStartRetryTimer();
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
    lastPresenceState = 'lock';
    clearStartRetryTimer();
    if (state === STATES.RECORDING || state === STATES.IDLE_GRACE) {
      void stopRecording('lock');
    }
  }

  function handleSuspend() {
    lastPresenceState = 'suspend';
    clearStartRetryTimer();
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
      resetStartRetry();
      manualPaused = false;
      manualPauseStartedAt = null;
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
      resetStartRetry();
      stopPresence();
      markdownWorker.stop();
      manualPaused = false;
      manualPauseStartedAt = null;
      clearPauseTimer();
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
    const validation = validateContext();
    if (!validation.ok) {
      return { ok: false, message: validation.message };
    }

    if (!settings.enabled) {
      settings = {
        ...settings,
        enabled: true
      };
      resetStartRetry();
      setState(STATES.ARMED, { reason: 'manual-enabled' });
      ensurePresenceRunning();
      logger.log('Recording enabled from manual start');
    }
    const wasPaused = manualPaused;
    manualPaused = false;
    manualPauseStartedAt = null;
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
    resetStartRetry();
    if (manualPaused) {
      manualPauseStartedAt = clock.now();
      schedulePauseResume();
      logger.log('Recording pause extended', { durationMs: pauseDurationMs });
      return { ok: true, alreadyPaused: true };
    }
    if (state !== STATES.RECORDING && state !== STATES.IDLE_GRACE) {
      return { ok: false, message: 'Recording is not active.' };
    }
    manualPaused = true;
    manualPauseStartedAt = clock.now();
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
    resetStartRetry();
    manualPaused = false;
    manualPauseStartedAt = null;
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
    resetStartRetry();
    manualPaused = false;
    manualPauseStartedAt = null;
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
    return {
      ...settings,
      state,
      manualPaused,
      activeSessionId,
      pauseRemainingMs: getPauseRemainingMs()
    };
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
