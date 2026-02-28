const { powerMonitor } = require('electron');
const { execFileSync } = require('node:child_process');
const { EventEmitter } = require('node:events');

const DEFAULT_POLL_INTERVAL_MS = 300000;

function parseLowPowerModeFromPmsetOutput(output) {
  if (typeof output !== 'string' || output.trim() === '') {
    return false;
  }

  const match = output.match(/^\s*lowpowermode\s+([01])\s*$/im);
  if (!match) {
    return false;
  }

  return match[1] === '1';
}

function readLowPowerModeEnabled({ execFileSyncFn, logger } = {}) {
  try {
    const stdout = execFileSyncFn('pmset', ['-g'], { encoding: 'utf8' });
    return parseLowPowerModeFromPmsetOutput(stdout);
  } catch (error) {
    logger.warn('Failed to read Low Power Mode status from pmset', {
      error: error?.message || String(error)
    });
    return false;
  }
}

function createLowPowerModeMonitor(options = {}) {
  const logger = options.logger || console;
  const platform = options.platform || process.platform;
  const pollIntervalMs =
    Number.isFinite(options.pollIntervalMs) && options.pollIntervalMs > 0
      ? Math.floor(options.pollIntervalMs)
      : DEFAULT_POLL_INTERVAL_MS;
  const powerMonitorApi = options.powerMonitor || powerMonitor;
  const execFileSyncFn = options.execFileSync || execFileSync;
  const emitter = new EventEmitter();
  const isDarwin = platform === 'darwin';

  let timer = null;
  let started = false;
  let lowPowerModeEnabled = false;

  function refreshState({ source } = {}) {
    if (!isDarwin) {
      return;
    }

    const nextValue = readLowPowerModeEnabled({ execFileSyncFn, logger });
    if (nextValue === lowPowerModeEnabled) {
      return;
    }

    lowPowerModeEnabled = nextValue;
    logger.log('Low Power Mode state changed', { enabled: lowPowerModeEnabled, source });
    emitter.emit('change', { enabled: lowPowerModeEnabled, source });
  }

  function start() {
    if (started) {
      return;
    }
    started = true;

    if (!isDarwin) {
      logger.log('Low Power Mode monitor disabled: unsupported platform', { platform });
      return;
    }

    refreshState({ source: 'start' });

    timer = setInterval(function () {
      refreshState({ source: 'poll' });
    }, pollIntervalMs);
    if (typeof timer.unref === 'function') {
      timer.unref();
    }

    if (powerMonitorApi && typeof powerMonitorApi.on === 'function') {
      powerMonitorApi.on('resume', handleResume);
      powerMonitorApi.on('on-ac', handlePowerSourceChange);
      powerMonitorApi.on('on-battery', handlePowerSourceChange);
      powerMonitorApi.on('speed-limit-change', handleSpeedLimitChange);
    }

    logger.log('Low Power Mode monitor started', { pollIntervalMs });
  }

  function stop() {
    if (!started) {
      return;
    }
    started = false;

    if (timer) {
      clearInterval(timer);
      timer = null;
    }

    if (powerMonitorApi && typeof powerMonitorApi.removeListener === 'function') {
      powerMonitorApi.removeListener('resume', handleResume);
      powerMonitorApi.removeListener('on-ac', handlePowerSourceChange);
      powerMonitorApi.removeListener('on-battery', handlePowerSourceChange);
      powerMonitorApi.removeListener('speed-limit-change', handleSpeedLimitChange);
    }

    logger.log('Low Power Mode monitor stopped');
  }

  function handleResume() {
    refreshState({ source: 'resume' });
  }

  function handlePowerSourceChange() {
    refreshState({ source: 'power-source-change' });
  }

  function handleSpeedLimitChange() {
    refreshState({ source: 'speed-limit-change' });
  }

  function on(eventName, handler) {
    emitter.on(eventName, handler);
  }

  function off(eventName, handler) {
    emitter.off(eventName, handler);
  }

  function isLowPowerModeEnabled() {
    return lowPowerModeEnabled;
  }

  return {
    start,
    stop,
    on,
    off,
    isLowPowerModeEnabled
  };
}

module.exports = {
  createLowPowerModeMonitor,
  parseLowPowerModeFromPmsetOutput
};
