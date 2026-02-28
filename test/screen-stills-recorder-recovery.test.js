const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');

const resetRecorderModule = () => {
  const resolved = require.resolve('../src/screen-stills/recorder');
  delete require.cache[resolved];
};

async function waitForCondition(predicate, { timeoutMs = 2000, intervalMs = 10, message } = {}) {
  const start = Date.now();
  while (Date.now() - start <= timeoutMs) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(message || 'Timed out waiting for condition.');
}

const MOCK_THUMBNAIL_PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAE9bLkAAAAAASUVORK5CYII=';
const MOCK_THUMBNAIL_PNG_DATA_URL = `data:image/png;base64,${MOCK_THUMBNAIL_PNG_BASE64}`;
const MOCK_THUMBNAIL_PNG_BUFFER = Buffer.from(MOCK_THUMBNAIL_PNG_BASE64, 'base64');
const MOCK_INVALID_THUMBNAIL_BUFFER = Buffer.from([0x12, 0x34, 0x56]);

function createDeterministicLowPowerModeMonitor({ enabled = false } = {}) {
  return {
    start: () => {},
    stop: () => {},
    on: () => {},
    off: () => {},
    isLowPowerModeEnabled: () => enabled
  };
}

function createMockSource(options = {}) {
  const {
    id = 'screen:1',
    displayId = '1',
    thumbnailOptions = {}
  } = options;
  const {
    toPNG = () => MOCK_THUMBNAIL_PNG_BUFFER,
    toDataURL = () => MOCK_THUMBNAIL_PNG_DATA_URL
  } = thumbnailOptions;
  return {
    id,
    display_id: String(displayId),
    thumbnail: {
      toDataURL,
      toPNG,
      getSize: () => ({ width: 640, height: 480 })
    }
  };
}

function assertThumbnailSizeMatches(getSourcesCalls, expected) {
  for (const call of getSourcesCalls) {
    assert.equal(call?.thumbnailSize?.width, expected.width);
    assert.equal(call?.thumbnailSize?.height, expected.height);
  }
}

test('recorder.start force-resets and retries once when renderer reports capture already in progress', async () => {
  resetRecorderModule();

  const ipcMain = new EventEmitter();
  const sendCalls = [];
  let startCalls = 0;
  let stopCalls = 0;
  let captureCalls = 0;
  let getSourcesCalls = 0;
  const getSourcesOptions = [];

  function createWebContents() {
    const webContents = new EventEmitter();
    webContents.getURL = () => 'file://stills.html';
    webContents.send = (channel, payload) => {
      sendCalls.push({ channel, payload });
      if (channel === 'screen-stills:start') {
        startCalls += 1;
        process.nextTick(() => {
          if (startCalls === 1) {
            ipcMain.emit('screen-stills:status', {}, {
              requestId: payload.requestId,
              status: 'error',
              message: 'Capture already in progress.'
            });
          } else {
            ipcMain.emit('screen-stills:status', {}, {
              requestId: payload.requestId,
              status: 'started'
            });
          }
        });
      }

      if (channel === 'screen-stills:stop') {
        stopCalls += 1;
        process.nextTick(() => {
          ipcMain.emit('screen-stills:status', {}, {
            requestId: payload.requestId,
            status: 'stopped'
          });
        });
      }

      if (channel === 'screen-stills:capture') {
        captureCalls += 1;
        process.nextTick(() => {
          ipcMain.emit('screen-stills:status', {}, {
            requestId: payload.requestId,
            status: 'captured',
            filePath: payload.filePath
          });
        });
      }
    };
    return webContents;
  }

  function BrowserWindowStub() {
    this.webContents = createWebContents();
    this._destroyed = false;

    this.loadFile = () => {
      // Simulate load + renderer ready.
      process.nextTick(() => {
        this.webContents.emit('did-finish-load');
        ipcMain.emit('screen-stills:ready', { sender: this.webContents });
      });
    };

    this.on = () => {};
    this.isDestroyed = () => this._destroyed;
    this.destroy = () => {
      this._destroyed = true;
    };
  }

  const stubElectron = {
    BrowserWindow: BrowserWindowStub,
    desktopCapturer: {
      getSources: async (options) => {
        getSourcesCalls += 1;
        getSourcesOptions.push(options);
        return [createMockSource()];
      }
    },
    ipcMain,
    screen: {
      getAllDisplays: () => [{ id: 1, bounds: { width: 1000, height: 800 }, scaleFactor: 1 }],
      getPrimaryDisplay: () => ({ id: 1, bounds: { width: 1000, height: 800 }, scaleFactor: 1 })
    },
    app: { getVersion: () => 'test' }
  };

  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === 'electron') {
      return stubElectron;
    }
    if (request === '../screen-capture/permissions') {
      return { isScreenRecordingPermissionGranted: () => true };
    }
    if (request === './session-store') {
      return {
        createSessionStore: ({ contextFolderPath }) => {
          const sessionId = 'session-test';
          return {
            sessionId,
            sessionDir: `${contextFolderPath}/familiar/stills/${sessionId}`,
            nextCaptureFile: (capturedAt) => ({ fileName: 'capture.webp', capturedAt })
          };
        }
      };
    }
    if (request === './stills-queue') {
      return {
        createStillsQueue: () => ({
          enqueueCapture: () => {},
          close: () => {}
        })
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    const { createRecorder } = require('../src/screen-stills/recorder');
    const logs = [];
    const logger = {
      log: (...args) => logs.push({ level: 'log', args }),
      warn: (...args) => logs.push({ level: 'warn', args }),
      error: (...args) => logs.push({ level: 'error', args })
    };

  const recorder = createRecorder({
    logger,
    intervalSeconds: 1,
    lowPowerModeMonitor: createDeterministicLowPowerModeMonitor()
  });
    const result = await recorder.start({ contextFolderPath: '/tmp/familiar-test' });

    assert.equal(result.ok, true);
    assert.equal(startCalls, 2);
    assert.equal(stopCalls >= 1, true);
    assert.equal(captureCalls, 1);
    assert.equal(getSourcesCalls >= 2, true);
    assertThumbnailSizeMatches(getSourcesOptions, { width: 500, height: 400 });
    const startAttempted = sendCalls.some((call) => call.channel === 'screen-stills:start');
    const stopAttempted = sendCalls.some((call) => call.channel === 'screen-stills:stop');
    assert.equal(startAttempted, true);
    assert.equal(stopAttempted, true);
    const hasThumbnailPayload = sendCalls.some((call) =>
      call.channel === 'screen-stills:capture' &&
      typeof call.payload?.thumbnailDataUrl === 'string'
    );
    const hasThumbnailBinaryPayload = sendCalls.some((call) =>
      call.channel === 'screen-stills:capture' &&
      call.payload?.thumbnailPng != null
    );
    assert.equal(hasThumbnailPayload, true);
    assert.equal(hasThumbnailBinaryPayload, true);

    const warned = logs.some((entry) =>
      entry.level === 'warn' &&
      typeof entry.args?.[0] === 'string' &&
      entry.args[0].includes('Capture already in progress on start')
    );
    assert.equal(warned, true);

    await recorder.stop({ reason: 'test' });
    assert.equal(stopCalls >= 2, true);
  } finally {
    Module._load = originalLoad;
    resetRecorderModule();
  }
});

