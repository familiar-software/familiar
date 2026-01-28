const { app, dialog } = require('electron');
const { loadSettings, saveSettings } = require('../settings');

const STARTUP_CHECK_DELAY_MS = 10_000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

let initialized = false;
let enabled = false;
let checking = false;
let promptVisible = false;
let downloadPromptVisible = false;
let updater = null;
let updaterLogger = null;
let dailyTimeoutId = null;
let dailyIntervalId = null;

const shouldEnableAutoUpdates = ({ isE2E, isCI }) => {
  if (isE2E || isCI) {
    return false;
  }

  if (process.platform !== 'darwin') {
    return false;
  }

  return Boolean(app.isPackaged);
};

const getAutoUpdater = () => {
  if (!updater) {
    updater = require('electron-updater').autoUpdater;
  }

  return updater;
};

const getUpdaterLogger = () => {
  if (!updaterLogger) {
    updaterLogger = require('electron-log');
  }

  return updaterLogger;
};

const configureAutoUpdater = () => {
  const autoUpdater = getAutoUpdater();
  autoUpdater.logger = getUpdaterLogger();
  if (autoUpdater.logger && autoUpdater.logger.transports && autoUpdater.logger.transports.file) {
    autoUpdater.logger.transports.file.level = 'info';
  }

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
};

const getLastUpdateCheckAt = () => {
  const settings = loadSettings();
  if (!settings) {
    return null;
  }

  const value = settings.updateLastCheckedAt;
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }

  return null;
};

const recordUpdateCheckAt = (timestamp) => {
  try {
    const nextValue = typeof timestamp === 'number' ? timestamp : Date.now();
    saveSettings({ updateLastCheckedAt: nextValue });
  } catch (error) {
    console.error('Failed to persist update check timestamp', error);
  }
};

const computeNextCheckDelay = ({ now, lastCheckedAt, delayMs }) => {
  const baseDelay = typeof delayMs === 'number' ? delayMs : STARTUP_CHECK_DELAY_MS;
  if (!lastCheckedAt) {
    return baseDelay;
  }

  const elapsed = now - lastCheckedAt;
  if (elapsed >= ONE_DAY_MS) {
    return baseDelay;
  }

  return Math.max(ONE_DAY_MS - elapsed, baseDelay);
};

const promptForRestart = async (info) => {
  if (promptVisible) {
    console.log('Update prompt already visible; skipping duplicate prompt');
    return;
  }

  promptVisible = true;

  try {
    const version = info && info.version ? info.version : 'latest';
    const result = await dialog.showMessageBox({
      type: 'info',
      buttons: ['Restart now', 'Later'],
      defaultId: 0,
      cancelId: 1,
      message: 'Update ready to install',
      detail: `Version ${version} has been downloaded. Restart Jiminy to apply the update.`,
    });

    if (result.response === 0) {
      console.log('User accepted update restart', { version });
      getAutoUpdater().quitAndInstall();
    } else {
      console.log('User deferred update restart', { version });
    }
  } catch (error) {
    console.error('Failed to show update prompt', error);
  } finally {
    promptVisible = false;
  }
};

const promptForDownload = async (info) => {
  if (downloadPromptVisible) {
    console.log('Update download prompt already visible; skipping duplicate prompt');
    return;
  }

  downloadPromptVisible = true;

  try {
    const version = info && info.version ? info.version : 'latest';
    const result = await dialog.showMessageBox({
      type: 'info',
      buttons: ['Download now', 'Later'],
      defaultId: 0,
      cancelId: 1,
      message: 'Update available',
      detail: `Version ${version} is available. Download now?`,
    });

    if (result.response === 0) {
      console.log('User accepted update download', { version });
      await getAutoUpdater().downloadUpdate();
    } else {
      console.log('User deferred update download', { version });
    }
  } catch (error) {
    console.error('Failed to prompt for update download', error);
  } finally {
    downloadPromptVisible = false;
  }
};

const registerAutoUpdaterEvents = () => {
  const autoUpdater = getAutoUpdater();
  autoUpdater.on('checking-for-update', () => {
    console.log('Checking for updates');
  });

  autoUpdater.on('update-available', (info) => {
    console.log('Update available', {
      version: info && info.version ? info.version : 'unknown',
      releaseName: info && info.releaseName ? info.releaseName : undefined,
    });
    void promptForDownload(info);
  });

  autoUpdater.on('update-not-available', (info) => {
    console.log('Update not available', {
      version: info && info.version ? info.version : 'unknown',
    });
  });

  autoUpdater.on('download-progress', (progress) => {
    console.log('Update download progress', {
      percent: typeof progress.percent === 'number' ? progress.percent : undefined,
      transferred: progress.transferred,
      total: progress.total,
      bytesPerSecond: progress.bytesPerSecond,
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log('Update downloaded', {
      version: info && info.version ? info.version : 'unknown',
    });
    void promptForRestart(info);
  });

  autoUpdater.on('error', (error) => {
    console.error('Auto-updater error', error);
  });
};

const initializeAutoUpdater = ({ isE2E = false, isCI = false } = {}) => {
  if (initialized) {
    return { enabled };
  }

  initialized = true;
  enabled = shouldEnableAutoUpdates({ isE2E, isCI });

  if (!enabled) {
    console.log('Auto-updates disabled', {
      isPackaged: Boolean(app.isPackaged),
      isE2E,
      isCI,
      platform: process.platform,
    });
    return { enabled };
  }

  configureAutoUpdater();
  registerAutoUpdaterEvents();
  console.log('Auto-updates enabled');

  return { enabled };
};

const checkForUpdates = async ({ reason = 'manual' } = {}) => {
  if (!enabled) {
    console.log('Update check skipped: auto-updates disabled', { reason });
    return { ok: false, reason: 'disabled' };
  }

  if (checking) {
    console.log('Update check skipped: already checking', { reason });
    return { ok: false, reason: 'checking' };
  }

  checking = true;
  recordUpdateCheckAt(Date.now());
  console.log('Starting update check', { reason });
  let currentVersion = null;
  try {
    currentVersion = app.getVersion();
  } catch (error) {
    console.error('Failed to read current app version', error);
  }

  try {
    const result = await getAutoUpdater().checkForUpdates();
    return {
      ok: true,
      updateInfo: result && result.updateInfo ? result.updateInfo : null,
      currentVersion,
    };
  } catch (error) {
    console.error('Update check failed', error);
    return {
      ok: false,
      reason: 'error',
      message: error && error.message ? error.message : 'unknown error',
      currentVersion,
    };
  } finally {
    checking = false;
  }
};

const scheduleDailyUpdateCheck = ({ delayMs = STARTUP_CHECK_DELAY_MS } = {}) => {
  if (!enabled) {
    return { scheduled: false };
  }

  if (dailyTimeoutId || dailyIntervalId) {
    console.log('Daily update checks already scheduled');
    return { scheduled: true };
  }

  const lastCheckedAt = getLastUpdateCheckAt();
  const now = Date.now();
  const nextDelay = computeNextCheckDelay({ now, lastCheckedAt, delayMs });

  console.log('Scheduling daily update check', { delayMs: nextDelay });
  dailyTimeoutId = setTimeout(() => {
    dailyTimeoutId = null;
    void checkForUpdates({ reason: 'daily' });
    dailyIntervalId = setInterval(() => {
      void checkForUpdates({ reason: 'daily' });
    }, ONE_DAY_MS);
  }, nextDelay);

  return { scheduled: true, delayMs: nextDelay };
};

module.exports = {
  checkForUpdates,
  initializeAutoUpdater,
  scheduleDailyUpdateCheck,
};
