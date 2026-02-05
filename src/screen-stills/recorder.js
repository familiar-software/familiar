const { BrowserWindow, desktopCapturer, ipcMain, screen, app } = require('electron');
const { randomUUID } = require('node:crypto');
const path = require('node:path');

const { isScreenRecordingPermissionGranted } = require('../screen-recording/permissions');
const { createSessionStore, recoverIncompleteSessions } = require('./session-store');

const CAPTURE_CONFIG = Object.freeze({
  format: 'webp',
  scale: 0.5,
  intervalSeconds: 2
});

const START_TIMEOUT_MS = 10000;
const STOP_TIMEOUT_MS = 10000;

function ensureEven(value) {
  const rounded = Math.max(2, Math.round(value));
  return rounded % 2 === 0 ? rounded : rounded - 1;
}

function resolveIntervalMs(options, logger) {
  if (Number.isFinite(options.intervalSeconds) && options.intervalSeconds > 0) {
    return Math.round(options.intervalSeconds * 1000);
  }

  const isE2E = process.env.JIMINY_E2E === '1';
  const overrideValue = process.env.JIMINY_E2E_STILLS_INTERVAL_MS;
  if (isE2E && overrideValue) {
    const parsed = Number.parseInt(overrideValue, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      logger.log('Stills interval override enabled', { intervalMs: parsed });
      return parsed;
    }
    logger.warn('Ignoring invalid stills interval override', { value: overrideValue });
  }

  return CAPTURE_CONFIG.intervalSeconds * 1000;
}