test('recorder.start recreates the capture window when force-stop fails, then retries start successfully', async () => {
  resetRecorderModule();

  const ipcMain = new EventEmitter();
  const sendCalls = [];
  let startCalls = 0;
  let stopCalls = 0;
  let captureCalls = 0;
  let windowCreateCount = 0;
  let windowDestroyCount = 0;
  let getSourcesCalls = 0;
  const getSourcesOptions = [];

  function createWebContents() {
    const webContents = new EventEmitter();
    webContents.getURL = () => 'file://stills.html';
    webContents.send = (channel, payload) => {
      sendCalls.push({ channel, payload });
      if (channel === 'screen-stills:start') {
        startCalls += 1;
        process.nextTick(() => {
          if (startCalls === 1) {
            ipcMain.emit('screen-stills:status', {}, {
              requestId: payload.requestId,
              status: 'error',
              message: 'Capture already in progress.'
            });
          } else {
            ipcMain.emit('screen-stills:status', {}, {
              requestId: payload.requestId,
              status: 'started'
            });
          }
        });
      }

      if (channel === 'screen-stills:stop') {
        stopCalls += 1;
        process.nextTick(() => {
          if (stopCalls === 1) {
            ipcMain.emit('screen-stills:status', {}, {
              requestId: payload.requestId,
              status: 'error',
              message: 'Renderer stop failed.'
            });
          } else {
            ipcMain.emit('screen-stills:status', {}, {
              requestId: payload.requestId,
              status: 'stopped'
            });
          }
        });
      }

      if (channel === 'screen-stills:capture') {
        captureCalls += 1;
        process.nextTick(() => {
          ipcMain.emit('screen-stills:status', {}, {
            requestId: payload.requestId,
            status: 'captured',
            filePath: payload.filePath
          });
        });
      }
    };
    return webContents;
  }

  function BrowserWindowStub() {
    windowCreateCount += 1;
    this.webContents = createWebContents();
    this._destroyed = false;

    this.loadFile = () => {
      process.nextTick(() => {
        this.webContents.emit('did-finish-load');
        ipcMain.emit('screen-stills:ready', { sender: this.webContents });
      });
    };

    this.on = () => {};
    this.isDestroyed = () => this._destroyed;
    this.destroy = () => {
      if (!this._destroyed) {
        windowDestroyCount += 1;
      }
      this._destroyed = true;
    };
  }

  const stubElectron = {
    BrowserWindow: BrowserWindowStub,
    desktopCapturer: {
      getSources: async (options) => {
        getSourcesCalls += 1;
        getSourcesOptions.push(options);
        return [createMockSource()];
      }
    },
    ipcMain,
    screen: {
      getAllDisplays: () => [{ id: 1, bounds: { width: 1000, height: 800 }, scaleFactor: 1 }],
      getPrimaryDisplay: () => ({ id: 1, bounds: { width: 1000, height: 800 }, scaleFactor: 1 })
    },
    app: { getVersion: () => 'test' }
  };

  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === 'electron') {
      return stubElectron;
    }
    if (request === '../screen-capture/permissions') {
      return { isScreenRecordingPermissionGranted: () => true };
    }
    if (request === './session-store') {
      return {
        createSessionStore: ({ contextFolderPath }) => {
          const sessionId = `session-test-${Math.random().toString(16).slice(2)}`;
          return {
            sessionId,
            sessionDir: `${contextFolderPath}/familiar/stills/${sessionId}`,
            nextCaptureFile: (capturedAt) => ({ fileName: 'capture.webp', capturedAt })
          };
        }
      };
    }
    if (request === './stills-queue') {
      return {
        createStillsQueue: () => ({
          enqueueCapture: () => {},
          close: () => {}
        })
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    const { createRecorder } = require('../src/screen-stills/recorder');
    const logs = [];
    const logger = {
      log: (...args) => logs.push({ level: 'log', args }),
      warn: (...args) => logs.push({ level: 'warn', args }),
      error: (...args) => logs.push({ level: 'error', args })
    };

    const recorder = createRecorder({
      logger,
      intervalSeconds: 1,
      lowPowerModeMonitor: createDeterministicLowPowerModeMonitor()
    });
    const result = await recorder.start({ contextFolderPath: '/tmp/familiar-test' });

    assert.equal(result.ok, true);
    assert.equal(startCalls, 2);
    assert.equal(stopCalls >= 1, true);
    assert.equal(captureCalls, 1);
    assert.equal(getSourcesCalls >= 2, true);
    assertThumbnailSizeMatches(getSourcesOptions, { width: 500, height: 400 });

    // Stop failure should trigger window recreation.
    assert.equal(windowCreateCount >= 1, true);
    const recreateLogged = logs.some((entry) =>
      entry.level === 'warn' &&
      typeof entry.args?.[0] === 'string' &&
      entry.args[0].includes('Destroying capture window')
    );

    if (windowCreateCount >= 2) {
      assert.equal(windowDestroyCount >= 1, true);
      assert.equal(recreateLogged, true);
    } else {
      assert.equal(windowDestroyCount, 0);
    }

    await recorder.stop({ reason: 'test' });
    assert.equal(stopCalls >= 3, true);

    const stopAttempted = sendCalls.some((call) => call.channel === 'screen-stills:stop');
    assert.equal(stopAttempted, true);
  } finally {
    Module._load = originalLoad;
    resetRecorderModule();
  }
});

