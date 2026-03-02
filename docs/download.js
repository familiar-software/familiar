// Architecture detection and download link generation for Familiar
const GITHUB_REPO = 'familiar-software/familiar';
const CURRENT_VERSION = '0.0.37'; // Auto-updated by CI

/**
 * Detect macOS architecture (Apple Silicon vs Intel)
 * @returns {'arm64'|'x64'} Detected architecture
 */
function detectArchitecture() {
  const ua = navigator.userAgent;

  // Check if we're on macOS
  if (!ua.includes('Mac')) {
    return null; // Not a Mac
  }

  // Modern API (Chromium-based browsers)
  // Note: This API is still experimental and may not be available
  if (navigator.userAgentData?.platform === 'macOS') {
    // Default to Apple Silicon (most common in 2026)
    return 'arm64';
  }

  // Heuristic: Check for Intel indicators in user agent
  if (ua.includes('Intel')) {
    return 'x64';
  }

  // Check for explicit ARM/Apple Silicon indicators
  if (ua.includes('ARM') || ua.includes('Apple')) {
    return 'arm64';
  }

  // Default: arm64 (70%+ of Macs are M-series by 2026)
  // This is a safe default as M1 was released in 2020
  return 'arm64';
}

/**
 * Check if user is on macOS
 * @returns {boolean}
 */
function isMacOS() {
  return navigator.userAgent.includes('Mac');
}

/**
 * Generate download links for a specific version and architecture
 * @param {string} version - Version number (e.g., '0.0.37')
 * @param {'arm64'|'x64'} arch - Architecture
 * @returns {{dmg: string, zip: string}} Download URLs
 */
function getDownloadLinks(version, arch) {
  const base = `https://github.com/${GITHUB_REPO}/releases/download/v${version}`;
  return {
    dmg: `${base}/Familiar-${version}-${arch}.dmg`,
    zip: `${base}/Familiar-${version}-${arch}-mac.zip`,
  };
}

/**
 * Get human-readable architecture name
 * @param {'arm64'|'x64'} arch
 * @returns {string}
 */
function getArchitectureName(arch) {
  return arch === 'arm64' ? 'Apple Silicon (M1/M2/M3/M4)' : 'Intel';
}

/**
 * Initialize download page - detect architecture and update UI
 */
function initializeDownloadPage() {
  // Check if user is on macOS
  if (!isMacOS()) {
    showNonMacWarning();
    return;
  }

  // Detect architecture
  const arch = detectArchitecture();
  const altArch = arch === 'arm64' ? 'x64' : 'arm64';

  // Update detected architecture text
  const detectedArchEl = document.getElementById('detected-arch');
  if (detectedArchEl) {
    detectedArchEl.textContent = getArchitectureName(arch);
  }

  // Set primary download button
  const primaryBtn = document.getElementById('download-primary');
  if (primaryBtn) {
    const primaryLinks = getDownloadLinks(CURRENT_VERSION, arch);
    primaryBtn.href = primaryLinks.dmg;

    // Update button text to show architecture
    const btnText = primaryBtn.querySelector('span');
    if (btnText) {
      btnText.textContent = `Download for ${getArchitectureName(arch)}`;
    }
  }

  // Set alternative download link
  const altLink = document.getElementById('download-alt');
  if (altLink) {
    const altLinks = getDownloadLinks(CURRENT_VERSION, altArch);
    altLink.href = altLinks.dmg;
  }

  // Set alternative architecture name
  const altArchName = document.getElementById('alt-arch-name');
  if (altArchName) {
    altArchName.textContent = getArchitectureName(altArch);
  }
}

/**
 * Show warning for non-Mac users
 */
function showNonMacWarning() {
  const detectedArchEl = document.getElementById('detected-arch');
  if (detectedArchEl) {
    detectedArchEl.textContent = 'Not macOS';
    detectedArchEl.classList.add('text-red-600', 'dark:text-red-400');
  }

  const primaryBtn = document.getElementById('download-primary');
  if (primaryBtn) {
    primaryBtn.disabled = true;
    primaryBtn.classList.remove('bg-indigo-600', 'hover:bg-indigo-700');
    primaryBtn.classList.add('bg-zinc-400', 'cursor-not-allowed');

    const btnText = primaryBtn.querySelector('span');
    if (btnText) {
      btnText.textContent = 'macOS Only';
    }

    // Show helpful message
    const parentEl = primaryBtn.parentElement;
    if (parentEl) {
      const warningMsg = document.createElement('p');
      warningMsg.className = 'text-sm text-red-600 dark:text-red-400 mt-2';
      warningMsg.textContent = 'Familiar is currently only available for macOS 14.0 or later.';
      parentEl.appendChild(warningMsg);
    }
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeDownloadPage);
} else {
  // DOM already loaded
  initializeDownloadPage();
}
