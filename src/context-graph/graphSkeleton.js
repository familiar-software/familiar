const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { FileNode, FolderNode, createNodeId, normalizeRelativePath } = require('./nodes')
const {
  CAPTURES_DIR_NAME,
  EXTRA_CONTEXT_SUFFIX,
  GENERAL_ANALYSIS_DIR_NAME,
  JIMINY_BEHIND_THE_SCENES_DIR_NAME,
  MAX_CONTEXT_FILE_SIZE_BYTES
} = require('../const')

const MAX_NODES = 300
const ALLOWED_EXTENSIONS = new Set(['.md', '.txt'])
const GITIGNORE_FILENAME = '.gitignore'

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const globToRegExp = (pattern) => {
  let regex = ''
  for (let i = 0; i < pattern.length; i += 1) {
    const char = pattern[i]
    if (char === '*') {
      if (pattern[i + 1] === '*') {
        const hasTrailingSlash = pattern[i + 2] === '/'
        if (hasTrailingSlash) {
          regex += '(?:.*/)?'
          i += 2
        } else {
          regex += '.*'
          i += 1
        }
      } else {
        regex += '[^/]*'
      }
    } else if (char === '?') {
      regex += '[^/]'
    } else {
      regex += escapeRegex(char)
    }
  }
  return new RegExp(`^${regex}$`)
}

const parseGitignore = (contents) => {
  const rules = []
  const lines = contents.split(/\r?\n/)
  for (const rawLine of lines) {
    let line = rawLine.trim()
    if (!line) continue
    if (line.startsWith('\\#') || line.startsWith('\\!')) {
      line = line.slice(1)
    } else if (line.startsWith('#')) {
      continue
    }

    let negate = false
    if (line.startsWith('!')) {
      negate = true
      line = line.slice(1)
    }

    let directoryOnly = false
    if (line.endsWith('/')) {
      directoryOnly = true
      line = line.slice(0, -1)
    }

    line = line.replace(/\\/g, '/')
    if (!line) continue

    const anchored = line.startsWith('/')
    if (anchored) {
      line = line.slice(1)
    }

    const hasSlash = line.includes('/') || anchored
    const matcher = globToRegExp(line)

    rules.push({
      pattern: line,
      anchored,
      hasSlash,
      negate,
      directoryOnly,
      matcher
    })
  }

  return rules
}

const hashBuffer = (buffer) => (
  crypto.createHash('sha256').update(buffer).digest('hex')
)

const readFileData = (filePath) => {
  const fileStat = fs.statSync(filePath)
  const buffer = fs.readFileSync(filePath)
  return {
    sizeBytes: fileStat.size,
    modifiedAt: fileStat.mtime.toISOString(),
    content: buffer.toString('utf-8'),
    contentHash: hashBuffer(buffer)
  }
}

const isFileTooLarge = (stat, relativePath, logger, maxSizeBytes = MAX_CONTEXT_FILE_SIZE_BYTES) => {
  if (stat.size > maxSizeBytes) {
    logger.log('Skipping large file', {
      path: relativePath,
      sizeBytes: stat.size,
      maxSizeBytes
    })
    return true
  }
  return false
}

const applyGitignoreRules = (rules, relativePath, isDirectory, ignored) => {
  if (!rules.length) return ignored
  const normalized = relativePath.replace(/\\/g, '/')
  const basename = path.posix.basename(normalized)

  let result = ignored
  for (const rule of rules) {
    if (rule.directoryOnly && !isDirectory) {
      continue
    }

    const matches = rule.hasSlash
      ? rule.matcher.test(normalized)
      : rule.matcher.test(basename)

    if (matches) {
      result = !rule.negate
    }
  }

  return result
}

const loadGitignoreRules = (directoryPath, logger) => {
  const gitignorePath = path.join(directoryPath, GITIGNORE_FILENAME)
  let stat
  try {
    stat = fs.statSync(gitignorePath)
  } catch (error) {
    if (error && error.code !== 'ENOENT') {
      logger.warn('Failed to stat .gitignore', { path: gitignorePath, error })
    }
    return null
  }

  if (!stat.isFile()) return null

  try {
    const contents = fs.readFileSync(gitignorePath, 'utf-8')
    return parseGitignore(contents)
  } catch (error) {
    logger.warn('Failed to read .gitignore', { path: gitignorePath, error })
    return null
  }
}

