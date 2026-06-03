#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "Skipping Familiar speech helper build (macOS only)."
  exit 0
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_DIR="$SCRIPT_DIR/familiar-speech-helper"
OUT_DIR="$SCRIPT_DIR/bin"
OUT="$OUT_DIR/familiar-speech-helper"
UNIVERSAL=false

if [[ "${1:-}" == "--universal" ]]; then
  UNIVERSAL=true
  shift
fi

if [[ "$#" -ne 0 ]]; then
  echo "usage: $0 [--universal]" >&2
  exit 1
fi

mkdir -p "$OUT_DIR"

build_host_arch() {
  swift build \
    --package-path "$PACKAGE_DIR" \
    --configuration release \
    --product familiar-speech-helper
  cp "$PACKAGE_DIR/.build/release/familiar-speech-helper" "$OUT"
}

build_arch() {
  local arch="$1"
  local triple="${arch}-apple-macosx14.0"
  local scratch_path="$PACKAGE_DIR/.build/familiar-speech-helper-${arch}"
  local artifact="$scratch_path/${arch}-apple-macosx/release/familiar-speech-helper"

  swift build \
    --package-path "$PACKAGE_DIR" \
    --configuration release \
    --product familiar-speech-helper \
    --triple "$triple" \
    --scratch-path "$scratch_path" \
    --disable-automatic-resolution >&2

  if [[ ! -x "$artifact" ]]; then
    echo "Missing $arch speech helper build artifact: $artifact" >&2
    exit 1
  fi
  printf '%s\n' "$artifact"
}

if [[ "$UNIVERSAL" == true ]]; then
  ARM64_OUT="$(build_arch arm64)"
  X64_OUT="$(build_arch x86_64)"
  lipo -create -output "$OUT" "$ARM64_OUT" "$X64_OUT"
else
  build_host_arch
fi

chmod 755 "$OUT"
codesign --force --sign - "$OUT"

if [[ "$UNIVERSAL" == true ]]; then
  ARCH_INFO="$(lipo -info "$OUT" || true)"
  if [[ "$ARCH_INFO" != *"arm64"* || "$ARCH_INFO" != *"x86_64"* ]]; then
    echo "error: familiar-speech-helper must be universal. got: ${ARCH_INFO:-unknown}" >&2
    exit 1
  fi
fi

echo "Built Familiar speech helper: $OUT"
