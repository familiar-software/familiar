const { contextBridge, ipcRenderer } = require('electron');
const fs = require('node:fs');
const microcopy = ipcRenderer.sendSync('microcopy:get-sync');
if (microcopy && typeof microcopy === 'object') {
  contextBridge.exposeInMainWorld('FamiliarMicrocopySource', {
    microcopy
  });
}

let currentCapture = null;

function sendStatus(requestId, status, payload = {}) {
  ipcRenderer.send('screen-stills:status', {
    requestId,
    status,
    ...payload
  });
}

function cleanupCapture() {
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

function createCanvas(width, height) {
  const captureWidth = Math.max(1, Math.round(Number(width)));
  const captureHeight = Math.max(1, Math.round(Number(height)));
  const canvas = document.createElement('canvas');
  canvas.width = captureWidth;
  canvas.height = captureHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: false });
  if (!ctx) {
    throw new Error('Failed to create capture canvas.');
  }
  return { canvas, ctx, captureWidth, captureHeight };
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

function normalizeThumbnailBytes(thumbnailBytes) {
  if (!thumbnailBytes) {
    return null;
  }
  if (thumbnailBytes instanceof ArrayBuffer) {
    return new Uint8Array(thumbnailBytes);
  }
  if (ArrayBuffer.isView(thumbnailBytes)) {
    return new Uint8Array(
      thumbnailBytes.buffer,
      thumbnailBytes.byteOffset,
      thumbnailBytes.byteLength
    );
  }
  if (Array.isArray(thumbnailBytes)) {
    return new Uint8Array(thumbnailBytes);
  }
  if (thumbnailBytes && thumbnailBytes.type === 'Buffer' && Array.isArray(thumbnailBytes.data)) {
    return new Uint8Array(thumbnailBytes.data);
  }
  return null;
}

function looksLikePng(thumbnailBytes) {
  if (!(thumbnailBytes instanceof Uint8Array) || thumbnailBytes.length < 8) {
    return false;
  }
  return (
    thumbnailBytes[0] === 0x89 &&
    thumbnailBytes[1] === 0x50 &&
    thumbnailBytes[2] === 0x4e &&
    thumbnailBytes[3] === 0x47 &&
    thumbnailBytes[4] === 0x0d &&
    thumbnailBytes[5] === 0x0a &&
    thumbnailBytes[6] === 0x1a &&
    thumbnailBytes[7] === 0x0a
  );
}

function normalizeDataUrl(dataUrl) {
  if (typeof dataUrl !== 'string') {
    return null;
  }

  const fixed = dataUrl.trim().replace(';base6,', ';base64,');
  const match = /^data:image\/([^;]+);base64,([A-Za-z0-9+/=\s]*)$/i.exec(fixed);
  if (!match) {
    return null;
  }

  const mime = match[1].toLowerCase();
  const base64Payload = match[2].replace(/\s/g, '');
  if (!base64Payload) {
    return null;
  }

  return `data:image/${mime};base64,${base64Payload}`;
}

function decodeImageFromBlob(blob) {
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(blob)
      .then(function (bitmap) {
        return bitmap;
      })
      .catch(function (error) {
        return Promise.reject(new Error(error?.message || 'Failed to decode capture thumbnail.'));
      });
  }

  return new Promise(function (resolve, reject) {
    const objectUrl = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = function () {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = function () {
      URL.revokeObjectURL(objectUrl);
      reject(new Error(`Failed to decode capture thumbnail (${blob.size} bytes).`));
    };
    image.src = objectUrl;
  });
}

function decodeCaptureThumbnailFromDataUrl(dataUrl) {
  const normalizedDataUrl = normalizeDataUrl(dataUrl);
  if (!normalizedDataUrl) {
    return Promise.reject(new Error('Unsupported capture thumbnail format.'));
  }

  return new Promise(function (resolve, reject) {
    const image = new Image();
    image.onload = function () {
      resolve(image);
    };
    image.onerror = function () {
      reject(new Error(`Failed to decode capture thumbnail (${normalizedDataUrl.substring(0, 20)}).`));
    };
    image.src = normalizedDataUrl;
  });
}

