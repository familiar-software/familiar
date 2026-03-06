const { execFile } = require('node:child_process')

const openFileInTextEdit = async ({
  targetPath,
  execFileFn = execFile
} = {}) => {
  if (typeof targetPath !== 'string' || targetPath.trim().length === 0) {
    throw new Error('targetPath is required to open TextEdit.')
  }
  if (typeof execFileFn !== 'function') {
    throw new Error('execFileFn is required to open TextEdit.')
  }

  const safeTargetPath = targetPath.trim()

  await new Promise((resolve, reject) => {
    execFileFn('open', ['-a', 'TextEdit', safeTargetPath], (error) => {
      if (error) {
        reject(error)
        return
      }
      resolve()
    })
  })

  return { ok: true, targetPath: safeTargetPath }
}

module.exports = {
  openFileInTextEdit
}
