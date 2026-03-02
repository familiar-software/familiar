#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "Skipping active-window detector helper build (macOS only)."
  exit 0
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="$ROOT_DIR/list-on-screen-apps.m"
OUT_DIR="$ROOT_DIR/bin"
OUT="$OUT_DIR/list-on-screen-apps-helper"

if [[ ! -f "$SRC" ]]; then
  echo "missing source file: $SRC" >&2
  exit 1
fi

mkdir -p "$OUT_DIR"

echo "Building active-window detector helper..."
echo "  src: $SRC"
echo "  out: $OUT"

clang -fobjc-arc -framework Foundation -framework AppKit -framework CoreGraphics \
  -arch arm64 -arch x86_64 \
  "$SRC" -o "$OUT"

echo "Built: $OUT"
