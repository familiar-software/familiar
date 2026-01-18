# Jiminy Desktop App

Menu bar app shell for Jiminy (macOS only).

## Run

```bash
npm install
npm start
```

## Tests

```bash
npm test
```

## E2E Tests (Playwright)

```bash
npm run test:e2e
```

E2E helpers:

- `JIMINY_E2E=1` opens the Settings window on launch and bypasses native dialogs.
- `JIMINY_E2E_CONTEXT_PATH` supplies the folder picker result.
- `JIMINY_SETTINGS_DIR` overrides the settings storage directory.

## Notes

- The app runs from the macOS menu bar with a Settings window that stores the Context Folder Path in `~/.jiminy/settings.json`.
- Auto-launch on login is enabled via Electron login item settings.

## License

[CC0 1.0 (Public Domain)](LICENSE.md)
