# Familiar Landing Page

This folder contains the GitHub Pages landing page for Familiar.

## Overview

The landing page provides:
- Auto-detected architecture downloads (Apple Silicon vs Intel)
- Feature highlights and benefits
- How-it-works guide with screenshots
- System requirements
- FAQ section
- Automatic version updates via GitHub Actions

## Structure

```
docs/
├── index.html          # Main landing page
├── input.css           # Tailwind source
├── styles.css          # Compiled Tailwind CSS (generated)
├── download.js         # Architecture detection logic
├── assets/
│   ├── familiar-icon.png        # App icon
│   ├── familiar-settings.png    # Settings screenshot
│   └── og-image.png            # Social preview (1200x630)
└── README.md           # This file
```

## Development

**Build CSS:**
```bash
npm run css:landing
```

**Watch mode (auto-rebuild on changes):**
```bash
npm run css:landing:watch
```

**Preview locally:**
Open `docs/index.html` in a browser.

## Deployment

The landing page is automatically deployed via GitHub Pages from the `docs/` folder on the `main` branch.

**Live URL:** https://familiar-software.github.io/familiar/

## Version Updates

Version numbers are automatically updated by `.github/workflows/update-landing-page.yml` when a new release is published.

The workflow updates:
- `docs/download.js` - CURRENT_VERSION constant
- `docs/index.html` - Version badges and links

## Architecture Detection

The page uses JavaScript to detect the user's Mac architecture (Apple Silicon vs Intel) and presents the correct download automatically.

**Fallbacks:**
- Non-Mac users see a "macOS only" message
- JavaScript-disabled users see both download options
- Users can always access the alternative download via "Need a different version?"

## Assets

**Required images:**
- `familiar-icon.png` - Copied from `src/icon.png`
- `familiar-settings.png` - Copied from `docs/readme/familiar-settings.png`
- `og-image.png` - Create a 1200x630px social preview image

To update assets, modify the originals and run:
```bash
cp src/icon.png docs/assets/familiar-icon.png
cp docs/readme/familiar-settings.png docs/assets/familiar-settings.png
```

## License

GPL-3.0-only (same as the main project)
