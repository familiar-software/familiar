#!/usr/bin/env bash
# Wipe dev state, kill any lingering dev electron + tailwind processes,
# then launch a single fresh dev instance. For Claude's iteration loop —
# reused so that each "try this change" round is one command instead of
# hunting down stray processes by hand.
#
# Safety:
# - Refuses to run unless FAMILIAR_SETTINGS_DIR is set and contains
#   "familiar-dev". Otherwise we could nuke the user's real settings.
# - Only kills processes whose paths include this repo's desktopapp dir.

set -euo pipefail

if [[ -z "${FAMILIAR_SETTINGS_DIR:-}" ]]; then
  echo "Refusing to run: FAMILIAR_SETTINGS_DIR is not set." >&2
  exit 2
fi

case "$FAMILIAR_SETTINGS_DIR" in
  *familiar-dev*) ;;
  *)
    echo "Refusing to run: FAMILIAR_SETTINGS_DIR ($FAMILIAR_SETTINGS_DIR) doesn't look like a dev dir." >&2
    exit 2
    ;;
esac

REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# Kill electron/tailwind processes from THIS repo only. Leave the
# packaged Familiar (in /Applications) alone.
pkill -9 -f "${REPO_DIR}/node_modules/electron/dist/Electron.app" 2>/dev/null || true
pkill -9 -f "${REPO_DIR}.*tailwindcss" 2>/dev/null || true
sleep 1

# Wipe dev settings + the default storage dir if we created one.
rm -rf "$FAMILIAR_SETTINGS_DIR" "$HOME/familiar"

cd "$REPO_DIR"
exec npm run dev
