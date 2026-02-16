<p align="center">
   <img src="./src/icon.png" width="96" alt="Familiar icon" />
</p>

<h1 align="center">Familiar</h1>

<p align="center">
   <img src="./docs/readme/familiar-settings.png" alt="Familiar desktop app screenshot" width="100%" />
</p>

Familiar is a local-first macOS menu bar app that helps your AI stay up to date with what matters in your work.

It captures high-signal context from your screen activity and clipboard (when enabled), organizes it into local files, and makes that context available to your AI tools.

> macOS only for now (minimum supported version: macOS 14.0).
> Security model: equivalent to taking screenshots and saving files on your own Mac. Nothing leaves your Mac unless you tell it to.

## Why use Familiar

- Keep your AI context current without constant manual copy/paste.
- Get better answers grounded in what you actually worked on.
- See where your time and focus went across the week.
- Build a compounding memory layer over time: the more you work, the better your AI partner gets.
- Stay in control with a local-first model. Your context files live on your machine.

## Install (recommended): GitHub Releases

1. Open the releases page: `https://github.com/familiar-software/familiar/releases`
2. Download the latest `.dmg`:
   - `arm64` for Apple Silicon Macs (M1/M2/M3/M4)
   - `x64` for Intel Macs
3. Open the installer and move `Familiar.app` to `Applications`.
4. Launch Familiar and complete setup in Settings.

## First-time setup

1. Click the Familiar menu bar icon or Dock icon to open Settings.
2. Choose your **Context Folder Path** (must be an existing folder).
3. In **Capturing**, enable **Capture while active** and grant macOS Screen Recording permission.
4. Optional: add an LLM provider/API key for richer processing. Local OCR mode is available without an API key.

## Where Familiar writes data

- Settings: `~/.familiar/settings.json`
- Captured still images: `<contextFolderPath>/familiar/stills/`
- Extracted markdown and mirrored clipboard context: `<contextFolderPath>/familiar/stills-markdown/`

## Build locally (alternative)

If you prefer to run from source:

```bash
git clone https://github.com/familiar-software/familiar.git
cd familiar/code/desktopapp
npm install
npm start
```

Create local macOS build artifacts:

```bash
npm run dist:mac
```

## Contribution

For development contributions:

```bash
npm test
npm run test:unit:timed
npm run test:modelProviderTests
npm run test:e2e
```

Open a PR with a clear description, tests for behavior changes, and any relevant README/docs updates.
