const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const resetLoggerModule = () => {
    const loggerPath = require.resolve('../src/logger');
    delete require.cache[loggerPath];
};

test('initLogging writes logs under settings directory', async () => {
    const tempSettingsDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'jiminy-settings-'));
    const previousSettingsDir = process.env.JIMINY_SETTINGS_DIR;
    process.env.JIMINY_SETTINGS_DIR = tempSettingsDir;

    const originalConsole = {
        log: console.log,
        info: console.info,
        warn: console.warn,
        error: console.error,
    };

    resetLoggerModule();

    try {
        const { initLogging } = require('../src/logger');
        initLogging();

        console.log('logger test message');

        const logPath = path.join(tempSettingsDir, 'logs', 'jiminy.log');
        assert.equal(fs.existsSync(logPath), true);

        const contents = await fs.promises.readFile(logPath, 'utf-8');
        assert.ok(contents.includes('logger test message'));
    } finally {
        console.log = originalConsole.log;
        console.info = originalConsole.info;
        console.warn = originalConsole.warn;
        console.error = originalConsole.error;
        resetLoggerModule();
        if (typeof previousSettingsDir === 'undefined') {
            delete process.env.JIMINY_SETTINGS_DIR;
        } else {
            process.env.JIMINY_SETTINGS_DIR = previousSettingsDir;
        }
    }
});

test('initLogging rotates logs when size exceeds limit', async () => {
    const tempSettingsDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'jiminy-settings-'));
    const previousSettingsDir = process.env.JIMINY_SETTINGS_DIR;
    const previousLogLimit = process.env.JIMINY_LOG_MAX_BYTES;
    process.env.JIMINY_SETTINGS_DIR = tempSettingsDir;
    process.env.JIMINY_LOG_MAX_BYTES = '1024';

    const originalConsole = {
        log: console.log,
        info: console.info,
        warn: console.warn,
        error: console.error,
    };

    resetLoggerModule();

    try {
        const { initLogging } = require('../src/logger');
        initLogging();

        const largePayload = 'x'.repeat(1200);
        console.log(largePayload);
        console.log('rotation-trigger');

        const logPath = path.join(tempSettingsDir, 'logs', 'jiminy.log');
        const rotatedPath = path.join(tempSettingsDir, 'logs', 'jiminy.log.1');

        assert.equal(fs.existsSync(rotatedPath), true);
        assert.equal(fs.existsSync(logPath), true);

        const rotatedContents = await fs.promises.readFile(rotatedPath, 'utf-8');
        assert.ok(rotatedContents.includes(largePayload));
    } finally {
        console.log = originalConsole.log;
        console.info = originalConsole.info;
        console.warn = originalConsole.warn;
        console.error = originalConsole.error;
        resetLoggerModule();
        if (typeof previousSettingsDir === 'undefined') {
            delete process.env.JIMINY_SETTINGS_DIR;
        } else {
            process.env.JIMINY_SETTINGS_DIR = previousSettingsDir;
        }
        if (typeof previousLogLimit === 'undefined') {
            delete process.env.JIMINY_LOG_MAX_BYTES;
        } else {
            process.env.JIMINY_LOG_MAX_BYTES = previousLogLimit;
        }
    }
});

test('initLogging reports write failures to stderr', async () => {
    const tempSettingsDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'jiminy-settings-'));
    const previousSettingsDir = process.env.JIMINY_SETTINGS_DIR;
    process.env.JIMINY_SETTINGS_DIR = tempSettingsDir;

    const originalConsole = {
        log: console.log,
        info: console.info,
        warn: console.warn,
        error: console.error,
    };

    const originalAppendFileSync = fs.appendFileSync;
    const originalStderrWrite = process.stderr.write;
    const stderrLines = [];

    resetLoggerModule();

    try {
        fs.appendFileSync = () => {
            const error = new Error('disk full');
            error.code = 'ENOSPC';
            throw error;
        };
        process.stderr.write = (chunk) => {
            stderrLines.push(chunk.toString());
            return true;
        };

        const { initLogging } = require('../src/logger');
        initLogging();

        console.log('logger test message');

        assert.ok(stderrLines.some((line) => line.includes('Failed to write log line')));
    } finally {
        fs.appendFileSync = originalAppendFileSync;
        process.stderr.write = originalStderrWrite;
        console.log = originalConsole.log;
        console.info = originalConsole.info;
        console.warn = originalConsole.warn;
        console.error = originalConsole.error;
        resetLoggerModule();
        if (typeof previousSettingsDir === 'undefined') {
            delete process.env.JIMINY_SETTINGS_DIR;
        } else {
            process.env.JIMINY_SETTINGS_DIR = previousSettingsDir;
        }
    }
});