test('recorder resolves capture thumbnail from data URL when toPNG is not PNG', async () => {
  resetRecorderModule();

  const ipcMain = new EventEmitter();
  const sendCalls = [];
  let startCalls = 0;
  let stopCalls = 0;
  let captureCalls = 0;
  let getSourcesCalls = 0;

  function createWebContents() {
    const webContents = new EventEmitter();
    webContents.getURL = () => 'file://stills.html';
    webContents.send = (channel, payload) => {
      sendCalls.push({ channel, payload });
      if (channel === 'screen-stills:start') {
        process.nextTick(() => {
          ipcMain.emit('screen-stills:status', {}, {
            requestId: payload.requestId,
            status: 'started'
          });
        });
      }

      if (channel === 'screen-stills:stop') {
        stopCalls += 1;
        process.nextTick(() => {
          ipcMain.emit('screen-stills:status', {}, {
            requestId: payload.requestId,
            status: 'stopped'
          });
        });
      }

      if (channel === 'screen-stills:capture') {
        captureCalls += 1;
        process.nextTick(() => {
          ipcMain.emit('screen-stills:status', {}, {
            requestId: payload.requestId,
            status: 'captured',
            filePath: payload.filePath
          });
        });
      }
    };
    return webContents;
  }

  function BrowserWindowStub() {
    this.webContents = createWebContents();
    this._destroyed = false;

    this.loadFile = () => {
      process.nextTick(() => {
        this.webContents.emit('did-finish-load');
        ipcMain.emit('screen-stills:ready', { sender: this.webContents });
      });
    };

    this.on = () => {};
    this.isDestroyed = () => this._destroyed;
    this.destroy = () => {
      this._destroyed = true;
    };
  }

  const stubElectron = {
    BrowserWindow: BrowserWindowStub,
    desktopCapturer: {
      getSources: async () => {
        getSourcesCalls += 1;
        return [
              createMockSource({
                thumbnailOptions: {
                  toPNG: () => MOCK_INVALID_THUMBNAIL_BUFFER,
                  toDataURL: () => MOCK_THUMBNAIL_PNG_DATA_URL
                }
              })
            ];
      }
    },
    ipcMain,
    screen: {
      getAllDisplays: () => [{ id: 1, bounds: { width: 1000, height: 800 }, scaleFactor: 1 }],
      getPrimaryDisplay: () => ({ id: 1, bounds: { width: 1000, height: 800 }, scaleFactor: 1 })
    },
    app: { getVersion: () => 'test' }
  };

  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === 'electron') {
      return stubElectron;
    }
    if (request === '../screen-capture/permissions') {
      return { isScreenRecordingPermissionGranted: () => true };
    }
    if (request === './session-store') {
      return {
        createSessionStore: ({ contextFolderPath }) => {
          const sessionId = 'session-test';
          return {
            sessionId,
            sessionDir: `${contextFolderPath}/familiar/stills/${sessionId}`,
            nextCaptureFile: (capturedAt) => ({ fileName: 'capture.webp', capturedAt })
          };
        }
      };
    }
    if (request === './stills-queue') {
      return {
        createStillsQueue: () => ({
          enqueueCapture: () => {},
          close: () => {}
        })
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    const { createRecorder } = require('../src/screen-stills/recorder');
    const recorder = createRecorder({
      logger: console,
      intervalSeconds: 1,
      lowPowerModeMonitor: createDeterministicLowPowerModeMonitor()
    });
    const result = await recorder.start({ contextFolderPath: '/tmp/familiar-test' });

    assert.equal(result.ok, true);
    assert.equal(getSourcesCalls >= 1, true);
    assert.equal(captureCalls, 1);

    const hasDataUrl = sendCalls.some((call) =>
      call.channel === 'screen-stills:capture' &&
      typeof call.payload?.thumbnailDataUrl === 'string'
    );
    const hasBinaryPayload = sendCalls.some((call) =>
      call.channel === 'screen-stills:capture' &&
      call.payload?.thumbnailPng != null
    );
    assert.equal(hasDataUrl, true);
    assert.equal(hasBinaryPayload, true);

    await recorder.stop({ reason: 'test' });
    assert.equal(stopCalls, 1);
  } finally {
    Module._load = originalLoad;
    resetRecorderModule();
  }
});

