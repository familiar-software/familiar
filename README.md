<p align="center">
   <img src="./src/icon.png" width="96" alt="Familiar icon" />
</p>

<h1 align="center">Familiar: Invite AI to sit next to you.</h1>

<p align="center">
  <a href="https://github.com/familiar-software/familiar/blob/main/LICENSE"><img src="https://img.shields.io/badge/License-GPL--3.0-blue" alt="GPL-3.0 License" /></a>
</p>

Familiar turns everything on your screen and clipboard into context for your existing AI.

Free, open source, and offline. Nothing leaves your machine.

## Website

**[looksfamiliar.org](https://looksfamiliar.org)**

## Where Familiar writes data

- Settings: `~/.familiar/settings.json`
- Captured still images: `<contextFolderPath>/familiar/stills/`
- Extracted markdown for captured still images: `<contextFolderPath>/familiar/stills-markdown/`
- Clipboard text mirrors while recording: `<contextFolderPath>/familiar/stills-markdown/<sessionId>/<timestamp>.clipboard.txt`
- Before still markdown and clipboard text are written, Familiar runs `rg`-based redaction for password/API-key patterns. If the scanner fails twice, Familiar still saves the file and shows a one-time warning toast per recording session.

## Build locally

```bash
git clone https://github.com/familiar-software/familiar.git
cd familiar
npm install
npm start
```

Create local macOS build artifacts:

```bash
npm run dist:mac
```

`npm run dist:mac*` includes `npm run build:rg-bundle`, which prepares `scripts/bin/rg/*` and packages it into Electron resources at `resources/rg/`.

`build-rg-bundle.sh` downloads official ripgrep binaries when missing (or copies from `FAMILIAR_RG_DARWIN_ARM64_SOURCE` / `FAMILIAR_RG_DARWIN_X64_SOURCE` if provided). The binaries are generated locally and are not committed.

## Contributing

### Microcopy source of truth

- User-facing app microcopy is centralized in `src/microcopy/index.js`.
- Update copy there instead of editing scattered strings across tray/dashboard modules.

For development contributions:

```bash
npm test
npm run test:unit:timed
npm run test:modelProviderTests
npm run test:e2e
```

Open a PR with a clear description, tests for behavior changes, and any relevant README/docs updates.