function createRecorder(options = {}) {
  const logger = options.logger || console;
  const intervalMs = resolveIntervalMs(options, logger);

  let captureWindow = null;
  let windowReadyPromise = null;
  let rendererReady = false;
  const pendingRequests = new Map();
  let sessionStore = null;
  let captureTimer = null;
  let captureInProgress = false;
  let startInProgress = null;
  let stopInProgress = null;
  let sourceDetails = null;

  function ensureWindow() {
    if (captureWindow) {
      return;
    }
    rendererReady = false;

    captureWindow = new BrowserWindow({
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
        preload: path.join(__dirname, 'stills-preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        backgroundThrottling: false
      }
    });

    windowReadyPromise = new Promise(function (resolve) {
      captureWindow.webContents.once('did-finish-load', function () {
        logger.log('Screen stills renderer loaded', {
          url: captureWindow?.webContents?.getURL?.()
        });
        resolve();
      });
      captureWindow.webContents.once('did-fail-load', function (_event, code, description) {
        logger.error('Screen stills renderer failed to load', { code, description });
      });
    });

    captureWindow.loadFile(path.join(__dirname, 'stills.html'));

    captureWindow.webContents.on('render-process-gone', function (_event, details) {
      logger.error('Screen stills renderer process gone', details);
    });

    captureWindow.webContents.on('unresponsive', function () {
      logger.error('Screen stills renderer became unresponsive');
    });

    captureWindow.on('closed', function () {
      captureWindow = null;
      windowReadyPromise = null;
      rendererReady = false;
    });
  }

  async function waitForRendererReady() {
    const deadline = Date.now() + START_TIMEOUT_MS;
    while (!rendererReady) {
      if (Date.now() > deadline) {
        throw new Error('Stills renderer did not become ready.');
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
    return captureWindow;
  }

  function waitForStatus(requestId, timeoutMs, expectedStatuses = null) {
    return new Promise(function (resolve, reject) {
      const timeout = setTimeout(function () {
        pendingRequests.delete(requestId);
        reject(new Error('Timed out waiting for stills response.'));
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
      throw new Error('No screen sources available for stills.');
    }

    if (displays.length > 1) {
      logger.log('Multiple displays detected; capturing primary display', {
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
      captureHeight,
      sourceDisplay: {
        id: primaryDisplay.id,
        bounds: { ...primaryDisplay.bounds },
        scaleFactor: primaryDisplay.scaleFactor
      }
    };
  }

  function scheduleCaptureLoop() {
    if (captureTimer) {
      clearInterval(captureTimer);
    }
    captureTimer = setInterval(function () {
      captureNext().catch(function (error) {
        logger.error('Failed to capture still', error);
      });
    }, intervalMs);
    if (typeof captureTimer.unref === 'function') {
      captureTimer.unref();
    }
  }

  function clearCaptureLoop() {
    if (captureTimer) {
      clearInterval(captureTimer);
      captureTimer = null;
    }
  }

  async function captureNext() {
    if (!sessionStore || !sourceDetails) {
      return;
    }
    if (captureInProgress) {
      logger.warn('Skipping still capture: previous capture still in progress');
      return;
    }
    captureInProgress = true;
    const capturedAt = new Date();
    const nextCapture = sessionStore.nextCaptureFile(capturedAt);
    const filePath = path.join(sessionStore.sessionDir, nextCapture.fileName);

    const requestId = randomUUID();
    try {
      const window = await ensureWindowReady();
      window.webContents.send('screen-stills:capture', {
        requestId,
        filePath,
        format: CAPTURE_CONFIG.format
      });
      await waitForStatus(requestId, STOP_TIMEOUT_MS, ['captured']);
      if (sessionStore) {
        sessionStore.addCapture({
          fileName: nextCapture.fileName,
          capturedAt: nextCapture.capturedAt
        });
      }
    } finally {
      captureInProgress = false;
    }
  }

  async function start({ contextFolderPath } = {}) {
    if (sessionStore) {
      logger.log('Screen stills already active; start skipped');
      return { ok: true, alreadyRecording: true };
    }
    if (!contextFolderPath) {
      throw new Error('Context folder path missing for stills.');
    }
    if (!isScreenRecordingPermissionGranted()) {
      throw new Error('Screen Recording permission is not granted. Open System Settings -> Privacy & Security -> Screen Recording.');
    }

    sourceDetails = await resolveCaptureSource();
    recoverIncompleteSessions(contextFolderPath, logger);

    const appVersion = typeof app?.getVersion === 'function' ? app.getVersion() : null;
    sessionStore = createSessionStore({
      contextFolderPath,
      intervalSeconds: intervalMs / 1000,
      scale: CAPTURE_CONFIG.scale,
      format: CAPTURE_CONFIG.format,
      sourceDisplay: sourceDetails.sourceDisplay,
      appVersion,
      logger
    });

    logger.log('Screen stills session started', { sessionDir: sessionStore.sessionDir });

    const window = await ensureWindowReady();
    const requestId = randomUUID();
    window.webContents.send('screen-stills:start', {
      requestId,
      sourceId: sourceDetails.sourceId,
      captureWidth: sourceDetails.captureWidth,
      captureHeight: sourceDetails.captureHeight,
      format: CAPTURE_CONFIG.format
    });

    try {
      await waitForStatus(requestId, START_TIMEOUT_MS, ['started']);
    } catch (error) {
      sessionStore.finalize('start_failed');
      sessionStore = null;
      sourceDetails = null;
      throw error;
    }

    await captureNext();
    scheduleCaptureLoop();
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
      clearCaptureLoop();

      if (captureWindow) {
        const requestId = randomUUID();
        try {
          captureWindow.webContents.send('screen-stills:stop', { requestId });
          await waitForStatus(requestId, STOP_TIMEOUT_MS, ['stopped']);
        } catch (error) {
          logger.error('Failed to stop stills capture', error);
        }
      }

      if (sessionStore) {
        sessionStore.finalize(stopReason);
      }
      logger.log('Screen stills session stopped', { reason: stopReason });

      sessionStore = null;
      sourceDetails = null;
      return { ok: true };
    })();

    try {
      return await stopInProgress;
    } finally {
      stopInProgress = null;
    }
  }

  if (ipcMain && typeof ipcMain.on === 'function') {
    ipcMain.on('screen-stills:ready', function (event) {
      if (!captureWindow || event.sender !== captureWindow.webContents) {
        return;
      }
      rendererReady = true;
      logger.log('Screen stills renderer ready');
    });

    ipcMain.on('screen-stills:status', function (_event, payload) {
      const requestId = payload?.requestId;
      const pending = requestId ? pendingRequests.get(requestId) : null;
      if (!pending) {
        if (payload?.status === 'error') {
          logger.error('Screen stills error', payload);
        }
        return;
      }

      if (payload.status === 'error') {
        pending.reject(new Error(payload.message || 'Stills capture failed.'));
        return;
      }

      const expected = pending.expectedStatuses;
      if (!expected || expected.includes(payload.status)) {
        pending.resolve(payload);
      }
    });
  } else {
    logger.warn('IPC unavailable; screen stills status listener not registered');
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
