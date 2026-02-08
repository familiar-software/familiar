const { ipcMain } = require('electron');
const { installSkill, getSkillInstallStatus } = require('../skills/installer');

function formatSkillError(prefix, error) {
    const message = error && typeof error === 'object' && typeof error.message === 'string'
        ? error.message
        : '';
    const code = error && typeof error === 'object' && typeof error.code === 'string'
        ? error.code
        : '';
    const details = [message, code].filter(Boolean).join(' ');
    return details ? `${prefix} ${details}` : prefix;
}

function registerSkillHandlers() {
    ipcMain.handle('skills:install', async (_event, payload) => {
        const harness = payload?.harness || '';
        if (!harness) {
            return { ok: false, message: 'Harness is required.' };
        }

        try {
            console.log('Installing skill', { harness });
            const result = await installSkill({ harness });
            console.log('Skill installed', { harness, path: result.path });
            return { ok: true, path: result.path };
        } catch (error) {
            console.error('Failed to install skill', error);
            return { ok: false, message: formatSkillError('Failed to install skill.', error) };
        }
    });

    ipcMain.handle('skills:status', (_event, payload) => {
        const harness = payload?.harness || '';
        if (!harness) {
            return { ok: false, message: 'Harness is required.' };
        }

        try {
            const result = getSkillInstallStatus({ harness });
            if (result && result.error) {
                return {
                    ok: false,
                    message: formatSkillError('Failed to check skill installation.', result.error),
                    path: result.path
                };
            }
            return { ok: true, installed: result.installed, path: result.path };
        } catch (error) {
            console.error('Failed to read skill install status', error);
            return { ok: false, message: formatSkillError('Failed to check skill installation.', error) };
        }
    });

    console.log('Skill IPC handlers registered');
}

module.exports = {
    registerSkillHandlers,
};
