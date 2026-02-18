const DEFAULT_RECORDING_OFF_REMINDER_DELAY_MS = 60 * 60 * 1000;

function noop() {}

function createRecordingOffReminder({
  delayMs = DEFAULT_RECORDING_OFF_REMINDER_DELAY_MS,
  showToast,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout
} = {}) {
  const notify = typeof showToast === 'function' ? showToast : noop;
  const reminderDelayMs = Number.isFinite(delayMs) && delayMs > 0 ? Math.floor(delayMs) : DEFAULT_RECORDING_OFF_REMINDER_DELAY_MS;
  let reminderTimer = null;

  const clearReminderTimer = () => {
    if (!reminderTimer) {
      return;
    }
    clearTimeoutFn(reminderTimer);
    reminderTimer = null;
  };

  const showReminder = () => {
    notify({
      title: 'Recording is off',
      body: 'Recording is off for more than an hour. Turn recording back on to keep capturing context.',
      type: 'warning',
      size: 'compact',
      duration: 7000
    });
  };

  const scheduleNextReminder = () => {
    clearReminderTimer();
    reminderTimer = setTimeoutFn(() => {
      reminderTimer = null;
      showReminder();
      scheduleNextReminder();
    }, reminderDelayMs);
    if (reminderTimer && typeof reminderTimer.unref === 'function') {
      reminderTimer.unref();
    }
  };

  const startReminder = ({ force = false } = {}) => {
    if (reminderTimer && force !== true) {
      return;
    }
    scheduleNextReminder();
  };

  const stopReminder = () => {
    clearReminderTimer();
  };

  const isOffState = ({ enabled, manualPaused, state } = {}) =>
    enabled === false && manualPaused !== true && state === 'disabled';

  const syncWithCurrentState = (state = {}) => {
    if (isOffState(state)) {
      startReminder({ force: true });
      return;
    }
    stopReminder();
  };

  const handleStateTransition = (transition = {}) => {
    const reason = transition.reason || null;
    const toState = transition.toState || null;

    if (reason === 'user-toggle-off' && (toState === 'disabled' || toState === 'stopping')) {
      startReminder({ force: true });
      return;
    }

    if (reason === 'manual-pause' || reason === 'idle' || reason === 'lock' || reason === 'suspend' || reason === 'invalid-context') {
      stopReminder();
      return;
    }

    if (toState === 'armed' || toState === 'recording' || toState === 'idleGrace') {
      stopReminder();
    }
  };

  return {
    startReminder,
    stopReminder,
    syncWithCurrentState,
    handleStateTransition
  };
}

module.exports = {
  createRecordingOffReminder,
  DEFAULT_RECORDING_OFF_REMINDER_DELAY_MS
};
