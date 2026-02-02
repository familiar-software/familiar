const { BrowserWindow, desktopCapturer, ipcMain, screen } = require('electron');
const { randomUUID } = require('node:crypto');
const path = require('node:path');

const { isScreenRecordingPermissionGranted } = require('./permissions');
const { createSessionStore, recoverIncompleteSessions } = require('./session-store');

const CAPTURE_CONFIG = Object.freeze({
  container: 'mp4',
  codec: 'h264',
  fps: 2,
  scale: 0.5,
  audio: false
});

const DEFAULT_SEGMENT_LENGTH_MS = 0.5 * 60 * 1000;
const START_TIMEOUT_MS = 10000;
const STOP_TIMEOUT_MS = 10000;

function ensureEven(value) {
  const rounded = Math.max(2, Math.round(value));
  return rounded % 2 === 0 ? rounded : rounded - 1;
}

function createRecorder(options = {}) {
  const logger = options.logger || console;
  const segmentLengthMs =
    typeof options.segmentLengthMs === 'number' ? options.segmentLengthMs : DEFAULT_SEGMENT_LENGTH_MS;

  let recordingWindow = null;
  let windowReadyPromise = null;
  let rendererReady = false;
  const pendingRequests = new Map();
  let sessionStore = null;
  let currentSegment = null;
  let segmentTimer = null;
  let stopInProgress = null;

  function ensureWindow() {
    if (recordingWindow) {
      return;
    }
    rendererReady = false;

    recordingWindow = new BrowserWindow({
      width: 400,
      height: 300,
      show: false,
      transparent: true,
      frame: false,
      resizable: false,
      movable: false,
      fullscreenable: false,
      focusable: false,
      backgroundColor: '#00000000',
      webPreferences: {
        preload: path.join(__dirname, 'recording-preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        backgroundThrottling: false
      }
    });

    windowReadyPromise = new Promise(function (resolve) {
      recordingWindow.webContents.once('did-finish-load', function () {
        logger.log('Screen recording renderer loaded', {
          url: recordingWindow?.webContents?.getURL?.()
        });
        resolve();
      });
      recordingWindow.webContents.once('did-fail-load', function (_event, code, description) {
        logger.error('Screen recording renderer failed to load', { code, description });
      });
    });

    recordingWindow.loadFile(path.join(__dirname, 'recording.html'));

    recordingWindow.webContents.on('render-process-gone', function (_event, details) {
      logger.error('Screen recording renderer process gone', details);
    });

    recordingWindow.webContents.on('unresponsive', function () {
      logger.error('Screen recording renderer became unresponsive');
    });

    recordingWindow.on('closed', function () {
      recordingWindow = null;
      windowReadyPromise = null;
      rendererReady = false;
    });
  }

  async function waitForRendererReady() {
    const deadline = Date.now() + START_TIMEOUT_MS;
    while (!rendererReady) {
      if (Date.now() > deadline) {
        throw new Error('Recording renderer did not become ready.');
      }
      await new Promise(function (resolve) {
        setTimeout(resolve, 50);
      });
    }
  }

  async function ensureWindowReady() {
    ensureWindow();
    if (windowReadyPromise) {
      await windowReadyPromise;
    }
    await waitForRendererReady();
    return recordingWindow;
  }

  function waitForStatus(requestId, timeoutMs, expectedStatuses = null) {
    return new Promise(function (resolve, reject) {
      const timeout = setTimeout(function () {
        pendingRequests.delete(requestId);
        reject(new Error('Timed out waiting for recording response.'));
      }, timeoutMs);

      const pending = {
        expectedStatuses: Array.isArray(expectedStatuses) ? expectedStatuses : null,
        resolve: function (payload) {
          clearTimeout(timeout);
          pendingRequests.delete(requestId);
          resolve(payload);
        },
        reject: function (error) {
          clearTimeout(timeout);
          pendingRequests.delete(requestId);
          reject(error);
        }
      };

      pendingRequests.set(requestId, pending);
    });
  }

  async function resolveCaptureSource() {
    const displays = screen.getAllDisplays();
    const primaryDisplay = screen.getPrimaryDisplay();
    const sources = await desktopCapturer.getSources({ types: ['screen'] });
    if (!Array.isArray(sources) || sources.length === 0) {
      throw new Error('No screen sources available for recording.');
    }

    if (displays.length > 1) {
      logger.log('Multiple displays detected; recording primary display', {
        displayCount: displays.length,
        primaryDisplayId: primaryDisplay.id
      });
    }

    const source = sources.find(function (candidate) {
      return String(candidate.display_id) === String(primaryDisplay.id);
    }) || sources[0];

    const fullWidth = Math.max(1, Math.round(primaryDisplay.bounds.width * primaryDisplay.scaleFactor));
    const fullHeight = Math.max(1, Math.round(primaryDisplay.bounds.height * primaryDisplay.scaleFactor));

    const captureWidth = ensureEven(fullWidth * CAPTURE_CONFIG.scale);
    const captureHeight = ensureEven(fullHeight * CAPTURE_CONFIG.scale);

    return {
      sourceId: source.id,
      captureWidth,
      captureHeight
    };
  }

  function scheduleSegmentRoll() {
    if (segmentTimer) {
      clearTimeout(segmentTimer);
    }
    segmentTimer = setTimeout(function () {
      rollSegment().catch(function (error) {
        logger.error('Failed to roll recording segment', error);
      });
    }, segmentLengthMs);
    if (typeof segmentTimer.unref === 'function') {
      segmentTimer.unref();
    }
  }

  function clearSegmentTimer() {
    if (segmentTimer) {
      clearTimeout(segmentTimer);
      segmentTimer = null;
    }
  }

  async function startSegment() {
    if (!sessionStore) {
      return;
    }

    const window = await ensureWindowReady();
    const { sourceId, captureWidth, captureHeight } = await resolveCaptureSource();

    const nextSegment = sessionStore.nextSegmentFile();
    const filePath = path.join(sessionStore.sessionDir, nextSegment.fileName);

    currentSegment = {
      index: nextSegment.index,
      fileName: nextSegment.fileName,
      filePath,
      startedAt: new Date().toISOString()
    };

    const requestId = randomUUID();
    const payload = {
      requestId,
      sourceId,
      captureWidth,
      captureHeight,
      fps: CAPTURE_CONFIG.fps,
      filePath
    };

    try {
      window.webContents.send('screen-recording:start', payload);
      await waitForStatus(requestId, START_TIMEOUT_MS, ['started']);
      logger.log('Screen recording segment started', {
        index: currentSegment.index,
        fileName: currentSegment.fileName
      });
    } catch (error) {
      currentSegment = null;
      throw error;
    }
  }

  async function stopSegment(reason) {
    if (!sessionStore || !currentSegment) {
      return;
    }

    const window = await ensureWindowReady();
    const requestId = randomUUID();
    try {
      window.webContents.send('screen-recording:stop', { requestId });
      await waitForStatus(requestId, STOP_TIMEOUT_MS, ['stopped']);
    } catch (error) {
      logger.error('Failed to stop recording segment', error);
      currentSegment = null;
      return;
    }

    const endedAt = new Date().toISOString();
    const startedAt = currentSegment.startedAt;
    const durationMs = Date.parse(endedAt) - Date.parse(startedAt);

    sessionStore.addSegment({
      index: currentSegment.index,
      fileName: currentSegment.fileName,
      startedAt,
      endedAt,
      durationMs
    });

    currentSegment = null;
    logger.log('Screen recording segment stopped', { reason, durationMs });
  }

  async function rollSegment() {
    if (!sessionStore) {
      return;
    }
    await stopSegment('segment-roll');
    await startSegment();
    scheduleSegmentRoll();
  }

  async function start({ contextFolderPath } = {}) {
    if (sessionStore) {
      logger.log('Screen recording already active; start skipped');
      return { ok: true, alreadyRecording: true };
    }
    if (!contextFolderPath) {
      throw new Error('Context folder path missing for recording.');
    }
    if (!isScreenRecordingPermissionGranted()) {
      throw new Error('Screen Recording permission is not granted. Open System Settings → Privacy & Security → Screen Recording.');
    }

    recoverIncompleteSessions(contextFolderPath, logger);
    sessionStore = createSessionStore({
      contextFolderPath,
      captureConfig: CAPTURE_CONFIG,
      segmentLengthMs,
      logger
    });
    logger.log('Screen recording session started', { sessionDir: sessionStore.sessionDir });
    try {
      await startSegment();
    } catch (error) {
      sessionStore.finalize('start_failed');
      sessionStore = null;
      throw error;
    }
    scheduleSegmentRoll();
    return { ok: true };
  }

  async function stop({ reason } = {}) {
    if (stopInProgress) {
      return stopInProgress;
    }

    stopInProgress = (async function () {
      if (!sessionStore) {
        return { ok: true, alreadyStopped: true };
      }

      const stopReason = reason || 'stop';
      clearSegmentTimer();
      await stopSegment(stopReason);
      if (sessionStore) {
        sessionStore.finalize(stopReason);
      }
      logger.log('Screen recording session stopped', { reason });

      sessionStore = null;
      return { ok: true };
    })();

    try {
      return await stopInProgress;
    } finally {
      stopInProgress = null;
    }
  }

  if (ipcMain && typeof ipcMain.on === 'function') {
    ipcMain.on('screen-recording:ready', function (event) {
      if (!recordingWindow || event.sender !== recordingWindow.webContents) {
        return;
      }
      rendererReady = true;
      logger.log('Screen recording renderer ready');
    });
    ipcMain.on('screen-recording:status', function (_event, payload) {
      const requestId = payload?.requestId;
      const pending = requestId ? pendingRequests.get(requestId) : null;
      if (!pending) {
        if (payload?.status === 'error') {
          logger.error('Screen recording error', payload);
        }
        return;
      }

      if (payload.status === 'error') {
        pending.reject(new Error(payload.message || 'Recording failed.'));
        return;
      }

      const expected = pending.expectedStatuses;
      if (!expected || expected.includes(payload.status)) {
        pending.resolve(payload);
      }
    });
  } else {
    logger.warn('IPC unavailable; screen recording status listener not registered');
  }

  function recover(contextFolderPath) {
    return recoverIncompleteSessions(contextFolderPath, logger);
  }

  return {
    start,
    stop,
    recover
  };
}

module.exports = {
  CAPTURE_CONFIG,
  createRecorder
};
