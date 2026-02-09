const { createClipboardMirror, DEFAULT_POLL_INTERVAL_MS } = require('./mirror')
const {
  buildTimestamp,
  buildClipboardMirrorFilename,
  getClipboardMirrorDirectory,
  saveClipboardMirrorToDirectory
} = require('./storage')

module.exports = {
  DEFAULT_POLL_INTERVAL_MS,
  createClipboardMirror,
  buildTimestamp,
  buildClipboardMirrorFilename,
  getClipboardMirrorDirectory,
  saveClipboardMirrorToDirectory
}
