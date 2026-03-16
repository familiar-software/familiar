#!/usr/bin/env node

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT_DIR = path.resolve(__dirname, '..');
const TEST_DIR = path.join(ROOT_DIR, 'test');
const DEFAULT_LIMIT_MS = 5000;
const TIME_LIMIT_MS = Number.parseFloat(
  process.env.FAMILIAR_UNIT_TEST_TIME_LIMIT_MS ?? `${DEFAULT_LIMIT_MS}`
);

if (!Number.isFinite(TIME_LIMIT_MS) || TIME_LIMIT_MS <= 0) {
  console.error(
    `Invalid FAMILIAR_UNIT_TEST_TIME_LIMIT_MS: ${process.env.FAMILIAR_UNIT_TEST_TIME_LIMIT_MS}`
  );
  process.exit(1);
}

const EXCLUDED_DIRS = new Set(['e2e']);

function collectTestFiles(dirPath) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) {
        continue;
      }
      files.push(...collectTestFiles(entryPath));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith('.test.js')) {
      files.push(entryPath);
    }
  }

  return files;
}

if (!fs.existsSync(TEST_DIR)) {
  console.error(`Test directory not found: ${TEST_DIR}`);
  process.exit(1);
}

const testFiles = collectTestFiles(TEST_DIR);

if (testFiles.length === 0) {
  console.error('No unit test files found.');
  process.exit(1);
}

const startTime = process.hrtime.bigint();
const child = spawn(process.execPath, ['--test', ...testFiles], {
  stdio: 'inherit',
  cwd: ROOT_DIR,
});

child.on('error', (error) => {
  console.error(`Failed to start unit tests: ${error.message}`);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  const elapsedMs = Number(process.hrtime.bigint() - startTime) / 1e6;
  const elapsedLabel = `${elapsedMs.toFixed(0)}ms`;

  console.info(`Unit tests finished in ${elapsedLabel}.`);

  if (signal) {
    console.error(`Unit tests terminated with signal ${signal}.`);
    process.exit(1);
  }

  if (elapsedMs > TIME_LIMIT_MS) {
    console.error(
      `Unit tests exceeded ${TIME_LIMIT_MS}ms (took ${elapsedLabel}).`
    );
    process.exit(code === 0 || code == null ? 1 : code);
  }

  if (code !== 0) {
    process.exit(code == null ? 1 : code);
  }
});
