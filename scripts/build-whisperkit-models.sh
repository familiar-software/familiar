#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "Skipping WhisperKit model bundle build (macOS only)."
  exit 0
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HELPER="$SCRIPT_DIR/bin/familiar-speech-helper"
OUT_DIR="$SCRIPT_DIR/bin/whisperkit-models"
MODEL="${FAMILIAR_WHISPERKIT_MODEL:-large-v3-v20240930_626MB}"

if [[ ! -x "$HELPER" ]]; then
  echo "Missing Familiar speech helper: $HELPER" >&2
  echo "Run npm run build:speech-helper before bundling WhisperKit models." >&2
  exit 1
fi

mkdir -p "$OUT_DIR"
find "$OUT_DIR" -mindepth 1 -maxdepth 1 -exec rm -R {} +

response="$(
  printf '{"id":"install","command":"install_assets"}\n' |
    FAMILIAR_WHISPERKIT_MODEL="$MODEL" \
      FAMILIAR_WHISPERKIT_MODEL_ROOT="$OUT_DIR" \
      "$HELPER"
)"
echo "$response"

if ! grep -q '"ok":true' <<<"$response"; then
  echo "Failed to prepare WhisperKit model bundle for model: $MODEL" >&2
  exit 1
fi

echo "Prepared WhisperKit model bundle: $OUT_DIR"