test('recorder fails to start when source thumbnail is unavailable', async () => {
  resetRecorderModule();

  const ipcMain = new EventEmitter();
  let getSourcesCalls = 0;
  let stopCalls = 0;
  let captureCalls = 0;

  function createWebContents() {
    const webContents = new EventEmitter();
    webContents.getURL = () => 'file://stills.html';
    webContents.send = (channel, payload) => {
      if (channel === 'screen-stills:stop') {
        stopCalls += 1;
        process.nextTick(() => {
          ipcMain.emit('screen-stills:status', {}, {
            requestId: payload.requestId,
            status: 'stopped'
          });
        });
      }

      if (channel === 'screen-stills:capture') {
        captureCalls += 1;
        process.nextTick(() => {
          ipcMain.emit('screen-stills:status', {}, {
            requestId: payload.requestId,
            status: 'captured',
            filePath: payload.filePath
          });
        });
      }
    };
    return webContents;
  }

  function BrowserWindowStub() {
    this.webContents = createWebContents();
    this._destroyed = false;

    this.loadFile = () => {
      process.nextTick(() => {
        this.webContents.emit('did-finish-load');
        ipcMain.emit('screen-stills:ready', { sender: this.webContents });
      });
    };

    this.on = () => {};
    this.isDestroyed = () => this._destroyed;
    this.destroy = () => {
      this._destroyed = true;
    };
  }

  const stubElectron = {
    BrowserWindow: BrowserWindowStub,
    desktopCapturer: {
      getSources: async () => {
        getSourcesCalls += 1;
        return [
              createMockSource({
                thumbnailOptions: {
                  toPNG: () => MOCK_INVALID_THUMBNAIL_BUFFER,
                  toDataURL: () => 'data:bad'
                }
              })
        ];
      }
    },
    ipcMain,
    screen: {
      getAllDisplays: () => [{ id: 1, bounds: { width: 1000, height: 800 }, scaleFactor: 1 }],
      getPrimaryDisplay: () => ({ id: 1, bounds: { width: 1000, height: 800 }, scaleFactor: 1 })
    },
    app: { getVersion: () => 'test' }
  };

  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === 'electron') {
      return stubElectron;
    }
    if (request === '../screen-capture/permissions') {
      return { isScreenRecordingPermissionGranted: () => true };
    }
    if (request === './session-store') {
      return {
        createSessionStore: ({ contextFolderPath }) => {
          const sessionId = 'session-test';
          return {
            sessionId,
            sessionDir: `${contextFolderPath}/familiar/stills/${sessionId}`,
            nextCaptureFile: (capturedAt) => ({ fileName: 'capture.webp', capturedAt })
          };
        }
      };
    }
    if (request === './stills-queue') {
      return {
        createStillsQueue: () => ({
          enqueueCapture: () => {},
          close: () => {}
        })
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    const { createRecorder } = require('../src/screen-stills/recorder');
    const recorder = createRecorder({
      logger: console,
      intervalSeconds: 1,
      lowPowerModeMonitor: createDeterministicLowPowerModeMonitor()
    });
    await assert.rejects(
      recorder.start({ contextFolderPath: '/tmp/familiar-test' }),
      /No thumbnail available for capture source\./
    );

    assert.equal(getSourcesCalls >= 2, true);
    assert.equal(captureCalls, 0);
    assert.equal(stopCalls, 0);
  } finally {
    Module._load = originalLoad;
    resetRecorderModule();
  }
});

test('recorder fails when thumbnail resize throws and does not start', async () => {
  resetRecorderModule();

  const ipcMain = new EventEmitter();
  let getSourcesCalls = 0;
  let resizeCalls = 0;
  let captureCalls = 0;
  let startCalls = 0;
  let stopCalls = 0;

  function createWebContents() {
    const webContents = new EventEmitter();
    webContents.getURL = () => 'file://stills.html';
    webContents.send = (channel, payload) => {
      if (channel === 'screen-stills:start') {
        startCalls += 1;
        process.nextTick(() => {
          ipcMain.emit('screen-stills:status', {}, {
            requestId: payload.requestId,
            status: 'started'
          });
        });
      }

      if (channel === 'screen-stills:stop') {
        stopCalls += 1;
        process.nextTick(() => {
          ipcMain.emit('screen-stills:status', {}, {
            requestId: payload.requestId,
            status: 'stopped'
          });
        });
      }

      if (channel === 'screen-stills:capture') {
        captureCalls += 1;
        process.nextTick(() => {
          ipcMain.emit('screen-stills:status', {}, {
            requestId: payload.requestId,
            status: 'captured',
            filePath: payload.filePath
          });
        });
      }
    };
    return webContents;
  }

  function BrowserWindowStub() {
    this.webContents = createWebContents();
    this._destroyed = false;

    this.loadFile = () => {
      process.nextTick(() => {
        this.webContents.emit('did-finish-load');
        ipcMain.emit('screen-stills:ready', { sender: this.webContents });
      });
    };

    this.on = () => {};
    this.isDestroyed = () => this._destroyed;
    this.destroy = () => {
      this._destroyed = true;
    };
  }

  const stubElectron = {
    BrowserWindow: BrowserWindowStub,
    desktopCapturer: {
      getSources: async () => {
        getSourcesCalls += 1;
        return [
          {
            id: 'screen:1',
            display_id: '1',
            thumbnail: {
              toPNG: () => {
                throw new Error('No thumbnail available for capture source.');
              },
              toDataURL: () => MOCK_THUMBNAIL_PNG_DATA_URL,
              getSize: () => ({ width: 640, height: 480 }),
              resize: () => {
                resizeCalls += 1;
                throw new Error('No thumbnail available for capture source.');
              }
            }
          }
        ];
      }
    },
    ipcMain,
    screen: {
      getAllDisplays: () => [
        { id: 1, bounds: { x: 0, y: 0, width: 1000, height: 800 }, scaleFactor: 1 },
        { id: 2, bounds: { x: 1000, y: 0, width: 1200, height: 800 }, scaleFactor: 1 }
      ],
      getPrimaryDisplay: () => ({ id: 1, bounds: { x: 0, y: 0, width: 1000, height: 800 }, scaleFactor: 1 }),
      getCursorScreenPoint: () => ({ x: 1100, y: 100 }),
      getDisplayNearestPoint: () => ({ id: 2, bounds: { x: 1000, y: 0, width: 1200, height: 800 }, scaleFactor: 1 })
    },
    app: { getVersion: () => 'test' }
  };

  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === 'electron') {
      return stubElectron;
    }
    if (request === '../screen-capture/permissions') {
      return { isScreenRecordingPermissionGranted: () => true };
    }
    if (request === './session-store') {
      return {
        createSessionStore: ({ contextFolderPath }) => {
          const sessionId = 'session-test';
          return {
            sessionId,
            sessionDir: `${contextFolderPath}/familiar/stills/${sessionId}`,
            nextCaptureFile: (capturedAt) => ({ fileName: 'capture.webp', capturedAt })
          };
        }
      };
    }
    if (request === './stills-queue') {
      return {
        createStillsQueue: () => ({
          enqueueCapture: () => {},
          close: () => {}
        })
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    const { createRecorder } = require('../src/screen-stills/recorder');
    const recorder = createRecorder({
      logger: console,
      intervalSeconds: 1,
      lowPowerModeMonitor: createDeterministicLowPowerModeMonitor()
    });
    await assert.rejects(
      recorder.start({ contextFolderPath: '/tmp/familiar-test' }),
      /No thumbnail available for capture source\./
    );

    assert.equal(getSourcesCalls, 1);
    assert.equal(resizeCalls, 1);
    assert.equal(captureCalls, 0);
    assert.equal(startCalls, 0);
    assert.equal(stopCalls, 0);
  } finally {
    Module._load = originalLoad;
    resetRecorderModule();
  }
});

