const { ipcRenderer } = require('electron');
const fs = require('node:fs');

const START_TIMEOUT_MS = 8000;

let currentCapture = null;

function sendStatus(requestId, status, payload = {}) {
  ipcRenderer.send('screen-stills:status', {
    requestId,
    status,
    ...payload
  });
}

function cleanupCapture() {
  if (currentCapture?.stream) {
    currentCapture.stream.getTracks().forEach(function (track) {
      track.stop();
    });
  }
  currentCapture = null;
}

function resolveMimeType(format) {
  if (format === 'webp') {
    return 'image/webp';
  }
  if (format === 'png') {
    return 'image/png';
  }
  if (format === 'jpeg' || format === 'jpg') {
    return 'image/jpeg';
  }
  return 'image/webp';
}

function waitForVideoReady(video) {
  if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
    return Promise.resolve();
  }

  return new Promise(function (resolve, reject) {
    const timeout = setTimeout(function () {
      cleanup();
      reject(new Error('Timed out preparing capture.'));
    }, START_TIMEOUT_MS);

    function cleanup() {
      clearTimeout(timeout);
      video.removeEventListener('loadedmetadata', handleReady);
      video.removeEventListener('loadeddata', handleReady);
      video.removeEventListener('error', handleError);
    }

    function handleReady() {
      cleanup();
      resolve();
    }

    function handleError() {
      cleanup();
      reject(new Error('Failed to load capture stream.'));
    }

    video.addEventListener('loadedmetadata', handleReady);
    video.addEventListener('loadeddata', handleReady);
    video.addEventListener('error', handleError);
  });
}

function canvasToBuffer(canvas, format) {
  const mimeType = resolveMimeType(format);
  return new Promise(function (resolve, reject) {
    canvas.toBlob(function (blob) {
      if (!blob) {
        reject(new Error('Failed to encode capture.'));
        return;
      }
      blob.arrayBuffer()
        .then(function (arrayBuffer) {
          resolve(Buffer.from(arrayBuffer));
        })
        .catch(reject);
    }, mimeType);
  });
}

async function handleStart(_event, payload) {
  const requestId = payload?.requestId;
  if (!requestId) {
    return;
  }

  if (currentCapture) {
    sendStatus(requestId, 'error', { message: 'Capture already in progress.' });
    return;
  }

  try {
    sendStatus(requestId, 'received');
    const { sourceId, captureWidth, captureHeight, format } = payload || {};
    if (!sourceId || !captureWidth || !captureHeight) {
      throw new Error('Missing capture parameters.');
    }

    const stream = await Promise.race([
      navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: sourceId,
            minWidth: captureWidth,
            maxWidth: captureWidth,
            minHeight: captureHeight,
            maxHeight: captureHeight,
            minFrameRate: 1,
            maxFrameRate: 1
          }
        }
      }),
      new Promise(function (_resolve, reject) {
        setTimeout(function () {
          reject(new Error('Timed out starting capture. Check Screen Recording permission.'));
        }, START_TIMEOUT_MS);
      })
    ]);

    const video = document.createElement('video');
    video.srcObject = stream;
    video.muted = true;
    video.playsInline = true;

    await video.play();
    await waitForVideoReady(video);

    const canvas = document.createElement('canvas');
    canvas.width = captureWidth;
    canvas.height = captureHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: false });
    if (!ctx) {
      throw new Error('Failed to create capture canvas.');
    }

    currentCapture = {
      stream,
      video,
      canvas,
      ctx,
      format: format || 'webp',
      captureInProgress: false
    };

    sendStatus(requestId, 'started');
  } catch (error) {
    cleanupCapture();
    sendStatus(requestId, 'error', { message: error.message || 'Failed to start capture.' });
  }
}

async function handleCapture(_event, payload) {
  const requestId = payload?.requestId;
  if (!requestId) {
    return;
  }

  if (!currentCapture?.ctx || !currentCapture?.canvas || !currentCapture?.video) {
    sendStatus(requestId, 'error', { message: 'Capture is not active.' });
    return;
  }

  if (currentCapture.captureInProgress) {
    sendStatus(requestId, 'error', { message: 'Capture already in progress.' });
    return;
  }

  const filePath = payload?.filePath;
  if (!filePath) {
    sendStatus(requestId, 'error', { message: 'Missing capture output path.' });
    return;
  }

  currentCapture.captureInProgress = true;
  try {
    const { ctx, canvas, video, format } = currentCapture;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const buffer = await canvasToBuffer(canvas, format);
    await fs.promises.writeFile(filePath, buffer);
    sendStatus(requestId, 'captured', { filePath });
  } catch (error) {
    sendStatus(requestId, 'error', { message: error.message || 'Failed to capture still.' });
  } finally {
    if (currentCapture) {
      currentCapture.captureInProgress = false;
    }
  }
}

function handleStop(_event, payload) {
  const requestId = payload?.requestId;
  if (!requestId) {
    return;
  }

  if (!currentCapture) {
    sendStatus(requestId, 'error', { message: 'No active capture.' });
    return;
  }

  cleanupCapture();
  sendStatus(requestId, 'stopped');
}

ipcRenderer.send('screen-stills:ready');

ipcRenderer.on('screen-stills:start', handleStart);
ipcRenderer.on('screen-stills:capture', handleCapture);
ipcRenderer.on('screen-stills:stop', handleStop);
