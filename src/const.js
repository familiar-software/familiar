const path = require('node:path')

const SETTINGS_DIR_NAME = '.familiar'
const SETTINGS_FILE_NAME = 'settings.json'
const FAMILIAR_BEHIND_THE_SCENES_DIR_NAME = 'familiar'
const STILLS_DIR_NAME = 'stills'
const STILLS_MARKDOWN_DIR_NAME = 'stills-markdown'
const STILLS_DB_FILENAME = 'stills.db'

// Resolves the on-disk directory Familiar uses for its content (stills,
// markdown, DB). contextFolderPath is the parent the user picks (or we
// auto-default to $HOME); the storage dir is <parent>/familiar/.
// Harness adapters cwd here, not into the parent, so scheduled tasks
// don't incidentally see files unrelated to Familiar.
const getStorageDir = (contextFolderPath) => {
  if (!contextFolderPath || typeof contextFolderPath !== 'string') {
    return ''
  }
  return path.join(contextFolderPath, FAMILIAR_BEHIND_THE_SCENES_DIR_NAME)
}

module.exports = {
  SETTINGS_DIR_NAME,
  SETTINGS_FILE_NAME,
  FAMILIAR_BEHIND_THE_SCENES_DIR_NAME,
  STILLS_DIR_NAME,
  STILLS_MARKDOWN_DIR_NAME,
  STILLS_DB_FILENAME,
  getStorageDir
}
