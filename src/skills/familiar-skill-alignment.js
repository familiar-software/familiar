const { loadSettings, saveSettings } = require('../settings');
const { installSkill } = require('./installer');
const {
    getFamiliarSkillSourceVersion,
    SKILL_MARKER_VERSION_UNKNOWN
} = require('./familiar-skill-version');

const resolveFamiliarSkillHarnessesFromSettings = (settings = {}) => {
    const harnesses = Array.isArray(settings?.skillInstaller?.harness) ? settings.skillInstaller.harness : [];
    const deduped = new Set();

    for (const harness of harnesses) {
        if (typeof harness !== 'string') {
            continue;
        }
        const normalized = harness.trim().toLowerCase();
        if (!normalized) {
            continue;
        }
        deduped.add(normalized);
    }

    return [...deduped];
};

const shouldReinstallFamiliarSkill = ({ sourceVersion, installedVersion }) => (
    sourceVersion === SKILL_MARKER_VERSION_UNKNOWN || sourceVersion !== installedVersion
);

/**
 * Keep installed Familiar skill content aligned with the source on every app launch:
 * compare source vs persisted installed version and reinstall all configured harnesses
 * whenever they differ or when source version is unavailable.
 */
const ensureFamiliarSkillAlignment = async (options = {}) => {
    const settingsLoader = options.settingsLoader || loadSettings;
    const settingsSaver = options.settingsSaver || saveSettings;
    const resolveHarnesses = options.resolveHarnesses || resolveFamiliarSkillHarnessesFromSettings;
    const getSourceVersion = options.sourceVersionResolver || getFamiliarSkillSourceVersion;
    const install = options.installSkill || installSkill;
    const logger = options.logger || console;

    const settings = settingsLoader();
    const configuredHarnesses = resolveHarnesses(settings);
    const sourceVersion = await getSourceVersion({ sourceDir: options.sourceDir });
    const installedVersion = typeof settings.familiarSkillInstalledVersion === 'string'
        ? settings.familiarSkillInstalledVersion
        : null;

    logger.log('Checking Familiar skill alignment', {
        sourceVersion,
        storedVersion: installedVersion,
        configuredHarnesses
    });

    if (configuredHarnesses.length === 0) {
        logger.log('Skipping Familiar skill alignment: no configured harnesses');
        return {
            status: 'skipped-no-harnesses',
            sourceVersion,
            installedVersion,
            harnesses: configuredHarnesses
        };
    }

    if (!shouldReinstallFamiliarSkill({ sourceVersion, installedVersion })) {
        logger.log('Familiar skill already aligned with installed version marker');
        return {
            status: 'already-aligned',
            sourceVersion,
            installedVersion,
            harnesses: configuredHarnesses
        };
    }

    const failures = [];
    for (const harness of configuredHarnesses) {
        try {
            const result = await install({
                harness,
                sourceDir: options.sourceDir
            });
            logger.log('Reinstalled Familiar skill', { harness, path: result.path });
        } catch (error) {
            failures.push({
                harness,
                message: error?.message || 'Unknown install failure.',
                code: error?.code || null
            });
            logger.error('Failed to align Familiar skill', {
                harness,
                sourceVersion,
                configuredHarnesses,
                error: error?.message || 'Unknown install failure.'
            });
        }
    }

    if (failures.length > 0) {
        logger.warn('Familiar skill alignment completed with failures', {
            sourceVersion,
            installedVersion,
            failures
        });
        return {
            status: 'failed',
            sourceVersion,
            installedVersion,
            harnesses: configuredHarnesses,
            failures
        };
    }

    try {
        await settingsSaver({ familiarSkillInstalledVersion: sourceVersion });
        logger.log('Persisted Familiar skill version marker', { sourceVersion });
        return {
            status: 'installed',
            sourceVersion,
            installedVersion,
            harnesses: configuredHarnesses
        };
    } catch (error) {
        logger.error('Failed to persist Familiar skill version marker', {
            sourceVersion,
            error: error?.message || 'Unknown settings save failure.'
        });
        return {
            status: 'save-failed',
            sourceVersion,
            installedVersion,
            harnesses: configuredHarnesses,
            error: error?.message || 'Unknown settings save failure.'
        };
    }
};

module.exports = {
    ensureFamiliarSkillAlignment,
    resolveFamiliarSkillHarnessesFromSettings,
    shouldReinstallFamiliarSkill,
};
