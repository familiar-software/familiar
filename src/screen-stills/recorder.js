const { BrowserWindow, desktopCapturer, ipcMain, screen, app } = require('electron');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const { isScreenRecordingPermissionGranted } = require('../screen-capture/permissions');
const { createSessionStore, recoverIncompleteSessions } = require('./session-store');
const { createStillsQueue } = require('./stills-queue');

const CAPTURE_CONFIG = Object.freeze({
  format: 'webp',
  scale: 0.5,
  intervalSeconds: 4
});

const START_TIMEOUT_MS = 10000;
const STOP_TIMEOUT_MS = 10000;
const IS_E2E = process.env.FAMILIAR_E2E === '1';
const IS_E2E_FAKE_CAPTURE = IS_E2E && process.env.FAMILIAR_E2E_FAKE_SCREEN_CAPTURE !== '0';

function createFakeCaptureFile(filePath) {
  fs.writeFileSync(filePath, Buffer.from('familiar-e2e-screen-capture-placeholder', 'utf-8'));
}

function ensureEven(value) {
  const rounded = Math.max(2, Math.round(value));
  return rounded % 2 === 0 ? rounded : rounded - 1;
}

function resolveIntervalMs(options, logger) {
  if (Number.isFinite(options.intervalSeconds) && options.intervalSeconds > 0) {
    return Math.round(options.intervalSeconds * 1000);
  }

  const isE2E = process.env.FAMILIAR_E2E === '1';
  const overrideValue = process.env.FAMILIAR_E2E_STILLS_INTERVAL_MS;
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
  let queueStore = null;

  function isCaptureAlreadyInProgressError(error) {
    const message = error?.message || '';
    return typeof message === 'string' && message.includes('Capture already in progress.');
  }

  function rejectPendingRequests(error) {
    for (const pending of pendingRequests.values()) {
      try {
        pending.reject(error);
      } catch (_error) {
        // Ignore secondary failures; we're best-effort draining pending waiters.
      }
    }
    pendingRequests.clear();
  }

  function destroyCaptureWindow(reason) {
    if (!captureWindow) {
      return;
    }

    logger.warn('Destroying capture window', { reason });

    try {
      if (!captureWindow.isDestroyed()) {
        captureWindow.destroy();
      }
    } catch (error) {
      logger.error('Failed to destroy capture window', { error });
    } finally {
      captureWindow = null;
      windowReadyPromise = null;
      rendererReady = false;
      rejectPendingRequests(new Error('Recording renderer reset.'));
    }
  }

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
        logger.log('Recording renderer loaded', {
          url: captureWindow?.webContents?.getURL?.()
        });
        resolve();
      });
      captureWindow.webContents.once('did-fail-load', function (_event, code, description) {
        logger.error('Recording renderer failed to load', { code, description });
      });
    });

    captureWindow.loadFile(path.join(__dirname, 'stills.html'));

    captureWindow.webContents.on('render-process-gone', function (_event, details) {
      logger.error('Recording renderer process gone', details);
    });

    captureWindow.webContents.on('unresponsive', function () {
      logger.error('Recording renderer became unresponsive');
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
    return captureWindow;
  }

  async function tryStopRendererCapture({ timeoutMs } = {}) {
    if (!captureWindow) {
      return { ok: true, alreadyStopped: true, reason: 'no-window' };
    }
    if (typeof captureWindow.isDestroyed === 'function' && captureWindow.isDestroyed()) {
      return { ok: true, alreadyStopped: true, reason: 'window-destroyed' };
    }

    const requestId = randomUUID();
    try {
      captureWindow.webContents.send('screen-stills:stop', { requestId });
      await waitForStatus(requestId, timeoutMs || STOP_TIMEOUT_MS, ['stopped']);
      return { ok: true, stopped: true };
    } catch (error) {
      if (typeof error?.message === 'string' && error.message.includes('No active capture.')) {
        return { ok: true, alreadyStopped: true };
      }
      return { ok: false, error };
    }
  }

  async function forceResetRendererCapture(reason) {
    clearCaptureLoop();
    captureInProgress = false;

    const stopResult = await tryStopRendererCapture({ timeoutMs: STOP_TIMEOUT_MS });
    if (stopResult.ok) {
      logger.log('Renderer capture reset via stop', { reason });
      return { ok: true, strategy: 'stop' };
    }

    logger.warn('Renderer capture stop failed; recreating capture window', {
      reason,
      error: stopResult.error?.message || String(stopResult.error || 'unknown')
    });
    destroyCaptureWindow(`force-reset:${reason}`);
    ensureWindow();
    return { ok: true, strategy: 'recreate-window' };
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

  function getDisplaySnapshot(display) {
    return {
      id: display.id,
      bounds: { ...display.bounds },
      scaleFactor: display.scaleFactor
    };
  }

  function findDisplayById(displays, displayId) {
    if (!Array.isArray(displays) || displays.length === 0) {
      return null;
    }
    return displays.find(function (candidate) {
      return String(candidate.id) === String(displayId);
    }) || null;
  }

  function resolveCaptureDimensions(display) {
    const fullWidth = Math.max(1, Math.round(display.bounds.width * display.scaleFactor));
    const fullHeight = Math.max(1, Math.round(display.bounds.height * display.scaleFactor));
    return {
      captureWidth: ensureEven(fullWidth * CAPTURE_CONFIG.scale),
      captureHeight: ensureEven(fullHeight * CAPTURE_CONFIG.scale)
    };
  }

  function resolveDisplayForCursor() {
    const displays =
      typeof screen?.getAllDisplays === 'function'
        ? screen.getAllDisplays()
        : [];
    const primaryDisplay =
      typeof screen?.getPrimaryDisplay === 'function'
        ? screen.getPrimaryDisplay()
        : null;
    const fallbackDisplay = primaryDisplay || displays[0] || null;

    if (!fallbackDisplay) {
      throw new Error('No displays available for stills capture.');
    }

    let targetDisplay = fallbackDisplay;
    if (
      typeof screen?.getCursorScreenPoint === 'function' &&
      typeof screen?.getDisplayNearestPoint === 'function'
    ) {
      try {
        const cursorPoint = screen.getCursorScreenPoint();
        const nearestDisplay = screen.getDisplayNearestPoint(cursorPoint);
        if (nearestDisplay && nearestDisplay.id != null) {
          targetDisplay = nearestDisplay;
        }
      } catch (error) {
        logger.warn('Failed to resolve cursor display; falling back to primary display', {
          error: error?.message || String(error)
        });
      }
    }

    return {
      displays,
      primaryDisplay: fallbackDisplay,
      targetDisplay: targetDisplay || fallbackDisplay
    };
  }

  async function resolveCaptureSourceForDisplay({
    displays,
    primaryDisplay,
    targetDisplay
  } = {}) {
    if (!targetDisplay) {
      throw new Error('Target display is required to resolve stills source.');
    }

    const sources = await desktopCapturer.getSources({ types: ['screen'] });
    if (!Array.isArray(sources) || sources.length === 0) {
      throw new Error('No screen sources available for stills.');
    }

    const targetSource = sources.find(function (candidate) {
      return String(candidate.display_id) === String(targetDisplay.id);
    });

    const primarySource = primaryDisplay
      ? sources.find(function (candidate) {
          return String(candidate.display_id) === String(primaryDisplay.id);
        })
      : null;

    const source = targetSource || primarySource || sources[0];
    const sourceDisplay =
      findDisplayById(displays, source.display_id) ||
      (targetSource ? targetDisplay : primaryDisplay) ||
      targetDisplay;

    if (!targetSource) {
      logger.warn('Cursor display source unavailable; falling back to available display source', {
        cursorDisplayId: targetDisplay.id,
        fallbackDisplayId: sourceDisplay?.id ?? null
      });
    }

    const { captureWidth, captureHeight } = resolveCaptureDimensions(sourceDisplay);

    return {
      sourceId: source.id,
      captureWidth,
      captureHeight,
      sourceDisplay: getDisplaySnapshot(sourceDisplay)
    };
  }

  function isSameCaptureSource(currentSource, nextSource) {
    if (!currentSource || !nextSource) {
      return false;
    }
    return (
      String(currentSource.sourceId) === String(nextSource.sourceId) &&
      currentSource.captureWidth === nextSource.captureWidth &&
      currentSource.captureHeight === nextSource.captureHeight &&
      String(currentSource.sourceDisplay?.id) === String(nextSource.sourceDisplay?.id)
    );
  }

  async function startRendererCapture(nextSourceDetails, reason) {
    const window = await ensureWindowReady();
    const requestId = randomUUID();
    window.webContents.send('screen-stills:start', {
      requestId,
      sourceId: nextSourceDetails.sourceId,
      captureWidth: nextSourceDetails.captureWidth,
      captureHeight: nextSourceDetails.captureHeight,
      format: CAPTURE_CONFIG.format
    });
    await waitForStatus(requestId, START_TIMEOUT_MS, ['started']);
    logger.log('Recording capture source started', {
      reason,
      displayId: nextSourceDetails.sourceDisplay.id,
      sourceId: nextSourceDetails.sourceId
    });
  }

  async function ensureCaptureSource(reason) {
    const displayContext = resolveDisplayForCursor();
    const nextSourceDetails = await resolveCaptureSourceForDisplay(displayContext);

    if (isSameCaptureSource(sourceDetails, nextSourceDetails)) {
      return sourceDetails;
    }

    const previousSource = sourceDetails;
    if (previousSource) {
      const stopResult = await tryStopRendererCapture({ timeoutMs: STOP_TIMEOUT_MS });
      if (!stopResult.ok) {
        throw stopResult.error || new Error('Failed to stop previous display capture.');
      }
    }

    try {
      await startRendererCapture(nextSourceDetails, reason || 'capture-source-update');
      sourceDetails = nextSourceDetails;
    } catch (error) {
      if (previousSource) {
        sourceDetails = null;
      }
      throw error;
    }

    if (previousSource) {
      logger.log('Recording capture source switched to cursor display', {
        reason: reason || 'capture-source-update',
        fromDisplayId: previousSource.sourceDisplay?.id ?? null,
        toDisplayId: sourceDetails.sourceDisplay?.id ?? null
      });
    }

    return sourceDetails;
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
    if (!sessionStore) {
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

    try {
      if (!IS_E2E_FAKE_CAPTURE) {
        const requestId = randomUUID();
        const activeSourceDetails = await ensureCaptureSource('capture-tick');
        const window = await ensureWindowReady();
        window.webContents.send('screen-stills:capture', {
          requestId,
          filePath,
          format: CAPTURE_CONFIG.format
        });
        await waitForStatus(requestId, STOP_TIMEOUT_MS, ['captured']);
        sourceDetails = activeSourceDetails || sourceDetails;
      } else {
        createFakeCaptureFile(filePath);
      }
      if (sessionStore) {
        sessionStore.addCapture({
          fileName: nextCapture.fileName,
          capturedAt: nextCapture.capturedAt,
          displayId: sourceDetails?.sourceDisplay?.id
        });
        if (queueStore) {
          try {
            queueStore.enqueueCapture({
              imagePath: filePath,
              sessionId: sessionStore.sessionId,
              capturedAt: nextCapture.capturedAt
            });
          } catch (error) {
            logger.error('Failed to enqueue still capture', { error, filePath });
          }
        }
      }
    } finally {
      captureInProgress = false;
    }
  }

  async function start({ contextFolderPath } = {}) {
    if (startInProgress) {
      return startInProgress;
    }

    startInProgress = (async function () {
      if (sessionStore) {
        logger.log('Recording already active; start skipped');
        return {
          ok: true,
          alreadyRecording: true,
          sessionId: sessionStore.sessionId,
          sessionDir: sessionStore.sessionDir
        };
      }
      if (!contextFolderPath) {
        throw new Error('Context folder path missing for recording.');
      }
      if (!isScreenRecordingPermissionGranted()) {
        throw new Error('Screen Recording permission is not granted. Enable Familiar in System Settings \u2192 Privacy & Security \u2192 Screen Recording.');
      }

      async function startOnce() {
        const initialSourceDetails = IS_E2E_FAKE_CAPTURE
          ? {
              sourceId: 'e2e-fake-source',
              captureWidth: 640,
              captureHeight: 360,
              sourceDisplay: {
                id: 'e2e-fake-display',
                bounds: { width: 640, height: 360, x: 0, y: 0 },
                scaleFactor: 1,
                workArea: { width: 640, height: 360, x: 0, y: 0 },
                size: { width: 640, height: 360 }
              }
            }
          : await resolveCaptureSourceForDisplay(resolveDisplayForCursor());
        recoverIncompleteSessions(contextFolderPath, logger);

        const appVersion = typeof app?.getVersion === 'function' ? app.getVersion() : null;
        sessionStore = createSessionStore({
          contextFolderPath,
          intervalSeconds: intervalMs / 1000,
          scale: CAPTURE_CONFIG.scale,
          format: CAPTURE_CONFIG.format,
          sourceDisplay: initialSourceDetails.sourceDisplay,
          appVersion,
          logger
        });
        queueStore = createStillsQueue({ contextFolderPath, logger });

        logger.log('Recording session started', { sessionDir: sessionStore.sessionDir });

        try {
          if (!IS_E2E_FAKE_CAPTURE) {
            await startRendererCapture(initialSourceDetails, 'session-start');
          }
          sourceDetails = initialSourceDetails;
        } catch (error) {
          sessionStore.finalize('start_failed');
          sessionStore = null;
          if (queueStore) {
            queueStore.close();
            queueStore = null;
          }
          sourceDetails = null;
          throw error;
        }

        await captureNext();
        scheduleCaptureLoop();
        return { ok: true, sessionId: sessionStore.sessionId, sessionDir: sessionStore.sessionDir };
      }

      let didRetry = false;
      try {
        return await startOnce();
      } catch (error) {
        if (!didRetry && isCaptureAlreadyInProgressError(error)) {
          didRetry = true;
          logger.warn('Capture already in progress on start; forcing reset and retrying', {
            error: error?.message || String(error)
          });
          await forceResetRendererCapture('start-capture-already-in-progress');
          return await startOnce();
        }
        throw error;
      }
    })();

    try {
      return await startInProgress;
    } finally {
      startInProgress = null;
    }
  }

  async function stop({ reason } = {}) {
    if (stopInProgress) {
      return stopInProgress;
    }

    stopInProgress = (async function () {
      const stopReason = reason || 'stop';
      clearCaptureLoop();

      captureInProgress = false;

      const stopResult = await tryStopRendererCapture({ timeoutMs: STOP_TIMEOUT_MS });
      if (!stopResult.ok) {
        logger.error('Failed to stop recording capture', stopResult.error || stopResult);
      }

      if (sessionStore) {
        sessionStore.finalize(stopReason);
      }
      if (queueStore) {
        queueStore.close();
        queueStore = null;
      }
      logger.log('Recording session stopped', { reason: stopReason });

      if (!sessionStore && !captureWindow) {
        return { ok: true, alreadyStopped: true };
      }

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
      logger.log('Recording renderer ready');
    });

    ipcMain.on('screen-stills:status', function (_event, payload) {
      const requestId = payload?.requestId;
      const pending = requestId ? pendingRequests.get(requestId) : null;
      if (!pending) {
        if (payload?.status === 'error') {
          logger.error('Recording error', payload);
        }
        return;
      }

      if (payload.status === 'error') {
        pending.reject(new Error(payload.message || 'Recording capture failed.'));
        return;
      }

      const expected = pending.expectedStatuses;
      if (!expected || expected.includes(payload.status)) {
        pending.resolve(payload);
      }
    });
  } else {
    logger.warn('IPC unavailable; recording status listener not registered');
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
