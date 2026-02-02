const fs = require('node:fs')

const cleanupQueryWorkspace = ({ queryDir, logger = console }) => {
  if (!queryDir || typeof queryDir !== 'string') {
    return
  }

  try {
    fs.rmSync(queryDir, { recursive: true, force: true })
    logger.info('Cleaned up recording query workspace', { queryDir })
  } catch (error) {
    logger.warn('Failed to clean up recording query workspace', { queryDir, error })
  }
}

module.exports = {
  cleanupQueryWorkspace
}
