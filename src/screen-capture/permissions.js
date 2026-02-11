const { shell, systemPreferences } = require('electron');

const SCREEN_RECORDING_SETTINGS_URL = 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture';

function getScreenRecordingPermissionStatus() {
  if (process.platform !== 'darwin') {
    return 'unavailable';
  }
  try {
    return systemPreferences.getMediaAccessStatus('screen');
  } catch (error) {
    return 'unknown';
  }
}

function isScreenRecordingPermissionGranted() {
  return getScreenRecordingPermissionStatus() === 'granted';
}

async function openScreenRecordingSettings() {
  if (process.platform !== 'darwin') {
    return {
      ok: false,
      message: 'Screen Recording settings are only available on macOS.'
    };
  }

  try {
    await shell.openExternal(SCREEN_RECORDING_SETTINGS_URL);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      message: 'Failed to open Screen Recording settings.'
    };
  }
}

module.exports = {
  getScreenRecordingPermissionStatus,
  isScreenRecordingPermissionGranted,
  openScreenRecordingSettings
};
