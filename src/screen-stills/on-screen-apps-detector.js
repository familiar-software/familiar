const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { normalizeAppString, unionStringLists } = require('../utils/strings');

const execFileAsync = promisify(execFile);

const DEFAULT_MIN_VISIBLE_AREA = 3000;
const DEFAULT_ARGS = ['--json', '--min-visible-area', String(DEFAULT_MIN_VISIBLE_AREA)];
const FILE_EXISTS_OPTIONS = fs.constants.F_OK;

const fileExists = async (candidatePath) => {
  if (!candidatePath) {
    return false;
  }
  try {
    await fs.promises.access(candidatePath, FILE_EXISTS_OPTIONS);
    return true;
  } catch (_error) {
    return false;
  }
};

const normalizeWindowCandidate = (candidate) => {
  if (!candidate || typeof candidate !== 'object') {
    return null;
  }

  const name = normalizeAppString(candidate.name, '');
  const bundleId = normalizeAppString(candidate.bundleId, '');
  const title = normalizeAppString(candidate.title, '');
  const active = candidate.active === true;
  const pid = Number.isFinite(candidate.pid) ? Number(candidate.pid) : null;

  if (!name && !bundleId && !title) {
    return null;
  }

  return { name, bundleId, title, pid, active };
};

const resolveActiveWindowBinaryPath = async ({ logger = console } = {}) => {
  const envOverride = process.env.FAMILIAR_LIST_ON_SCREEN_APPS_BINARY;
  if (await fileExists(envOverride)) {
    return envOverride;
  }

  const resourcesPath = typeof process.resourcesPath === 'string' ? process.resourcesPath : '';
  if (resourcesPath) {
    const packagedCandidate = path.join(resourcesPath, 'list-on-screen-apps-helper');
    if (await fileExists(packagedCandidate)) {
      return packagedCandidate;
    }
  }

  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
  const desktopAppCandidate = path.join(
    repoRoot,
    'code',
    'desktopapp',
    'scripts',
    'bin',
    'list-on-screen-apps-helper'
  );
  if (await fileExists(desktopAppCandidate)) {
    return desktopAppCandidate;
  }

  const devCandidate = path.join(
    repoRoot,
    'scripts',
    'bin',
    'list-on-screen-apps-helper'
  );
  if (await fileExists(devCandidate)) {
    return devCandidate;
  }

  logger.warn('list-on-screen-apps helper binary not found', {
    env: envOverride || null,
    resourcesPath: resourcesPath || null,
    desktopAppCandidate,
    devCandidate
  });
  return '';
};

const extractVisibleWindowNames = (windows) => {
  if (!Array.isArray(windows)) {
    return [];
  }

  const seen = new Set();
  const names = [];

  for (const candidate of windows) {
    if (!candidate || typeof candidate !== 'object') {
      continue;
    }

    const name = candidate.name;
    if (typeof name !== 'string' || name.length === 0 || seen.has(name)) {
      continue;
    }
    seen.add(name);
    names.push(name);
  }

  return names;
};

const parseWindowList = (value) => {
  if (!value || typeof value !== 'string') {
    return [];
  }

  let parsed = null;
  try {
    parsed = JSON.parse(value);
  } catch (_error) {
    return [];
  }

  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed
    .map(normalizeWindowCandidate)
    .filter((candidate) => candidate !== null);
};

const runWindowList = async ({ binaryPath, args = DEFAULT_ARGS, logger = console }) => {
  if (!binaryPath) {
    throw new Error('list-on-screen-apps helper binary path required.');
  }

  const resolvedArgs = Array.isArray(args) && args.length > 0 ? args : DEFAULT_ARGS;
  const { stdout } = await execFileAsync(binaryPath, resolvedArgs, {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 20
  });

  const windows = parseWindowList(stdout);
  if (!Array.isArray(windows)) {
    logger.warn('Unexpected on-screen app helper output format', {
      outputType: typeof stdout
    });
    return [];
  }

  return windows;
};

const pickActiveWindow = (windows) => {
  const candidate = windows.find((window) => window?.active === true);
  if (candidate) {
    return candidate;
  }

  return null;
};

const isSameActiveWindow = (leftWindow, rightWindow) => {
  return (
    normalizeAppString(leftWindow?.bundleId, null) === normalizeAppString(rightWindow?.bundleId, null) &&
    normalizeAppString(leftWindow?.name, null) === normalizeAppString(rightWindow?.name, null) &&
    normalizeAppString(leftWindow?.title, null) === normalizeAppString(rightWindow?.title, null)
  );
};