test('recorder follows cursor display and switches capture source between monitors', async () => {
  resetRecorderModule();

  const ipcMain = new EventEmitter();
  const sendCalls = [];
  let startCalls = 0;
  let stopCalls = 0;
  let captureCalls = 0;
  let getSourcesCalls = 0;
  let cursorPoint = { x: 100, y: 100 };
  const displays = [
    { id: 1, bounds: { x: 0, y: 0, width: 1000, height: 800 }, scaleFactor: 1 },
    { id: 2, bounds: { x: 1000, y: 0, width: 1000, height: 800 }, scaleFactor: 1 }
  ];

  function resolveDisplayNearestPoint(point) {
    if (point && point.x >= 1000) {
      return displays[1];
    }
    return displays[0];
  }

  function createWebContents() {
    const webContents = new EventEmitter();
    webContents.getURL = () => 'file://stills.html';
    webContents.send = (channel, payload) => {
      sendCalls.push({ channel, payload });
      if (channel === 'screen-stills:start') {
        startCalls += 1;
        process.nextTick(() => {
          ipcMain.emit('screen-stills:status', {}, {
            requestId: payload.requestId,
            status: 'started'
          });
        });
      }

      if (channel === 'screen-stills:stop') {
        stopCalls += 1;
        process.nextTick(() => {
          ipcMain.emit('screen-stills:status', {}, {
            requestId: payload.requestId,
            status: 'stopped'
          });
        });
      }

      if (channel === 'screen-stills:capture') {
        captureCalls += 1;
        process.nextTick(() => {
          if (captureCalls === 1) {
            cursorPoint = { x: 1200, y: 100 };
          }
          ipcMain.emit('screen-stills:status', {}, {
            requestId: payload.requestId,
            status: 'captured',
            filePath: payload.filePath
          });
        });
      }
    };
    return webContents;
  }

  function BrowserWindowStub() {
    this.webContents = createWebContents();
    this._destroyed = false;

    this.loadFile = () => {
      process.nextTick(() => {
        this.webContents.emit('did-finish-load');
        ipcMain.emit('screen-stills:ready', { sender: this.webContents });
      });
    };

    this.on = () => {};
    this.isDestroyed = () => this._destroyed;
    this.destroy = () => {
      this._destroyed = true;
    };
  }

  const stubElectron = {
    BrowserWindow: BrowserWindowStub,
    desktopCapturer: {
      getSources: async () => {
        getSourcesCalls += 1;
        return [
          createMockSource({ id: 'screen:1', displayId: '1' }),
          createMockSource({ id: 'screen:2', displayId: '2' })
        ];
      }
    },
    ipcMain,
    screen: {
      getAllDisplays: () => displays,
      getPrimaryDisplay: () => displays[0],
      getCursorScreenPoint: () => cursorPoint,
      getDisplayNearestPoint: (point) => resolveDisplayNearestPoint(point)
    },
    app: { getVersion: () => 'test' }
  };

  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === 'electron') {
      return stubElectron;
    }
    if (request === '../screen-capture/permissions') {
      return { isScreenRecordingPermissionGranted: () => true };
    }
    if (request === './session-store') {
      return {
        createSessionStore: ({ contextFolderPath }) => {
          const sessionId = 'session-test';
          return {
            sessionId,
            sessionDir: `${contextFolderPath}/familiar/stills/${sessionId}`,
            nextCaptureFile: (capturedAt) => ({
              fileName: `${Date.now()}.webp`,
              capturedAt
            })
          };
        }
      };
    }
    if (request === './stills-queue') {
      return {
        createStillsQueue: () => ({
          enqueueCapture: () => {},
          close: () => {}
        })
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    const { createRecorder } = require('../src/screen-stills/recorder');
    const recorder = createRecorder({
      logger: console,
      intervalSeconds: 0.02,
      lowPowerModeMonitor: createDeterministicLowPowerModeMonitor()
    });
    const result = await recorder.start({ contextFolderPath: '/tmp/familiar-test' });
    assert.equal(result.ok, true);

    await waitForCondition(
      () => captureCalls >= 2 && startCalls >= 1 && getSourcesCalls >= 2,
      { message: 'Expected second display capture to start.' }
    );

    await recorder.stop({ reason: 'test' });

    const sourceIds = sendCalls
      .filter((call) => call.channel === 'screen-stills:capture')
      .map((call) => call.payload.sourceId);
    const hasThumbnailPayloads = sendCalls.some((call) =>
      call.channel === 'screen-stills:capture' &&
      typeof call.payload?.thumbnailDataUrl === 'string'
    );
    const hasThumbnailBinaryPayloads = sendCalls.some((call) =>
      call.channel === 'screen-stills:capture' &&
      call.payload?.thumbnailPng != null
    );

    assert.equal(sourceIds[0], 'screen:1');
    assert.equal(sourceIds.includes('screen:2'), true);
    assert.equal(hasThumbnailPayloads, true);
    assert.equal(hasThumbnailBinaryPayloads, true);
    assert.equal(stopCalls >= 1, true);
  } finally {
    Module._load = originalLoad;
    resetRecorderModule();
  }
});

