const fs = require('node:fs');
const path = require('node:path');

const { JIMINY_BEHIND_THE_SCENES_DIR_NAME, STILLS_DIR_NAME } = require('../const');

function formatTimestamp(date) {
  return date.toISOString().replace(/[:.]/g, '-');
}

function getStillsRoot(contextFolderPath) {
  return path.join(contextFolderPath, JIMINY_BEHIND_THE_SCENES_DIR_NAME, STILLS_DIR_NAME);
}

function createSessionStore({
  contextFolderPath,
  intervalSeconds,
  scale,
  format,
  sourceDisplay,
  appVersion,
  logger = console
} = {}) {
  if (!contextFolderPath) {
    throw new Error('Context folder path is required to create a recording session.');
  }

  const sessionTimestamp = formatTimestamp(new Date());
  const sessionId = `session-${sessionTimestamp}`;
  const sessionDir = path.join(getStillsRoot(contextFolderPath), sessionId);
  fs.mkdirSync(sessionDir, { recursive: true });

  const manifest = {
    version: 1,
    sessionId,
    startedAt: new Date().toISOString(),
    endedAt: null,
    intervalSeconds,
    scale,
    format,
    sourceDisplay,
    appVersion,
    captures: [],
    stopReason: null
  };

  const manifestPath = path.join(sessionDir, 'manifest.json');

  function writeManifest() {
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
  }

  function nextCaptureFile(capturedAt = new Date()) {
    const timestamp = formatTimestamp(capturedAt);
    return {
      fileName: `${timestamp}.${format}`,
      capturedAt: capturedAt.toISOString()
    };
  }

  function addCapture({ fileName, capturedAt }) {
    manifest.captures.push({
      file: fileName,
      capturedAt
    });
    writeManifest();
  }

  function finalize(stopReason) {
    manifest.endedAt = new Date().toISOString();
    manifest.stopReason = stopReason || 'stop';
    writeManifest();
  }

  writeManifest();
  logger.log('Recording manifest created', { manifestPath });

  return {
    sessionDir,
    sessionId,
    manifestPath,
    manifest,
    nextCaptureFile,
    addCapture,
    finalize
  };
}

function recoverIncompleteSessions(contextFolderPath, logger = console) {
  const stillsRoot = getStillsRoot(contextFolderPath);
  if (!fs.existsSync(stillsRoot)) {
    return 0;
  }

  const entries = fs.readdirSync(stillsRoot, { withFileTypes: true });
  let updatedCount = 0;

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const manifestPath = path.join(stillsRoot, entry.name, 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
      continue;
    }

    try {
      const raw = fs.readFileSync(manifestPath, 'utf-8');
      const manifest = JSON.parse(raw);
      if (manifest && !manifest.endedAt) {
        manifest.endedAt = new Date().toISOString();
        manifest.stopReason = manifest.stopReason || 'crash';
        fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
        updatedCount += 1;
        logger.warn('Recovered incomplete recording session', { manifestPath });
      }
    } catch (error) {
      logger.error('Failed to recover recording manifest', { manifestPath, error });
    }
  }

  return updatedCount;
}

module.exports = {
  createSessionStore,
  recoverIncompleteSessions,
  getStillsRoot
};
