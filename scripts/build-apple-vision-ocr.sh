#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "Skipping Apple Vision OCR build (macOS only)."
  exit 0
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="$ROOT_DIR/apple-vision-ocr.swift"
OUT_DIR="$ROOT_DIR/bin"
OUT="$OUT_DIR/apple-vision-ocr"

mkdir -p "$OUT_DIR"

# In some sandboxed environments, Swift/Clang module cache writes to ~/.cache can be blocked.
# Redirect caches to a writable tmp directory.
CACHE_ROOT="${TMPDIR:-/tmp}/jiminy-apple-vision-ocr-build-cache"
mkdir -p "$CACHE_ROOT"

echo "Building Apple Vision OCR helper..."
echo "  src: $SRC"
echo "  out: $OUT"

HOME="$CACHE_ROOT" \
XDG_CACHE_HOME="$CACHE_ROOT" \
TMPDIR="${TMPDIR:-/tmp}" \
xcrun swiftc -O -whole-module-optimization -o "$OUT" "$SRC"

echo "Built: $OUT"