const detectWindowSnapshot = async ({ activeWindowDetector: detector } = {}) => {
  let candidates = [];
  if (typeof detector?.detectWindowCandidates === 'function') {
    candidates = await detector.detectWindowCandidates();
  } else if (typeof detector?.detectActiveWindow === 'function') {
    const activeWindow = await detector.detectActiveWindow();
    candidates = activeWindow ? [activeWindow] : [];
  }

  const safeCandidates = Array.isArray(candidates) ? candidates : [];
  return {
    visibleWindowNames: extractVisibleWindowNames(safeCandidates),
    activeWindow: pickActiveWindow(safeCandidates)
  };
};

const resolveCaptureAppContext = ({ beforeSnapshot, afterSnapshot, logger } = {}) => {
  const beforeWindow = beforeSnapshot?.activeWindow || null;
  const afterWindow = afterSnapshot?.activeWindow || null;
  const beforeVisibleWindowNames = beforeSnapshot?.visibleWindowNames;
  const afterVisibleWindowNames = afterSnapshot?.visibleWindowNames;
  const unchanged = isSameActiveWindow(beforeWindow, afterWindow);
  if (!unchanged && logger && typeof logger.warn === 'function') {
    logger.warn('Active window changed between pre/post still capture detection', {
      beforeAppName: beforeWindow?.name || null,
      afterAppName: afterWindow?.name || null
    });
  }
  const activeWindow = unchanged ? (afterWindow || beforeWindow) : null;
  const appName = normalizeAppString(activeWindow?.name, null);
  const appBundleId = normalizeAppString(activeWindow?.bundleId, null);
  const appTitle = normalizeAppString(activeWindow?.title, null);
  const appLabelSource = unchanged && afterWindow ? 'after' : unchanged && beforeWindow ? 'before' : null;

  const missingFieldValues = [];
  if (appName === null) {
    missingFieldValues.push('appName');
  }
  if (appBundleId === null) {
    missingFieldValues.push('appBundleId');
  }
  if (appTitle === null) {
    missingFieldValues.push('appTitle');
  }

  if (logger && typeof logger.warn === 'function' && activeWindow && missingFieldValues.length > 0) {
    logger.warn('Active window metadata contained missing values after normalization', {
      missingFieldValues,
      beforeWindow: beforeWindow || null,
      afterWindow: afterWindow || null
    });
  }

  return {
    appName,
    appBundleId,
    appTitle,
    appLabelSource,
    visibleWindowNames: unionStringLists(beforeVisibleWindowNames, afterVisibleWindowNames)
  };
};

const createActiveWindowDetector = ({
  logger = console,
  resolveBinaryPathImpl = resolveActiveWindowBinaryPath,
  runWindowListImpl = runWindowList
} = {}) => {
  let binaryPathPromise = null;

  const resolveBinaryPathOnce = async () => {
    if (!binaryPathPromise) {
      binaryPathPromise = resolveBinaryPathImpl({ logger });
    }
    return binaryPathPromise;
  };

  const detectActiveWindow = async () => {
    const binaryPath = await resolveBinaryPathOnce();
    if (!binaryPath) {
      throw new Error(
        'list-on-screen-apps helper missing; build it and ensure it is shipped with the app.'
      );
    }

    const windows = await runWindowListImpl({ binaryPath, logger, args: DEFAULT_ARGS });
    const candidate = pickActiveWindow(windows);
    if (!candidate) {
      throw new Error('No active window detected from helper output.');
    }

    return candidate;
  };

  const detectWindowCandidates = async () => {
    const binaryPath = await resolveBinaryPathOnce();
    if (!binaryPath) {
      throw new Error(
        'list-on-screen-apps helper missing; build it and ensure it is shipped with the app.'
      );
    }

    return runWindowListImpl({ binaryPath, logger, args: DEFAULT_ARGS });
  };

  const detectVisibleWindowNames = async () => {
    const candidates = await detectWindowCandidates();
    return extractVisibleWindowNames(candidates);
  };

  return {
    detectActiveWindow,
    detectWindowCandidates,
    detectVisibleWindowNames,
    resolveBinaryPath: resolveBinaryPathOnce
  };
};

module.exports = {
  DEFAULT_ARGS,
  extractVisibleWindowNames,
  createActiveWindowDetector,
  DEFAULT_MIN_VISIBLE_AREA,
  parseWindowList,
  pickActiveWindow,
  resolveActiveWindowBinaryPath,
  runWindowList,
  isSameActiveWindow,
  detectWindowSnapshot,
  resolveCaptureAppContext
};
