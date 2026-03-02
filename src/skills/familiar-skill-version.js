const fs = require('node:fs');
const path = require('node:path');

const SKILL_NAME = 'familiar';
const SKILL_DOCUMENT = 'SKILL.md';
const SKILL_MARKER_VERSION_UNKNOWN = 'unknown';

const getDefaultSkillSourceDir = () => path.join(__dirname, SKILL_NAME);

/**
 * Parse one key from the YAML frontmatter at the top of a markdown file.
 */
function parseFrontmatterField(markdown, targetField) {
    if (typeof markdown !== 'string' || markdown.trim().length === 0) {
        return null;
    }

    const lines = markdown.split(/\r?\n/);
    if (lines[0]?.trim() !== '---') {
        return null;
    }

    for (let i = 1; i < lines.length; i += 1) {
        const line = lines[i]?.trim();
        if (line === '---') {
            break;
        }

        const match = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
        if (!match || match[1] !== targetField) {
            continue;
        }

        const rawValue = match[2].trim();
        if (rawValue.length === 0) {
            return '';
        }

        const quoted = /^"(.*)"$/.test(rawValue) || /^'(.*)'$/.test(rawValue);
        if (quoted) {
            return rawValue.slice(1, -1).trim();
        }

        return rawValue;
    }

    return null;
}

/**
 * Normalize missing/empty versions into a deterministic placeholder.
 */
function normalizeSkillVersion(value) {
    const trimmed = typeof value === 'string' ? value.trim() : '';
    return trimmed.length > 0 ? trimmed : SKILL_MARKER_VERSION_UNKNOWN;
}

/**
 * Read and parse the source skill's advertised version from SKILL.md.
 * If the field is missing or parsing fails, returns "unknown" to force re-install.
 */
async function getFamiliarSkillSourceVersion(options = {}) {
    const sourceDir = options.sourceDir || getDefaultSkillSourceDir();
    const sourcePath = path.join(sourceDir, SKILL_DOCUMENT);

    try {
        const sourceContent = await fs.promises.readFile(sourcePath, 'utf-8');
        return normalizeSkillVersion(parseFrontmatterField(sourceContent, 'version'));
    } catch (_error) {
        return SKILL_MARKER_VERSION_UNKNOWN;
    }
}

module.exports = {
    SKILL_MARKER_VERSION_UNKNOWN,
    getDefaultSkillSourceDir,
    parseFrontmatterField,
    normalizeSkillVersion,
    getFamiliarSkillSourceVersion,
};
