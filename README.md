# Familiar Desktop App

Menu bar app shell for Familiar (macOS only).

## Run

```bash
npm install
npm start
```

## Tests

```bash
npm test
npm run test:unit:timed
npm run test:modelProviderTests
```

-   `npm test` runs unit tests (excludes `test/modelProviderTests`).
-   `npm run test:unit:timed` runs unit tests and fails if they take longer than 2s (override with `FAMILIAR_UNIT_TEST_TIME_LIMIT_MS`).
-   `npm run test:modelProviderTests` runs live provider tests (requires `LLM_API_KEY`).

## E2E Tests (Playwright)

```bash
npm run test:e2e
```

E2E helpers:

-   `FAMILIAR_E2E=1` opens the Settings window on launch and bypasses native dialogs.
-   `FAMILIAR_E2E_CONTEXT_PATH` supplies the folder picker result.
-   `FAMILIAR_E2E_STILLS_INTERVAL_MS` overrides the still capture interval for E2E (milliseconds).
-   `FAMILIAR_E2E_PAUSE_MS` overrides the pause window for E2E (milliseconds).
-   `FAMILIAR_SETTINGS_DIR` overrides the settings storage directory.
-   `FAMILIAR_LLM_MOCK=1` replaces LLM calls with a mock summarizer/extractor.
-   `FAMILIAR_LLM_MOCK_TEXT` sets the mock summary text (default: `gibberish`).
-   On Linux CI/E2E runs (`FAMILIAR_E2E=1` or `CI=true`), the app disables GPU and sandbox flags to improve launch reliability.

## Run GitHub CI locally

Use `act` from the repo root to run the CI job:

```bash
act -W .github/workflows/ci.yml -s LLM_API_KEY=YOUR_KEY
```

## GitHub CI (exact run details)

CI runs on `ubuntu-latest` with Node.js 20 and uses the `code/desktopapp` working directory. Steps:

```bash
npm ci
npx playwright install --with-deps
npm test
npm run test:modelProviderTests
xvfb-run --auto-servernum -- npm run test:e2e
```

Environment:

-   `CI=true`
-   `LLM_API_KEY` from GitHub secrets (used by model provider tests)
-   E2E tests also launch Electron with `--no-sandbox --disable-gpu --disable-dev-shm-usage` on Linux/CI.
    -   `--no-sandbox`: required in many CI/container setups where the Chromium sandbox cannot initialize (no user namespaces).
    -   `--disable-gpu`: avoids GPU initialization failures under Xvfb/headless Linux.
    -   `--disable-dev-shm-usage`: avoids crashes when `/dev/shm` is tiny in containers (uses disk instead).

## Publish desktop release (manual)

The workflow `Publish Desktop Release` is a manual GitHub Actions job that builds the macOS artifacts and publishes them to `familiar`.

-   Workflow: `.github/workflows/release-desktopapp.yml`
-   Requires secret: `RELEASE_REPO_GITHUB_TOKEN`
-   The `RELEASE_REPO_GITHUB_TOKEN` secret must have `contents:write` access to `familiar-software/familiar`.
-   Uses `CSC_IDENTITY_AUTO_DISCOVERY=false` until signing/notarization is configured.
-   `npm run dist:mac` builds and publishes both macOS architectures (`arm64` and `x64`).
-   You can also build one architecture locally with `npm run dist:mac:arm64` or `npm run dist:mac:x64`.
-   Packaging scripts also run `npm run css:build` so dashboard Tailwind CSS is rebuilt before artifacts are produced.

## Notes

-   The app runs from the macOS menu bar with a Settings window that stores the Context Folder Path, stills extraction mode (AI vs local OCR), and optionally an LLM provider + API key in `~/.familiar/settings.json`.
-   The packaged app requires macOS 14.0+ (enforced via `LSMinimumSystemVersion`).
-   Dashboard onboarding layout is controlled by `wizardCompleted` in `~/.familiar/settings.json`: if missing/false, only Wizard is shown (sidebar hidden); if true, Settings opens in General, the Wizard tab is hidden, and standalone `Permissions`/`Install Skill` tabs are available.
-   The Settings wizard starts with Context Folder selection; the General tab lets you change it anytime.
-   Auto-launch on login is enabled via Electron login item settings.
-   The Settings window includes a **Recording** tab with an opt-in **Record while active** toggle plus manual pause/resume. When enabled (and permission granted), Familiar captures downsampled still images into `<contextFolderPath>/familiar/stills/session-<timestamp>/` with a `manifest.json` describing captures and stop reason. On multi-monitor setups, capture follows the display nearest the cursor.
-   While recording is active, clipboard text is mirrored to `<contextFolderPath>/familiar/stills-markdown/session-<timestamp>/<timestamp>.clipboard.txt`.
-   Global hotkeys trigger still capture pause/resume (`Command+R`) on macOS (Electron accelerator `CommandOrControl+R`).

## Local OCR (Apple Vision)

Recorded still images can be converted to markdown using local-only Apple Vision OCR (no API key).

Dev helper scripts (from repo root):

```bash
# Build the Apple Vision OCR helper binary (recommended for performance).
./code/desktopapp/scripts/build-apple-vision-ocr.sh

# Run OCR on a single image and write a `familiar-layout-v0` markdown file next to it.
node code/desktopapp/scripts/apple-vision-ocr-image-to-markdown.js /path/to/image.png
```

Packaging: the app needs to ship a native helper binary named `apple-vision-ocr` in the Electron `resources/` directory. This repo configures electron-builder `extraResources` to copy it from `code/desktopapp/scripts/bin/apple-vision-ocr` into `resources/apple-vision-ocr`.

The helper is implemented as a small Objective-C CLI (no Swift runtime dependencies), built as a universal binary (`arm64` + `x86_64`) with a macOS deployment target of 14.0.

The stills worker looks for the helper binary at:

- `FAMILIAR_APPLE_VISION_OCR_BINARY` (override), or
- `${process.resourcesPath}/apple-vision-ocr` (packaged app), or
- `<repoRoot>/code/desktopapp/scripts/bin/apple-vision-ocr` (dev).