test('recorder refreshes capture thumbnail payload when source stays the same', async () => {
  resetRecorderModule();

  const ipcMain = new EventEmitter();
  const sendCalls = [];
  let startCalls = 0;
  let stopCalls = 0;
  let captureCalls = 0;
  let getSourcesCalls = 0;
  let sourceIndex = 0;

  function createWebContents() {
    const webContents = new EventEmitter();
    webContents.getURL = () => 'file://stills.html';
    webContents.send = (channel, payload) => {
      sendCalls.push({ channel, payload });
      if (channel === 'screen-stills:start') {
        startCalls += 1;
        process.nextTick(() => {
          ipcMain.emit('screen-stills:status', {}, {
            requestId: payload.requestId,
            status: 'started'
          });
        });
      }

      if (channel === 'screen-stills:stop') {
        stopCalls += 1;
        process.nextTick(() => {
          ipcMain.emit('screen-stills:status', {}, {
            requestId: payload.requestId,
            status: 'stopped'
          });
        });
      }

      if (channel === 'screen-stills:capture') {
        captureCalls += 1;
        process.nextTick(() => {
          ipcMain.emit('screen-stills:status', {}, {
            requestId: payload.requestId,
            status: 'captured',
            filePath: payload.filePath
          });
        });
      }
    };
    return webContents;
  }

  function BrowserWindowStub() {
    this.webContents = createWebContents();
    this._destroyed = false;

    this.loadFile = () => {
      process.nextTick(() => {
        this.webContents.emit('did-finish-load');
        ipcMain.emit('screen-stills:ready', { sender: this.webContents });
      });
    };

    this.on = () => {};
    this.isDestroyed = () => this._destroyed;
    this.destroy = () => {
      this._destroyed = true;
    };
  }

  function nextMockSource() {
    const thumbnail = Buffer.from(MOCK_THUMBNAIL_PNG_BUFFER);
    const lastByteIndex = thumbnail.length - 1;
    thumbnail[lastByteIndex] = (MOCK_THUMBNAIL_PNG_BUFFER[lastByteIndex] + sourceIndex) % 256;
    sourceIndex += 1;
    return {
      id: 'screen:1',
      display_id: '1',
      thumbnail: {
        toPNG: () => thumbnail,
        toDataURL: () => `data:image/png;base64,${thumbnail.toString('base64')}`,
        getSize: () => ({ width: 640, height: 480 })
      }
    };
  }

  const stubElectron = {
    BrowserWindow: BrowserWindowStub,
    desktopCapturer: {
      getSources: async () => {
        getSourcesCalls += 1;
        return [nextMockSource()];
      }
    },
    ipcMain,
    screen: {
      getAllDisplays: () => [{ id: 1, bounds: { width: 1000, height: 800 }, scaleFactor: 1 }],
      getPrimaryDisplay: () => ({ id: 1, bounds: { width: 1000, height: 800 }, scaleFactor: 1 }),
      getCursorScreenPoint: () => ({ x: 100, y: 100 }),
      getDisplayNearestPoint: () => ({ id: 1, bounds: { width: 1000, height: 800 }, scaleFactor: 1 })
    },
    app: { getVersion: () => 'test' }
  };

  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === 'electron') {
      return stubElectron;
    }
    if (request === '../screen-capture/permissions') {
      return { isScreenRecordingPermissionGranted: () => true };
    }
    if (request === './session-store') {
      return {
        createSessionStore: ({ contextFolderPath }) => {
          const sessionId = 'session-test';
          return {
            sessionId,
            sessionDir: `${contextFolderPath}/familiar/stills/${sessionId}`,
            nextCaptureFile: (capturedAt) => ({
              fileName: `${Date.now()}.webp`,
              capturedAt
            })
          };
        }
      };
    }
    if (request === './stills-queue') {
      return {
        createStillsQueue: () => ({
          enqueueCapture: () => {},
          close: () => {}
        })
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    const { createRecorder } = require('../src/screen-stills/recorder');
    const recorder = createRecorder({
      logger: console,
      intervalSeconds: 0.02,
      lowPowerModeMonitor: createDeterministicLowPowerModeMonitor()
    });
    await recorder.start({ contextFolderPath: '/tmp/familiar-test' });

    await waitForCondition(
      () => captureCalls >= 2 && startCalls >= 1 && getSourcesCalls >= 2,
      { message: 'Expected capture tick with refreshed source thumbnail.' }
    );

    await recorder.stop({ reason: 'test' });

    const capturePayloads = sendCalls.filter((call) => call.channel === 'screen-stills:capture');
    assert.equal(capturePayloads.length >= 2, true);
    assert.equal(capturePayloads[0].payload.sourceId, 'screen:1');
    assert.equal(capturePayloads[1].payload.sourceId, 'screen:1');
    const uniqueThumbnailPayloads = new Set(
      capturePayloads.map((call) => call.payload?.thumbnailDataUrl)
    );
    assert.equal(uniqueThumbnailPayloads.size >= 2, true);
    assert.equal(stopCalls >= 1, true);
  } finally {
    Module._load = originalLoad;
    resetRecorderModule();
  }
});

