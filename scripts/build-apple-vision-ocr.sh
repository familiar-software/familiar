#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "Skipping Apple Vision OCR build (macOS only)."
  exit 0
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="$ROOT_DIR/apple-vision-ocr.m"
OUT_DIR="$ROOT_DIR/bin"
OUT="$OUT_DIR/familiar-ocr-helper"

mkdir -p "$OUT_DIR"

echo "Building Apple Vision OCR helper..."
echo "  src: $SRC"
echo "  out: $OUT"

xcrun clang \
  -O3 \
  -fobjc-arc \
  -arch arm64 \
  -arch x86_64 \
  -mmacosx-version-min=14.0 \
  -Werror \
  -framework Foundation \
  -framework Vision \
  -framework ImageIO \
  -framework CoreGraphics \
  -framework CoreML \
  -o "$OUT" \
  "$SRC"

# Guardrails: ensure both slices exist, keep deployment target at 14.x, and avoid Swift runtime deps.
ARCH_INFO="$(lipo -info "$OUT" || true)"
if [[ "$ARCH_INFO" != *"arm64"* || "$ARCH_INFO" != *"x86_64"* ]]; then
  echo "error: familiar-ocr-helper must be universal (arm64 + x86_64). got: ${ARCH_INFO:-unknown}" >&2
  exit 1
fi

for arch in arm64 x86_64; do
  MINOS="$(otool -l -arch "$arch" "$OUT" | awk 'BEGIN{inBuild=0} /LC_BUILD_VERSION/{inBuild=1} inBuild && /minos/{print $2; exit}')"
  if [[ "$MINOS" != 14.* ]]; then
    echo "error: familiar-ocr-helper minos must be 14.x for $arch, got: ${MINOS:-unknown}" >&2
    exit 1
  fi

  if otool -L -arch "$arch" "$OUT" | grep -q "libswift"; then
    echo "error: familiar-ocr-helper unexpectedly links Swift runtime dylibs for $arch" >&2
    otool -L -arch "$arch" "$OUT" | grep "libswift" >&2 || true
    exit 1
  fi
done

echo "Built: $OUT"
