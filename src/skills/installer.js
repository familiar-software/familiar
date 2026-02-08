const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const HARNESS_SKILL_DIRS = {
    claude: path.join('.claude', 'skills'),
    codex: path.join('.codex', 'skills'),
    cursor: path.join('.cursor', 'skills'),
};

const SKILL_NAME = 'jiminy';

function resolveHarnessSkillPath(harness, options = {}) {
    const baseDir = HARNESS_SKILL_DIRS[harness];
    if (!baseDir) {
        throw new Error(`Unknown harness: ${harness}`);
    }
    const homeDir = options.homeDir || os.homedir();
    if (!homeDir) {
        throw new Error('Unable to resolve home directory');
    }
    return path.join(homeDir, baseDir, SKILL_NAME);
}

function getDefaultSkillSourceDir() {
    return path.join(__dirname, SKILL_NAME);
}

async function assertValidSkillSourceDir(sourceDir) {
    let stat;
    try {
        stat = await fs.promises.stat(sourceDir);
    } catch (error) {
        const code = error && typeof error === 'object' ? error.code : undefined;
        throw new Error(`Skill source directory not found: ${sourceDir}${code ? ` (${code})` : ''}`);
    }

    if (!stat.isDirectory()) {
        throw new Error(`Skill source path is not a directory: ${sourceDir}`);
    }

    // Minimal sanity check so we don't delete an existing install and then fail to copy.
    const skillDoc = path.join(sourceDir, 'SKILL.md');
    try {
        const docStat = await fs.promises.stat(skillDoc);
        if (!docStat.isFile()) {
            throw new Error('SKILL.md is not a file');
        }
    } catch (_error) {
        throw new Error(`Skill source directory is missing SKILL.md: ${sourceDir}`);
    }
}

async function installSkill(options = {}) {
    const harness = options.harness;
    if (!harness) {
        throw new Error('Harness is required');
    }
    const sourceDir = options.sourceDir || getDefaultSkillSourceDir();
    const destination = resolveHarnessSkillPath(harness, { homeDir: options.homeDir });
    const destinationRoot = path.dirname(destination);

    // Validate before touching the destination so failures are non-destructive.
    await assertValidSkillSourceDir(sourceDir);
    await fs.promises.mkdir(destinationRoot, { recursive: true });

    const tempDestination = path.join(
        destinationRoot,
        `${SKILL_NAME}.tmp-${Date.now()}-${Math.random().toString(16).slice(2)}`
    );
    try {
        await fs.promises.rm(tempDestination, { recursive: true, force: true });
        await fs.promises.cp(sourceDir, tempDestination, { recursive: true, dereference: true });

        await fs.promises.rm(destination, { recursive: true, force: true });
        await fs.promises.rename(tempDestination, destination);
    } catch (error) {
        // Best-effort cleanup; keep the existing destination intact if the copy/rename fails.
        try {
            await fs.promises.rm(tempDestination, { recursive: true, force: true });
        } catch (_cleanupError) {
            // Ignore.
        }
        throw error;
    }

    return { path: destination };
}

function getSkillInstallStatus(options = {}) {
    const harness = options.harness;
    if (!harness) {
        throw new Error('Harness is required');
    }
    const destination = resolveHarnessSkillPath(harness, { homeDir: options.homeDir });
    try {
        const stat = fs.statSync(destination);
        return { installed: stat.isDirectory(), path: destination };
    } catch (error) {
        const code = error && typeof error === 'object' ? error.code : undefined;
        if (code && code !== 'ENOENT') {
            return { installed: false, path: destination, error: { code, message: error.message } };
        }
        return { installed: false, path: destination };
    }
}

module.exports = {
    resolveHarnessSkillPath,
    getDefaultSkillSourceDir,
    installSkill,
    getSkillInstallStatus,
};
