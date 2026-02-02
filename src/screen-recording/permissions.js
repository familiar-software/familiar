const { systemPreferences } = require('electron');

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

module.exports = {
  getScreenRecordingPermissionStatus,
  isScreenRecordingPermissionGranted
};
