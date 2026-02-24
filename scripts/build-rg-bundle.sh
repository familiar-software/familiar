#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN_DIR="${SCRIPT_DIR}/bin/rg"

ARM64_DEST="${BIN_DIR}/rg-darwin-arm64"
X64_DEST="${BIN_DIR}/rg-darwin-x64"
RG_VERSION="${FAMILIAR_RG_VERSION:-14.1.1}"

mkdir -p "${BIN_DIR}"

download_rg_binary() {
  local target="$1"
  local archive_arch="$2"
  local archive_name="ripgrep-${RG_VERSION}-${archive_arch}.tar.gz"
  local archive_url="https://github.com/BurntSushi/ripgrep/releases/download/${RG_VERSION}/${archive_name}"
  local temp_dir
  temp_dir="$(mktemp -d)"
  trap 'rm -rf "'"${temp_dir}"'"' RETURN

  echo "Downloading ${archive_url}" >&2
  curl -fLsS "${archive_url}" -o "${temp_dir}/${archive_name}"
  tar -xzf "${temp_dir}/${archive_name}" -C "${temp_dir}"

  local extracted
  extracted="$(find "${temp_dir}" -type f -name rg | head -n 1)"
  if [[ -z "${extracted}" ]]; then
    echo "Failed to locate rg binary inside ${archive_name}" >&2
    exit 1
  fi

  cp "${extracted}" "${target}"
  chmod 755 "${target}"
}

ensure_rg_binary() {
  local source_path="$1"
  local target="$2"
  local archive_arch="$3"
  local label="$4"

  if [[ -n "${source_path}" ]]; then
    cp "${source_path}" "${target}"
    chmod 755 "${target}"
  elif [[ ! -f "${target}" ]]; then
    download_rg_binary "${target}" "${archive_arch}"
  fi

  if [[ ! -f "${target}" ]]; then
    echo "Missing ${label} rg binary at ${target}" >&2
    exit 1
  fi

  if ! "${target}" --version >/dev/null 2>&1; then
    echo "Invalid rg binary at ${target}" >&2
    exit 1
  fi
}

ensure_rg_binary "${FAMILIAR_RG_DARWIN_ARM64_SOURCE:-}" "${ARM64_DEST}" "aarch64-apple-darwin" "arm64"
ensure_rg_binary "${FAMILIAR_RG_DARWIN_X64_SOURCE:-}" "${X64_DEST}" "x86_64-apple-darwin" "x64"

echo "RG bundle ready (version ${RG_VERSION}):" >&2
echo "  arm64: ${ARM64_DEST}" >&2
echo "  x64:   ${X64_DEST}" >&2