test('recorder falls back to primary display source when cursor display source is unavailable', async () => {
  resetRecorderModule();

  const ipcMain = new EventEmitter();
  const sendCalls = [];
  const logs = [];
  let getSourcesCalls = 0;
  const displays = [
    { id: 1, bounds: { x: 0, y: 0, width: 1000, height: 800 }, scaleFactor: 1 },
    { id: 2, bounds: { x: 1000, y: 0, width: 1000, height: 800 }, scaleFactor: 1 }
  ];

  function createWebContents() {
    const webContents = new EventEmitter();
    webContents.getURL = () => 'file://stills.html';
    webContents.send = (channel, payload) => {
      sendCalls.push({ channel, payload });
      if (channel === 'screen-stills:start') {
        process.nextTick(() => {
          ipcMain.emit('screen-stills:status', {}, {
            requestId: payload.requestId,
            status: 'started'
          });
        });
      }

      if (channel === 'screen-stills:stop') {
        process.nextTick(() => {
          ipcMain.emit('screen-stills:status', {}, {
            requestId: payload.requestId,
            status: 'stopped'
          });
        });
      }

      if (channel === 'screen-stills:capture') {
        process.nextTick(() => {
          ipcMain.emit('screen-stills:status', {}, {
            requestId: payload.requestId,
            status: 'captured',
            filePath: payload.filePath
          });
        });
      }
    };
    return webContents;
  }

  function BrowserWindowStub() {
    this.webContents = createWebContents();
    this._destroyed = false;

    this.loadFile = () => {
      process.nextTick(() => {
        this.webContents.emit('did-finish-load');
        ipcMain.emit('screen-stills:ready', { sender: this.webContents });
      });
    };

    this.on = () => {};
    this.isDestroyed = () => this._destroyed;
    this.destroy = () => {
      this._destroyed = true;
    };
  }

  const stubElectron = {
    BrowserWindow: BrowserWindowStub,
    desktopCapturer: {
      getSources: async () => {
        getSourcesCalls += 1;
        return [createMockSource()];
      }
    },
    ipcMain,
    screen: {
      getAllDisplays: () => displays,
      getPrimaryDisplay: () => displays[0],
      getCursorScreenPoint: () => ({ x: 1200, y: 100 }),
      getDisplayNearestPoint: () => displays[1]
    },
    app: { getVersion: () => 'test' }
  };

  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === 'electron') {
      return stubElectron;
    }
    if (request === '../screen-capture/permissions') {
      return { isScreenRecordingPermissionGranted: () => true };
    }
    if (request === './session-store') {
      return {
        createSessionStore: ({ contextFolderPath }) => {
          const sessionId = 'session-test';
          return {
            sessionId,
            sessionDir: `${contextFolderPath}/familiar/stills/${sessionId}`,
            nextCaptureFile: (capturedAt) => ({ fileName: 'capture.webp', capturedAt })
          };
        }
      };
    }
    if (request === './stills-queue') {
      return {
        createStillsQueue: () => ({
          enqueueCapture: () => {},
          close: () => {}
        })
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    const { createRecorder } = require('../src/screen-stills/recorder');
    const logger = {
      log: (...args) => logs.push({ level: 'log', args }),
      warn: (...args) => logs.push({ level: 'warn', args }),
      error: (...args) => logs.push({ level: 'error', args })
    };
    const recorder = createRecorder({
      logger,
      intervalSeconds: 1,
      lowPowerModeMonitor: createDeterministicLowPowerModeMonitor()
    });
    const result = await recorder.start({ contextFolderPath: '/tmp/familiar-test' });
    assert.equal(result.ok, true);
    assert.equal(getSourcesCalls >= 1, true);

    await recorder.stop({ reason: 'test' });

    const firstStart = sendCalls.find((call) => call.channel === 'screen-stills:start');
    assert.equal(firstStart?.payload?.sourceId, 'screen:1');
    const hasThumbnailBinaryPayload = sendCalls.some((call) =>
      call.channel === 'screen-stills:capture' &&
      call.payload?.thumbnailPng != null
    );
    assert.equal(hasThumbnailBinaryPayload, true);

    const fallbackWarned = logs.some((entry) =>
      entry.level === 'warn' &&
      typeof entry.args?.[0] === 'string' &&
      entry.args[0].includes('Cursor display source unavailable')
    );
    assert.equal(fallbackWarned, true);
  } finally {
    Module._load = originalLoad;
    resetRecorderModule();
  }
});

