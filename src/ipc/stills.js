const { ipcMain, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const { loadSettings } = require('../settings');
const { FAMILIAR_BEHIND_THE_SCENES_DIR_NAME } = require('../const');

function getFamiliarFolderPath(contextFolderPath) {
  return path.join(contextFolderPath, FAMILIAR_BEHIND_THE_SCENES_DIR_NAME);
}

async function handleOpenStillsFolder() {
  try {
    const settings = loadSettings();
    const contextFolderPath = settings?.contextFolderPath || '';
    if (!contextFolderPath) {
      return { ok: false, message: 'Context folder is not set.' };
    }

    const familiarPath = getFamiliarFolderPath(contextFolderPath);

    try {
      fs.mkdirSync(familiarPath, { recursive: true });
    } catch (error) {
      console.error('Failed to ensure Familiar folder exists', { familiarPath, error });
      return { ok: false, message: 'Unable to create Familiar folder.' };
    }

    const openResult = await shell.openPath(familiarPath);
    if (openResult) {
      console.error('Failed to open Familiar folder', { familiarPath, error: openResult });
      return { ok: false, message: 'Failed to open Familiar folder.' };
    }

    console.log('Opened Familiar folder', { familiarPath });
    return { ok: true };
  } catch (error) {
    console.error('Failed to open Familiar folder', error);
    return { ok: false, message: 'Failed to open Familiar folder.' };
  }
}

function registerStillsHandlers() {
  ipcMain.handle('stills:openFolder', handleOpenStillsFolder);
  console.log('Stills IPC handlers registered');
}

module.exports = {
  registerStillsHandlers,
};
