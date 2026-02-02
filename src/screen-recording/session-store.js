const fs = require('node:fs');
const path = require('node:path');

const { JIMINY_BEHIND_THE_SCENES_DIR_NAME, RECORDINGS_DIR_NAME } = require('../const');

function formatTimestamp(date) {
  return date.toISOString().replace(/[:.]/g, '-');
}

function padSegmentIndex(index) {
  return String(index).padStart(4, '0');
}

function getRecordingsRoot(contextFolderPath) {
  return path.join(contextFolderPath, JIMINY_BEHIND_THE_SCENES_DIR_NAME, RECORDINGS_DIR_NAME);
}

function createSessionStore({ contextFolderPath, captureConfig, segmentLengthMs, logger = console } = {}) {
  if (!contextFolderPath) {
    throw new Error('Context folder path is required to create a recording session.');
  }
  const sessionTimestamp = formatTimestamp(new Date());
  const sessionDir = path.join(getRecordingsRoot(contextFolderPath), `session-${sessionTimestamp}`);
  fs.mkdirSync(sessionDir, { recursive: true });

  const manifest = {
    version: 1,
    startedAt: new Date().toISOString(),
    endedAt: null,
    stopReason: null,
    settings: { ...captureConfig, segmentLengthMs },
    segments: []
  };

  const manifestPath = path.join(sessionDir, 'manifest.json');
  let segmentIndex = 0;

  function writeManifest() {
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
  }

  function nextSegmentFile() {
    segmentIndex += 1;
    return {
      index: segmentIndex,
      fileName: `segment-${padSegmentIndex(segmentIndex)}.${captureConfig.container}`
    };
  }

  function addSegment({ index, fileName, startedAt, endedAt, durationMs }) {
    manifest.segments.push({
      index,
      file: fileName,
      startedAt,
      endedAt,
      durationMs
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
    manifestPath,
    manifest,
    nextSegmentFile,
    addSegment,
    finalize
  };
}

function recoverIncompleteSessions(contextFolderPath, logger = console) {
  const recordingsRoot = getRecordingsRoot(contextFolderPath);
  if (!fs.existsSync(recordingsRoot)) {
    return 0;
  }

  const entries = fs.readdirSync(recordingsRoot, { withFileTypes: true });
  let updatedCount = 0;

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const manifestPath = path.join(recordingsRoot, entry.name, 'manifest.json');
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
  recoverIncompleteSessions
};