const constructContextGraphSkeleton = (rootPath, { logger = console, maxNodes = MAX_NODES, exclusions = [] } = {}) => {
  const nodes = {}
  const fileContents = new Map()
  const fileIds = []
  const folderIds = []
  const folderDepths = new Map()
  const errors = []
  const warnings = []
  const ignores = []
  const visitedDirs = new Set()
  let totalNodes = 0
  let exceededLimit = false

  const defaultExclusions = [CAPTURES_DIR_NAME, JIMINY_BEHIND_THE_SCENES_DIR_NAME].filter(Boolean)
  const exclusionSet = new Set(
    [...defaultExclusions, ...exclusions]
      .filter(Boolean)
      .map((p) => p.replace(/\\/g, '/').replace(/^\/+|\/+$/g, ''))
  )

  const isExcluded = (relativePath) => {
    if (!relativePath) return false
    const normalized = relativePath.replace(/\\/g, '/')
    // Check exact match or if it's inside an excluded folder
    if (exclusionSet.has(normalized)) return true
    for (const excluded of exclusionSet) {
      if (normalized.startsWith(excluded + '/')) return true
    }
    return false
  }

  const addIgnore = (relativePath, type, reason) => {
    if (!relativePath) return
    ignores.push({
      path: relativePath,
      type,
      reason
    })
  }

  const registerNode = () => {
    totalNodes += 1
    if (totalNodes > maxNodes) {
      exceededLimit = true
    }
  }

  const isExtraContextDirName = (name) => name.endsWith(EXTRA_CONTEXT_SUFFIX)
  const isGeneralAnalysisDirName = (name) => name === GENERAL_ANALYSIS_DIR_NAME
  const isBehindTheScenesDirName = (name) => name === JIMINY_BEHIND_THE_SCENES_DIR_NAME
  const isCapturesDirName = (name) => name === CAPTURES_DIR_NAME

  const walk = (currentPath, relativePath, depth, gitignoreMatchers) => {
    let realPath
    try {
      realPath = fs.realpathSync(currentPath)
    } catch (error) {
      errors.push({ path: relativePath || currentPath, message: error.message })
      logger.error('Failed to resolve directory path', { path: currentPath, error })
      return null
    }

    if (visitedDirs.has(realPath)) {
      const warning = { path: relativePath || currentPath, message: 'Cycle detected: directory already visited.' }
      warnings.push(warning)
      logger.warn('Cycle detected in context folder', { path: currentPath })
      return null
    }

    visitedDirs.add(realPath)

    let entries
    try {
      entries = fs.readdirSync(currentPath, { withFileTypes: true })
    } catch (error) {
      errors.push({ path: currentPath, message: error.message })
      logger.error('Failed to read directory', { path: currentPath, error })
      return null
    }

    entries.sort((a, b) => a.name.localeCompare(b.name))

    const normalizedRelative = normalizeRelativePath(relativePath)
    const localGitignoreRules = loadGitignoreRules(currentPath, logger) || []
    const nextGitignoreMatchers = localGitignoreRules.length > 0
      ? [...gitignoreMatchers, { baseRelative: normalizedRelative, rules: localGitignoreRules }]
      : gitignoreMatchers
    const folderId = createNodeId({ relativePath: normalizedRelative, type: 'folder' })
    const folderNode = new FolderNode({
      id: folderId,
      name: normalizedRelative ? path.basename(currentPath) : path.basename(rootPath),
      relativePath: normalizedRelative,
      children: []
    })

    nodes[folderId] = folderNode
    folderIds.push(folderId)
    folderDepths.set(folderId, depth)
    registerNode()

    for (const entry of entries) {
      const entryPath = path.join(currentPath, entry.name)
      const entryRelative = normalizedRelative ? path.join(normalizedRelative, entry.name) : entry.name
      const normalizedEntryRelative = normalizeRelativePath(entryRelative)
      const isDirectory = entry.isDirectory()

      let ignoredByGitignore = false
      let ignored = false
      for (const matcher of nextGitignoreMatchers) {
        const relToMatcher = path.posix.relative(matcher.baseRelative || '', normalizedEntryRelative)
        if (!relToMatcher || relToMatcher.startsWith('..')) {
          continue
        }
        ignored = applyGitignoreRules(matcher.rules, relToMatcher, isDirectory, ignored)
      }
      ignoredByGitignore = ignored

      if (ignoredByGitignore) {
        logger.log('Skipping gitignored path', { path: normalizedEntryRelative })
        addIgnore(normalizedEntryRelative, isDirectory ? 'folder' : 'file', 'gitignore')
        continue
      }

      if (isExcluded(normalizedEntryRelative)) {
        logger.log('Skipping excluded path', { path: normalizedEntryRelative })
        addIgnore(normalizedEntryRelative, isDirectory ? 'folder' : 'file', 'exclusion')
        continue
      }

      if (isDirectory && entry.name.startsWith('.')) {
        logger.log('Skipping hidden folder', { path: normalizedEntryRelative })
        addIgnore(normalizedEntryRelative, 'folder', 'hidden')
        continue
      }

      if (isDirectory && isExtraContextDirName(entry.name)) {
        logger.log('Skipping generated context folder', { path: normalizedEntryRelative })
        addIgnore(normalizedEntryRelative, 'folder', 'extra_context')
        continue
      }

      if (isDirectory && isCapturesDirName(entry.name)) {
        logger.log('Skipping captures folder', { path: normalizedEntryRelative })
        addIgnore(normalizedEntryRelative, 'folder', 'captures')
        continue
      }

      if (isDirectory && isBehindTheScenesDirName(entry.name)) {
        logger.log('Skipping jiminy behind-the-scenes folder', { path: normalizedEntryRelative })
        addIgnore(normalizedEntryRelative, 'folder', 'behind_the_scenes')
        continue
      }

      if (isDirectory && isGeneralAnalysisDirName(entry.name)) {
        logger.log('Skipping general analysis folder', { path: normalizedEntryRelative })
        addIgnore(normalizedEntryRelative, 'folder', 'general_analysis')
        continue
      }

      if (entry.isSymbolicLink()) {
        try {
          const linkRealPath = fs.realpathSync(entryPath)
          const linkStat = fs.statSync(linkRealPath)
          if (linkStat.isDirectory() && visitedDirs.has(linkRealPath)) {
            const warning = { path: normalizedEntryRelative, message: 'Cycle detected: symlink points to visited directory.' }
            warnings.push(warning)
            logger.warn('Cycle detected via symlink', { path: entryPath })
          }
        } catch (error) {
          warnings.push({ path: normalizedEntryRelative, message: `Failed to resolve symlink: ${error.message}` })
          logger.warn('Failed to resolve symlink', { path: entryPath, error })
        }
        addIgnore(normalizedEntryRelative, 'symlink', 'symlink')
        continue
      }

      if (isDirectory) {
        const childId = walk(entryPath, normalizedEntryRelative, depth + 1, nextGitignoreMatchers)
        if (childId) {
          folderNode.children.push(childId)
        }
        continue
      }

      if (!entry.isFile()) {
        addIgnore(normalizedEntryRelative, 'unknown', 'unsupported_entry')
        continue
      }

      const extension = path.extname(entry.name).toLowerCase()
      if (!ALLOWED_EXTENSIONS.has(extension)) {
        logger.log('Skipping unsupported file', { path: entryPath, extension })
        addIgnore(normalizedEntryRelative, 'file', 'unsupported_extension')
        continue
      }

      const fileStat = fs.statSync(entryPath)
      if (isFileTooLarge(fileStat, normalizedEntryRelative, logger)) {
        addIgnore(normalizedEntryRelative, 'file', 'file_too_large')
        continue
      }

      const fileId = createNodeId({ relativePath: normalizedEntryRelative, type: 'file' })
      registerNode()

      try {
        const data = readFileData(entryPath)
        const fileNode = new FileNode({
          id: fileId,
          name: entry.name,
          relativePath: normalizedEntryRelative,
          sizeBytes: data.sizeBytes,
          modifiedAt: data.modifiedAt,
          contentHash: data.contentHash
        })

        nodes[fileId] = fileNode
        fileIds.push(fileId)
        fileContents.set(fileId, data.content)
        folderNode.children.push(fileId)
      } catch (error) {
        errors.push({ path: entryPath, message: error.message })
        logger.error('Failed to read file', { path: entryPath, error })

        const fileNode = new FileNode({
          id: fileId,
          name: entry.name,
          relativePath: normalizedEntryRelative,
          sizeBytes: null,
          modifiedAt: null,
          contentHash: null
        })

        nodes[fileId] = fileNode
        fileIds.push(fileId)
        folderNode.children.push(fileId)
      }
    }

    return folderId
  }

  const rootId = walk(rootPath, '', 0, [])

  if (exceededLimit) {
    throw new Error(`Context graph has ${totalNodes} nodes, exceeding MAX_NODES (${maxNodes}).`)
  }

  // Compute folder contentHash bottom-up (deepest folders first)
  const folderOrder = [...folderIds].sort((a, b) => (folderDepths.get(b) || 0) - (folderDepths.get(a) || 0))
  for (const folderId of folderOrder) {
    const folderNode = nodes[folderId]
    if (!folderNode || !folderNode.children || folderNode.children.length === 0) {
      // Empty folder gets hash of empty string
      folderNode.contentHash = crypto.createHash('sha256').update('').digest('hex')
      continue
    }

    // Sort children by relativePath and concatenate their contentHash values
    const childHashes = folderNode.children
      .map((childId) => nodes[childId])
      .filter((child) => child && child.contentHash)
      .sort((a, b) => a.relativePath.localeCompare(b.relativePath))
      .map((child) => child.contentHash)
      .join('')

    folderNode.contentHash = crypto.createHash('sha256').update(childHashes).digest('hex')
  }

  return {
    nodes,
    rootId,
    counts: {
      files: fileIds.length,
      folders: folderIds.length
    },
    fileIds,
    folderIds,
    folderDepths,
    fileContents,
    errors,
    warnings,
    ignores
  }
}

module.exports = {
  constructContextGraphSkeleton,
  MAX_NODES
}
