const fs = require('node:fs');
const path = require('node:path');

const { FAMILIAR_BEHIND_THE_SCENES_DIR_NAME, STILLS_DIR_NAME } = require('../const');
const { formatLocalTimestamp } = require('../utils/timestamp-utils');

function formatTimestamp(date) {
  return formatLocalTimestamp(date);
}

function getStillsRoot(contextFolderPath) {
  return path.join(contextFolderPath, FAMILIAR_BEHIND_THE_SCENES_DIR_NAME, STILLS_DIR_NAME);
}

function createSessionStore({ contextFolderPath, format } = {}) {
  if (!contextFolderPath) {
    throw new Error('Context folder path is required to create a recording session.');
  }

  const sessionTimestamp = formatTimestamp(new Date());
  const sessionId = `session-${sessionTimestamp}`;
  const sessionDir = path.join(getStillsRoot(contextFolderPath), sessionId);
  fs.mkdirSync(sessionDir, { recursive: true });

  function nextCaptureFile(capturedAt = new Date()) {
    const timestamp = formatTimestamp(capturedAt);
    return {
      fileName: `${timestamp}.${format}`,
      capturedAt: capturedAt.toISOString()
    };
  }

  return {
    sessionDir,
    sessionId,
    nextCaptureFile
  };
}

module.exports = {
  createSessionStore
};
