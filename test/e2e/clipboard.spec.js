const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test, expect } = require('playwright/test');
const { _electron: electron } = require('playwright');
const { CAPTURES_DIR_NAME, JIMINY_BEHIND_THE_SCENES_DIR_NAME, GENERAL_ANALYSIS_DIR_NAME } = require('../../src/const');

test.describe('clipboard capture flow', () => {
    test('empty clipboard shows warning notification', async () => {
        const appRoot = path.join(__dirname, '../..');
        const contextPath = fs.mkdtempSync(path.join(os.tmpdir(), 'jiminy-context-clipboard-'));
        const settingsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jiminy-settings-e2e-'));
        const launchArgs = ['.'];
        if (process.platform === 'linux' || process.env.CI) {
            launchArgs.push('--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage');
        }

        const electronApp = await electron.launch({
            args: launchArgs,
            cwd: appRoot,
            env: {
                ...process.env,
                JIMINY_E2E: '1',
                JIMINY_E2E_CONTEXT_PATH: contextPath,
                JIMINY_SETTINGS_DIR: settingsDir,
            },
        });

        try {
            // Mock clipboard to be empty
            await electronApp.evaluate(({ clipboard }) => {
                clipboard.readText = () => '';
            });

            const window = await electronApp.firstWindow();
            await window.waitForLoadState('domcontentloaded');

            // Set context folder first
            await window.locator('#context-folder-choose').click();
            await expect(window.locator('#context-folder-status')).toHaveText('Saved.');

            // Trigger clipboard capture
            const toastPromise = electronApp.waitForEvent('window');
            await electronApp.evaluate(async ({ app }) => {
                const clipboardCapture = process.mainModule.require(`${app.getAppPath()}/src/clipboard/capture`);
                return clipboardCapture.captureClipboard();
            });

            const toastWindow = await toastPromise;
            await toastWindow.waitForLoadState('domcontentloaded');

            // Verify warning toast
            await expect(toastWindow.locator('#title')).toHaveText('Clipboard Empty');
            await expect(toastWindow.locator('#body')).toHaveText('No text content in clipboard to capture.');
        } finally {
            await electronApp.close();
        }
    });

    test('clipboard with content shows initial notification', async () => {
        const appRoot = path.join(__dirname, '../..');
        const contextPath = fs.mkdtempSync(path.join(os.tmpdir(), 'jiminy-context-clipboard-'));
        const settingsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jiminy-settings-e2e-'));
        const launchArgs = ['.'];
        if (process.platform === 'linux' || process.env.CI) {
            launchArgs.push('--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage');
        }

        const electronApp = await electron.launch({
            args: launchArgs,
            cwd: appRoot,
            env: {
                ...process.env,
                JIMINY_E2E: '1',
                JIMINY_E2E_CONTEXT_PATH: contextPath,
                JIMINY_SETTINGS_DIR: settingsDir,
                // No LLM mock - analysis won't run, so initial toast won't be replaced
            },
        });

        try {
            const clipboardText = 'This is test clipboard content for analysis.';

            // Mock clipboard to have content
            await electronApp.evaluate(({ clipboard }, text) => {
                clipboard.readText = () => text;
            }, clipboardText);

            const window = await electronApp.firstWindow();
            await window.waitForLoadState('domcontentloaded');

            // Set context folder only (no LLM provider, so analysis will be skipped)
            await window.locator('#context-folder-choose').click();
            await expect(window.locator('#context-folder-status')).toHaveText('Saved.');

            // Set up promise to catch the toast window BEFORE triggering capture
            const toastPromise = electronApp.waitForEvent('window');

            // Trigger clipboard capture - don't await the result, let it run async
            electronApp.evaluate(({ app }) => {
                const clipboardCapture = process.mainModule.require(`${app.getAppPath()}/src/clipboard/capture`);
                clipboardCapture.captureClipboard();
            });

            // Get the toast window as soon as it appears
            const toastWindow = await toastPromise;
            await toastWindow.waitForLoadState('domcontentloaded');

            // Verify initial toast shows capture confirmation
            await expect(toastWindow.locator('#title')).toHaveText('Clipboard Captured');
            await expect(toastWindow.locator('#body')).toHaveText('Text content saved and queued for analysis.');

            // Verify clipboard file was saved
            const capturesDir = path.join(contextPath, JIMINY_BEHIND_THE_SCENES_DIR_NAME, CAPTURES_DIR_NAME);
            await expect
                .poll(() => {
                    if (!fs.existsSync(capturesDir)) {
                        return 0;
                    }
                    return fs.readdirSync(capturesDir).filter((f) => f.startsWith('clipboard-') && f.endsWith('.md')).length;
                })
                .toBeGreaterThan(0);

            const clipboardFiles = fs.readdirSync(capturesDir).filter((f) => f.startsWith('clipboard-') && f.endsWith('.md'));
            expect(clipboardFiles.length).toBe(1);

            // Verify clipboard content was saved correctly
            const savedContent = fs.readFileSync(path.join(capturesDir, clipboardFiles[0]), 'utf-8');
            expect(savedContent).toBe(clipboardText);
        } finally {
            await electronApp.close();
        }
    });

    test('clipboard with content shows analysis complete notification with open location button', async () => {
        const appRoot = path.join(__dirname, '../..');
        const contextPath = fs.mkdtempSync(path.join(os.tmpdir(), 'jiminy-context-clipboard-'));
        const settingsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'jiminy-settings-e2e-'));
        const launchArgs = ['.'];
        if (process.platform === 'linux' || process.env.CI) {
            launchArgs.push('--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage');
        }

        const electronApp = await electron.launch({
            args: launchArgs,
            cwd: appRoot,
            env: {
                ...process.env,
                JIMINY_E2E: '1',
                JIMINY_E2E_CONTEXT_PATH: contextPath,
                JIMINY_SETTINGS_DIR: settingsDir,
                JIMINY_LLM_MOCK: '1',
                JIMINY_LLM_MOCK_TEXT: 'Test analysis summary',
            },
        });

        try {
            const clipboardText = 'This is test clipboard content for analysis.';

            // Mock clipboard to have content
            await electronApp.evaluate(({ clipboard }, text) => {
                clipboard.readText = () => text;
            }, clipboardText);

            const window = await electronApp.firstWindow();
            await window.waitForLoadState('domcontentloaded');

            // Set context folder and LLM provider
            await window.locator('#context-folder-choose').click();
            await expect(window.locator('#context-folder-status')).toHaveText('Saved.');
            await window.locator('#llm-provider').selectOption('gemini');
            await window.locator('#llm-api-key-save').click();

            // Trigger clipboard capture and wait for the full flow to complete
            // The toast window will be created (compact), then destroyed and recreated (large) for analysis toast
            // We need to wait for the second window creation
            let toastWindows = [];
            const windowHandler = (win) => toastWindows.push(win);
            electronApp.on('window', windowHandler);

            // Trigger clipboard capture
            electronApp.evaluate(({ app }) => {
                const clipboardCapture = process.mainModule.require(`${app.getAppPath()}/src/clipboard/capture`);
                clipboardCapture.captureClipboard();
            });

            // Wait for analysis to complete by checking for the analysis file
            const analysisDir = path.join(contextPath, GENERAL_ANALYSIS_DIR_NAME);
            await expect
                .poll(
                    () => {
                        if (!fs.existsSync(analysisDir)) {
                            return [];
                        }
                        return fs.readdirSync(analysisDir).filter((f) => f.endsWith('-analysis.md'));
                    },
                    { timeout: 30000 }
                )
                .toHaveLength(1);

            // Give a moment for the toast to appear after analysis completes
            await new Promise((resolve) => setTimeout(resolve, 500));

            // Get the most recent toast window (the analysis complete one)
            electronApp.off('window', windowHandler);
            const finalToastWindow = toastWindows[toastWindows.length - 1];
            expect(finalToastWindow).toBeDefined();

            await finalToastWindow.waitForLoadState('domcontentloaded');

            // Verify the final toast shows analysis complete
            await expect(finalToastWindow.locator('#title')).toHaveText('Analysis Complete');

            // Verify the final toast has the "Open in Folder" button
            const actionButton = finalToastWindow.locator('#actions button');
            await expect(actionButton).toBeVisible();
            await expect(actionButton).toHaveText('Open in Folder');

            // Verify the toast body contains the analysis path
            const bodyText = await finalToastWindow.locator('#body').textContent();
            expect(bodyText).toContain('Saved:');
            expect(bodyText).toContain('analysis.md');

            // Verify analysis file content
            const analysisFiles = fs.readdirSync(analysisDir).filter((f) => f.endsWith('-analysis.md'));
            const analysisContent = fs.readFileSync(path.join(analysisDir, analysisFiles[0]), 'utf-8');
            expect(analysisContent).toContain('Test analysis summary');

            // Verify clipboard file was also saved
            const capturesDir = path.join(contextPath, JIMINY_BEHIND_THE_SCENES_DIR_NAME, CAPTURES_DIR_NAME);
            const clipboardFiles = fs.readdirSync(capturesDir).filter((f) => f.startsWith('clipboard-') && f.endsWith('.md'));
            expect(clipboardFiles.length).toBe(1);
            const savedContent = fs.readFileSync(path.join(capturesDir, clipboardFiles[0]), 'utf-8');
            expect(savedContent).toBe(clipboardText);
        } finally {
            await electronApp.close();
        }
    });
});
