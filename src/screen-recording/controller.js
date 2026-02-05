const { validateContextFolderPath } = require('../settings');
const { createPresenceMonitor } = require('./presence');
const { createRecorder } = require('./recorder');

const STATES = Object.freeze({
  DISABLED: 'disabled',
  ARMED: 'armed',
  RECORDING: 'recording',
  IDLE_GRACE: 'idleGrace',
  STOPPING: 'stopping'
});

function noop() {}

function createScreenRecordingController(options = {}) {
  const logger = options.logger || console;
  const onError = typeof options.onError === 'function' ? options.onError : noop;
  const idleThresholdSeconds =
    typeof options.idleThresholdSeconds === 'number' ? options.idleThresholdSeconds : 60;
  const presenceMonitor = options.presenceMonitor ||
    createPresenceMonitor({ idleThresholdSeconds, logger });
  const recorder = options.recorder || createRecorder({ logger });

  let state = STATES.DISABLED;
  let settings = { enabled: false, contextFolderPath: '' };
  let started = false;
  let presenceRunning = false;
  let pendingStart = false;
  let manualPaused = false;

  function setState(nextState, details = {}) {
    if (state === nextState) {
      return;
    }
    logger.log('Screen recording state change', {
      from: state,
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
      logger.warn('Screen recording disabled: invalid context folder path', {
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
      await recorder.start({ contextFolderPath: settings.contextFolderPath });
    } catch (error) {
      logger.error('Failed to start screen recording', error);
      onError({ message: error?.message || 'Failed to start screen recording.', reason: 'start-failed' });
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
      logger.error('Failed to stop screen recording', error);
      onError({ message: error?.message || 'Failed to stop screen recording.', reason: 'stop-failed' });
    }

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
      logger.log('Screen recording presence active; syncing state', { reason });
      handleActive();
    }
  }

  function handleIdle({ idleSeconds } = {}) {
    if (manualPaused) {
      manualPaused = false;
    }
    if (state !== STATES.RECORDING) {
      return;
    }
    setState(STATES.IDLE_GRACE, { idleSeconds });
    void stopRecording('idle');
  }

  function simulateIdle(idleSeconds = idleThresholdSeconds + 1) {
    const nextIdleSeconds = Number.isFinite(idleSeconds) && idleSeconds >= 0
      ? idleSeconds
      : idleThresholdSeconds + 1
    logger.log('Screen recording idle simulation', { idleSeconds: nextIdleSeconds })
    handleIdle({ idleSeconds: nextIdleSeconds })
  }

  function handleLock() {
    manualPaused = false;
    if (state === STATES.RECORDING || state === STATES.IDLE_GRACE) {
      void stopRecording('lock');
    }
  }

  function handleSuspend() {
    manualPaused = false;
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
      stopPresence();
      if (state === STATES.RECORDING || state === STATES.IDLE_GRACE) {
        void stopRecording('disabled');
      }
      setState(STATES.DISABLED, { reason: 'disabled' });
      return;
    }

    if (!canRecord()) {
      stopPresence();
      setState(STATES.DISABLED, { reason: 'invalid-context' });
      return;
    }

    if (recorder && typeof recorder.recover === 'function') {
      recorder.recover(settings.contextFolderPath);
    }

    setState(STATES.ARMED, { reason: 'enabled' });
    ensurePresenceRunning();
    syncPresenceState('settings-update');
  }

  async function manualStart() {
    if (!settings.enabled) {
      return { ok: false, message: 'Recording is disabled.' };
    }
    manualPaused = false;
    await startRecording('manual');
    return { ok: true };
  }

  async function manualStop() {
    if (!settings.enabled) {
      return { ok: false, message: 'Recording is disabled.' };
    }
    if (state !== STATES.RECORDING && state !== STATES.IDLE_GRACE) {
      return { ok: false, message: 'Recording is not active.' };
    }
    manualPaused = true;
    await stopRecording('manual');
    return { ok: true };
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
    pendingStart = false;
    if (state === STATES.RECORDING || state === STATES.IDLE_GRACE) {
      await recorder.stop({ reason });
    }
    setState(STATES.DISABLED, { reason });
  }

  function dispose() {
    stopPresence();
    presenceMonitor.off('active', handleActive);
    presenceMonitor.off('idle', handleIdle);
    presenceMonitor.off('lock', handleLock);
    presenceMonitor.off('suspend', handleSuspend);
    presenceMonitor.off('unlock', handleActive);
    presenceMonitor.off('resume', handleActive);
  }

  function getState() {
    return { ...settings, state, manualPaused };
  }

  return {
    start,
    dispose,
    shutdown,
    manualStart,
    manualStop,
    simulateIdle,
    updateSettings,
    getState
  };
}

module.exports = {
  STATES,
  createScreenRecordingController
};
