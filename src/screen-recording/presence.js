const { powerMonitor } = require('electron');
const { EventEmitter } = require('node:events');

const DEFAULT_POLL_INTERVAL_MS = 1000;

function createPresenceMonitor(options = {}) {
  const idleThresholdSeconds =
    typeof options.idleThresholdSeconds === 'number' ? options.idleThresholdSeconds : 60;
  const pollIntervalMs =
    typeof options.pollIntervalMs === 'number' ? options.pollIntervalMs : DEFAULT_POLL_INTERVAL_MS;
  const logger = options.logger || console;
  const emitter = new EventEmitter();
  let timer = null;
  let lastState = null;

  function emitState(nextState, payload = {}) {
    if (lastState === nextState) {
      return;
    }
    lastState = nextState;
    emitter.emit(nextState, payload);
  }

  function evaluateIdle(source) {
    let idleSeconds = 0;
    try {
      idleSeconds = powerMonitor.getSystemIdleTime();
    } catch (error) {
      logger.error('Failed to read system idle time', error);
      return;
    }
    const nextState = idleSeconds >= idleThresholdSeconds ? 'idle' : 'active';
    emitState(nextState, { idleSeconds, source });
  }

  function handleLock() {
    emitter.emit('lock');
  }

  function handleUnlock() {
    emitter.emit('unlock');
    evaluateIdle('unlock');
  }

  function handleSuspend() {
    emitter.emit('suspend');
  }

  function handleResume() {
    emitter.emit('resume');
    evaluateIdle('resume');
  }

  function handleActive() {
    emitState('active', { source: 'user-did-become-active' });
  }

  function handleResign() {
    evaluateIdle('user-did-resign-active');
  }

  function start() {
    if (timer) {
      return;
    }
    evaluateIdle('start');
    timer = setInterval(function () {
      evaluateIdle('poll');
    }, pollIntervalMs);
    if (typeof timer.unref === 'function') {
      timer.unref();
    }
    powerMonitor.on('lock-screen', handleLock);
    powerMonitor.on('unlock-screen', handleUnlock);
    powerMonitor.on('suspend', handleSuspend);
    powerMonitor.on('resume', handleResume);
    powerMonitor.on('user-did-become-active', handleActive);
    powerMonitor.on('user-did-resign-active', handleResign);
    logger.log('Presence monitor started', { idleThresholdSeconds, pollIntervalMs });
  }

  function stop() {
    if (timer) {
      clearInterval(timer);
      timer = null;
    }
    powerMonitor.removeListener('lock-screen', handleLock);
    powerMonitor.removeListener('unlock-screen', handleUnlock);
    powerMonitor.removeListener('suspend', handleSuspend);
    powerMonitor.removeListener('resume', handleResume);
    powerMonitor.removeListener('user-did-become-active', handleActive);
    powerMonitor.removeListener('user-did-resign-active', handleResign);
    logger.log('Presence monitor stopped');
  }

  function getState() {
    return {
      state: lastState,
      idleSeconds: powerMonitor.getSystemIdleTime()
    };
  }

  function on(eventName, handler) {
    return emitter.on(eventName, handler);
  }

  function off(eventName, handler) {
    return emitter.off(eventName, handler);
  }

  return {
    start,
    stop,
    on,
    off,
    getState
  };
}

module.exports = {
  createPresenceMonitor
};
