const { shell, systemPreferences } = require('electron');

const SCREEN_RECORDING_SETTINGS_URL = 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture';

function getE2EScreenRecordingPermissionStatus() {
  if (process.env.FAMILIAR_E2E !== '1') {
    return null;
  }

  const override = process.env.FAMILIAR_E2E_SCREEN_RECORDING_PERMISSION;
  if (typeof override === 'string' && override.trim()) {
    const normalized = override.trim().toLowerCase();
    if (normalized === 'granted' || normalized === 'denied' || normalized === 'unknown' || normalized === 'unavailable') {
      return normalized;
    }
    if (normalized === 'true' || normalized === '1' || normalized === 'on') {
      return 'granted';
    }
    if (normalized === 'false' || normalized === '0' || normalized === 'off') {
      return 'denied';
    }
  }

  if (process.platform !== 'darwin') {
    return 'unavailable';
  }

  return 'granted';
}

function getScreenRecordingPermissionStatus() {
  const e2ePermissionStatus = getE2EScreenRecordingPermissionStatus();
  if (e2ePermissionStatus) {
    return e2ePermissionStatus;
  }

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

async function requestScreenRecordingPermission() {
  const e2ePermissionStatus = getE2EScreenRecordingPermissionStatus();
  if (e2ePermissionStatus) {
    return {
      ok: e2ePermissionStatus !== 'unavailable',
      permissionStatus: e2ePermissionStatus,
      granted: e2ePermissionStatus === 'granted',
      message: e2ePermissionStatus === 'unavailable' ? 'Screen Recording permissions are not applicable on this platform.' : null
    };
  }

  if (process.platform !== 'darwin') {
    return {
      ok: false,
      permissionStatus: 'unavailable',
      granted: false,
      message: 'Screen Recording permissions are only available on macOS.'
    };
  }

  if (typeof systemPreferences.askForMediaAccess !== 'function') {
    const permissionStatus = getScreenRecordingPermissionStatus();
    return {
      ok: true,
      permissionStatus,
      granted: permissionStatus === 'granted'
    };
  }

  try {
    const requested = await systemPreferences.askForMediaAccess('screen');
    const granted = requested === true;
    const permissionStatus = granted ? 'granted' : 'denied';
    return {
      ok: true,
      permissionStatus,
      granted
    };
  } catch (error) {
    return {
      ok: false,
      permissionStatus: 'unknown',
      granted: false,
      message: 'Failed to request Screen Recording permissions.'
    };
  }
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
  requestScreenRecordingPermission,
  openScreenRecordingSettings
};