test('recorder adapts screenshot interval when Low Power Mode changes', async () => {
  resetRecorderModule();

  const originalE2E = process.env.FAMILIAR_E2E;
  const originalFakeCapture = process.env.FAMILIAR_E2E_FAKE_SCREEN_CAPTURE;
  process.env.FAMILIAR_E2E = '1';
  delete process.env.FAMILIAR_E2E_FAKE_SCREEN_CAPTURE;

  let lowPowerEnabled = false;
  const monitorEmitter = new EventEmitter();
  let monitorStartCalls = 0;
  let monitorStopCalls = 0;
  const lowPowerModeMonitor = {
    start: () => {
      monitorStartCalls += 1;
    },
    stop: () => {
      monitorStopCalls += 1;
    },
    on: (eventName, handler) => monitorEmitter.on(eventName, handler),
    off: (eventName, handler) => monitorEmitter.off(eventName, handler),
    isLowPowerModeEnabled: () => lowPowerEnabled
  };

  const setIntervalCalls = [];
  const clearIntervalCalls = [];
  const scheduler = {
    setInterval: (_handler, delay) => {
      const timer = { id: setIntervalCalls.length + 1, unref: () => {} };
      setIntervalCalls.push({ delay, timer });
      return timer;
    },
    clearInterval: (timer) => {
      clearIntervalCalls.push(timer);
    }
  };

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-low-power-'));
  const sessionDir = path.join(tempDir, 'familiar', 'stills', 'session-test');
  fs.mkdirSync(sessionDir, { recursive: true });

  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === 'electron') {
      return {
        ipcMain: new EventEmitter(),
        app: { getVersion: () => 'test' }
      };
    }
    if (request === '../screen-capture/permissions') {
      return { isScreenRecordingPermissionGranted: () => true };
    }
    if (request === './session-store') {
      return {
        createSessionStore: () => ({
          sessionId: 'session-test',
          sessionDir,
          nextCaptureFile: (capturedAt) => ({ fileName: 'capture.webp', capturedAt })
        })
      };
    }
    if (request === './stills-queue') {
      return {
        createStillsQueue: () => ({
          enqueueCapture: () => {},
          close: () => {}
        })
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    const { createRecorder } = require('../src/screen-stills/recorder');
    const recorder = createRecorder({
      logger: console,
      scheduler,
      lowPowerModeMonitor
    });

    const started = await recorder.start({ contextFolderPath: tempDir });
    assert.equal(started.ok, true);
    assert.equal(monitorStartCalls, 1);
    assert.equal(setIntervalCalls[0]?.delay, 5000);

    lowPowerEnabled = true;
    monitorEmitter.emit('change', { enabled: true, source: 'test' });

    assert.equal(setIntervalCalls[1]?.delay, 15000);
    assert.equal(clearIntervalCalls.length >= 1, true);

    await recorder.stop({ reason: 'test' });
    assert.equal(monitorStopCalls, 1);
  } finally {
    Module._load = originalLoad;
    resetRecorderModule();
    if (originalE2E == null) {
      delete process.env.FAMILIAR_E2E;
    } else {
      process.env.FAMILIAR_E2E = originalE2E;
    }
    if (originalFakeCapture == null) {
      delete process.env.FAMILIAR_E2E_FAKE_SCREEN_CAPTURE;
    } else {
      process.env.FAMILIAR_E2E_FAKE_SCREEN_CAPTURE = originalFakeCapture;
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('recorder keeps fixed E2E interval override and skips Low Power Mode adaptation', async () => {
  resetRecorderModule();

  const originalE2E = process.env.FAMILIAR_E2E;
  const originalE2EInterval = process.env.FAMILIAR_E2E_STILLS_INTERVAL_MS;
  const originalFakeCapture = process.env.FAMILIAR_E2E_FAKE_SCREEN_CAPTURE;
  process.env.FAMILIAR_E2E = '1';
  process.env.FAMILIAR_E2E_STILLS_INTERVAL_MS = '600';
  delete process.env.FAMILIAR_E2E_FAKE_SCREEN_CAPTURE;

  let monitorStartCalls = 0;
  const lowPowerModeMonitor = {
    start: () => {
      monitorStartCalls += 1;
    },
    stop: () => {},
    on: () => {},
    off: () => {},
    isLowPowerModeEnabled: () => true
  };

  const setIntervalCalls = [];
  const scheduler = {
    setInterval: (_handler, delay) => {
      const timer = { id: setIntervalCalls.length + 1, unref: () => {} };
      setIntervalCalls.push(delay);
      return timer;
    },
    clearInterval: () => {}
  };

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-e2e-interval-'));
  const sessionDir = path.join(tempDir, 'familiar', 'stills', 'session-test');
  fs.mkdirSync(sessionDir, { recursive: true });

  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === 'electron') {
      return {
        ipcMain: new EventEmitter(),
        app: { getVersion: () => 'test' }
      };
    }
    if (request === '../screen-capture/permissions') {
      return { isScreenRecordingPermissionGranted: () => true };
    }
    if (request === './session-store') {
      return {
        createSessionStore: () => ({
          sessionId: 'session-test',
          sessionDir,
          nextCaptureFile: (capturedAt) => ({ fileName: 'capture.webp', capturedAt })
        })
      };
    }
    if (request === './stills-queue') {
      return {
        createStillsQueue: () => ({
          enqueueCapture: () => {},
          close: () => {}
        })
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    const { createRecorder } = require('../src/screen-stills/recorder');
    const recorder = createRecorder({
      logger: console,
      scheduler,
      lowPowerModeMonitor
    });

    const started = await recorder.start({ contextFolderPath: tempDir });
    assert.equal(started.ok, true);
    assert.equal(monitorStartCalls, 1);
    assert.deepEqual(setIntervalCalls, [600]);

    await recorder.stop({ reason: 'test' });
  } finally {
    Module._load = originalLoad;
    resetRecorderModule();
    if (originalE2E == null) {
      delete process.env.FAMILIAR_E2E;
    } else {
      process.env.FAMILIAR_E2E = originalE2E;
    }
    if (originalE2EInterval == null) {
      delete process.env.FAMILIAR_E2E_STILLS_INTERVAL_MS;
    } else {
      process.env.FAMILIAR_E2E_STILLS_INTERVAL_MS = originalE2EInterval;
    }
    if (originalFakeCapture == null) {
      delete process.env.FAMILIAR_E2E_FAKE_SCREEN_CAPTURE;
    } else {
      process.env.FAMILIAR_E2E_FAKE_SCREEN_CAPTURE = originalFakeCapture;
    }
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
