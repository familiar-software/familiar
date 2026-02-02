const { ipcRenderer } = require('electron');
const fs = require('node:fs');

const MIME_TYPE_CANDIDATES = [
  'video/mp4; codecs="avc1.42E01E"',
  'video/mp4; codecs="avc1.4D401E"',
  'video/mp4'
];

const START_TIMEOUT_MS = 8000;

let currentRecording = null;

function pickMimeType() {
  if (typeof MediaRecorder === 'undefined') {
    return '';
  }
  return MIME_TYPE_CANDIDATES.find(function (candidate) {
    return MediaRecorder.isTypeSupported(candidate);
  }) || '';
}

function sendStatus(requestId, status, payload = {}) {
  ipcRenderer.send('screen-recording:status', {
    requestId,
    status,
    ...payload
  });
}

function cleanupRecording() {
  if (currentRecording?.stream) {
    currentRecording.stream.getTracks().forEach(function (track) {
      track.stop();
    });
  }
  currentRecording = null;
}

async function handleStart(_event, payload) {
  const requestId = payload?.requestId;
  if (!requestId) {
    return;
  }

  if (currentRecording) {
    sendStatus(requestId, 'error', { message: 'Recording already in progress.' });
    return;
  }

  try {
    sendStatus(requestId, 'received');
    const mimeType = pickMimeType();
    if (!mimeType) {
      throw new Error('MP4 MediaRecorder not supported on this system.');
    }

    const { sourceId, captureWidth, captureHeight, fps, filePath } = payload || {};
    if (!sourceId || !filePath) {
      throw new Error('Missing recording parameters.');
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
            minFrameRate: fps,
            maxFrameRate: fps
          }
        }
      }),
      new Promise(function (_resolve, reject) {
        setTimeout(function () {
          reject(new Error('Timed out starting capture. Check Screen Recording permission.'));
        }, START_TIMEOUT_MS);
      })
    ]);

    const chunks = [];
    const recorder = new MediaRecorder(stream, { mimeType });

    currentRecording = {
      stream,
      recorder,
      chunks,
      filePath,
      mimeType,
      stopRequestId: null,
      startedAt: Date.now()
    };

    recorder.ondataavailable = function (event) {
      if (event.data && event.data.size > 0) {
        chunks.push(event.data);
      }
    };

    recorder.onerror = function (event) {
      const message = event?.error?.message || 'Recorder error.';
      const errorRequestId = currentRecording?.stopRequestId || requestId;
      sendStatus(errorRequestId, 'error', { message });
      cleanupRecording();
    };

    recorder.onstop = async function () {
      const stopRequestId = currentRecording?.stopRequestId || requestId;
      try {
        const blob = new Blob(chunks, { type: mimeType });
        const buffer = Buffer.from(await blob.arrayBuffer());
        await fs.promises.writeFile(filePath, buffer);
        const durationMs = Date.now() - currentRecording.startedAt;
        sendStatus(stopRequestId, 'stopped', { filePath, durationMs });
      } catch (error) {
        sendStatus(stopRequestId, 'error', { message: error.message || 'Failed to write recording.' });
      } finally {
        cleanupRecording();
      }
    };

    recorder.start();
    sendStatus(requestId, 'started', { mimeType });
  } catch (error) {
    cleanupRecording();
    sendStatus(requestId, 'error', { message: error.message || 'Failed to start recording.' });
  }
}

function handleStop(_event, payload) {
  const requestId = payload?.requestId;
  if (!requestId) {
    return;
  }

  if (!currentRecording?.recorder) {
    sendStatus(requestId, 'error', { message: 'No active recording.' });
    return;
  }

  currentRecording.stopRequestId = requestId;
  currentRecording.recorder.stop();
}

ipcRenderer.send('screen-recording:ready');

ipcRenderer.on('screen-recording:start', handleStart);
ipcRenderer.on('screen-recording:stop', handleStop);