function decodeCaptureThumbnailFromBytes(thumbnailBytes) {
  const normalizedBytes = normalizeThumbnailBytes(thumbnailBytes);
  if (!normalizedBytes || !normalizedBytes.byteLength) {
    return Promise.reject(new Error('Unsupported capture thumbnail bytes.'));
  }
  if (!looksLikePng(normalizedBytes)) {
    return Promise.reject(new Error('Capture thumbnail bytes are not valid PNG.'));
  }
  const blob = new Blob([normalizedBytes], { type: 'image/png' });
  return decodeImageFromBlob(blob);
}

function decodeCaptureThumbnail(payload) {
  if (typeof payload === 'string') {
    return decodeCaptureThumbnailFromDataUrl(payload);
  }
  return decodeCaptureThumbnailFromBytes(payload);
}

function applyCaptureDimensions(width, height) {
  if (!currentCapture) {
    return;
  }

  const captureWidth = Math.max(1, Math.round(Number(width)));
  const captureHeight = Math.max(1, Math.round(Number(height)));
  if (currentCapture.captureWidth !== captureWidth || currentCapture.captureHeight !== captureHeight) {
    const created = createCanvas(captureWidth, captureHeight);
    currentCapture.canvas = created.canvas;
    currentCapture.ctx = created.ctx;
    currentCapture.captureWidth = created.captureWidth;
    currentCapture.captureHeight = created.captureHeight;
  }
}

async function handleStart(_event, payload) {
  const requestId = payload?.requestId;
  if (!requestId) {
    return;
  }

  if (currentCapture) {
    cleanupCapture();
  }

  try {
    sendStatus(requestId, 'received');
    const { sourceId, captureWidth, captureHeight, format } = payload || {};
    if (!sourceId || !captureWidth || !captureHeight) {
      throw new Error('Missing capture parameters.');
    }

    const created = createCanvas(captureWidth, captureHeight);
    currentCapture = {
      sourceId,
      captureWidth: created.captureWidth,
      captureHeight: created.captureHeight,
      canvas: created.canvas,
      ctx: created.ctx,
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

  if (!currentCapture?.ctx || !currentCapture?.canvas) {
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

  const thumbnailBytes = payload?.thumbnailPng;
  const thumbnailDataUrl = payload?.thumbnailDataUrl;
  if (
    !thumbnailBytes &&
    !thumbnailDataUrl
  ) {
    sendStatus(requestId, 'error', { message: 'Missing capture thumbnail data.' });
    return;
  }

  const nextWidth = payload?.captureWidth || currentCapture.captureWidth;
  const nextHeight = payload?.captureHeight || currentCapture.captureHeight;

  currentCapture.captureInProgress = true;
  try {
    applyCaptureDimensions(nextWidth, nextHeight);
    if (!currentCapture?.ctx || !currentCapture?.canvas) {
      throw new Error('Capture is not active.');
    }

    const format = payload?.format || currentCapture.format;
    currentCapture.format = format || 'webp';

    let image = null;
    if (thumbnailBytes) {
      try {
        image = await decodeCaptureThumbnailFromBytes(thumbnailBytes);
      } catch (decodeError) {
        if (!thumbnailDataUrl) {
          throw decodeError;
        }
      }
    }

    if (!image) {
      image = await decodeCaptureThumbnail(thumbnailDataUrl);
    }

    currentCapture.ctx.clearRect(0, 0, currentCapture.canvas.width, currentCapture.canvas.height);
    currentCapture.ctx.drawImage(image, 0, 0, currentCapture.canvas.width, currentCapture.canvas.height);

    const buffer = await canvasToBuffer(currentCapture.canvas, currentCapture.format);
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
