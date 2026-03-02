const fs = require('node:fs')
const path = require('node:path')

const FAMILIAR_DIR_NAME = 'familiar'

async function pathExists(targetPath) {
  try {
    await fs.promises.stat(targetPath)
    return true
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return false
    }
    throw error
  }
}

async function ensureDirectory(targetPath, label) {
  let stat
  try {
    stat = await fs.promises.stat(targetPath)
  } catch (error) {
    const code = error && typeof error === 'object' ? error.code : undefined
    throw new Error(`${label} not found: ${targetPath}${code ? ` (${code})` : ''}`)
  }
  if (!stat.isDirectory()) {
    throw new Error(`${label} is not a directory: ${targetPath}`)
  }
}

async function copyFile(sourcePath, destinationPath) {
  await fs.promises.mkdir(path.dirname(destinationPath), { recursive: true })
  await fs.promises.copyFile(sourcePath, destinationPath)
}

async function copyDirRecursive(sourceDir, destinationDir) {
  await fs.promises.mkdir(destinationDir, { recursive: true })
  const entries = await fs.promises.readdir(sourceDir, { withFileTypes: true })
  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry.name)
    const destinationPath = path.join(destinationDir, entry.name)

    if (entry.isDirectory()) {
      await copyDirRecursive(sourcePath, destinationPath)
      continue
    }

    if (entry.isFile()) {
      await copyFile(sourcePath, destinationPath)
      continue
    }

    if (entry.isSymbolicLink()) {
      const resolved = await fs.promises.realpath(sourcePath)
      const stat = await fs.promises.stat(resolved)
      if (stat.isDirectory()) {
        await copyDirRecursive(resolved, destinationPath)
      } else if (stat.isFile()) {
        await copyFile(resolved, destinationPath)
      } else {
        throw new Error(`Unsupported symlink target type for ${sourcePath}`)
      }
      continue
    }

    throw new Error(`Unsupported directory entry type for ${sourcePath}`)
  }
}

async function moveFamiliarFolder(options = {}) {
  const logger = options.logger || console
  const sourceContextFolderPath = options.sourceContextFolderPath
  const destinationContextFolderPath = options.destinationContextFolderPath

  if (typeof sourceContextFolderPath !== 'string' || sourceContextFolderPath.trim().length === 0) {
    throw new Error('Source context folder path is required.')
  }
  if (typeof destinationContextFolderPath !== 'string' || destinationContextFolderPath.trim().length === 0) {
    throw new Error('Destination context folder path is required.')
  }

  const sourceRoot = path.resolve(sourceContextFolderPath)
  const destinationRoot = path.resolve(destinationContextFolderPath)
  if (sourceRoot === destinationRoot) {
    throw new Error('Source and destination context folders are the same.')
  }

  await ensureDirectory(sourceRoot, 'Source context folder')
  await ensureDirectory(destinationRoot, 'Destination context folder')

  const sourceFamiliarPath = path.join(sourceRoot, FAMILIAR_DIR_NAME)
  const destinationFamiliarPath = path.join(destinationRoot, FAMILIAR_DIR_NAME)

  await ensureDirectory(sourceFamiliarPath, 'Source familiar folder')

  if (await pathExists(destinationFamiliarPath)) {
    throw new Error(`Target familiar folder already exists: ${destinationFamiliarPath}`)
  }

  logger.log('Moving familiar folder', {
    sourceFamiliarPath,
    destinationFamiliarPath
  })

  try {
    await fs.promises.rename(sourceFamiliarPath, destinationFamiliarPath)
    logger.log('Familiar folder moved via rename', { destinationFamiliarPath })
    return {
      sourceFamiliarPath,
      destinationFamiliarPath,
      method: 'rename'
    }
  } catch (error) {
    if (!error || error.code !== 'EXDEV') {
      throw error
    }
  }

  logger.warn('Familiar folder move falling back to copy', {
    sourceFamiliarPath,
    destinationFamiliarPath
  })

  try {
    await copyDirRecursive(sourceFamiliarPath, destinationFamiliarPath)
    await fs.promises.rm(sourceFamiliarPath, { recursive: true, force: true })
    logger.log('Familiar folder moved via copy', { destinationFamiliarPath })
    return {
      sourceFamiliarPath,
      destinationFamiliarPath,
      method: 'copy'
    }
  } catch (error) {
    try {
      await fs.promises.rm(destinationFamiliarPath, { recursive: true, force: true })
    } catch (_cleanupError) {
      // Best-effort cleanup.
    }
    throw error
  }
}

module.exports = {
  moveFamiliarFolder
}
