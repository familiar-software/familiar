const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { FileNode, FolderNode, createNodeId, normalizeRelativePath } = require('./nodes')

const MAX_NODES = 300
const ALLOWED_EXTENSIONS = new Set(['.md', '.txt'])

const hashBuffer = (buffer) => (
  crypto.createHash('sha256').update(buffer).digest('hex')
)

const readFileData = (filePath) => {
  const stat = fs.statSync(filePath)
  const buffer = fs.readFileSync(filePath)
  return {
    sizeBytes: stat.size,
    modifiedAt: stat.mtime.toISOString(),
    content: buffer.toString('utf-8'),
    contentHash: hashBuffer(buffer)
  }
}

const scanContextFolder = (rootPath, { logger = console, maxNodes = MAX_NODES, exclusions = [] } = {}) => {
  const nodes = {}
  const fileContents = new Map()
  const fileIds = []
  const folderIds = []
  const folderDepths = new Map()
  const errors = []
  const warnings = []
  const visitedDirs = new Set()
  let totalNodes = 0
  let exceededLimit = false

  const exclusionSet = new Set(
    exclusions.map((p) => p.replace(/\\/g, '/').replace(/^\/+|\/+$/g, ''))
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

  const registerNode = () => {
    totalNodes += 1
    if (totalNodes > maxNodes) {
      exceededLimit = true
    }
  }

  const walk = (currentPath, relativePath, depth) => {
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

      if (isExcluded(normalizedEntryRelative)) {
        logger.log('Skipping excluded path', { path: normalizedEntryRelative })
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
        continue
      }

      if (entry.isDirectory()) {
        const childId = walk(entryPath, normalizedEntryRelative, depth + 1)
        if (childId) {
          folderNode.children.push(childId)
        }
        continue
      }

      if (!entry.isFile()) {
        continue
      }

      const extension = path.extname(entry.name).toLowerCase()
      if (!ALLOWED_EXTENSIONS.has(extension)) {
        logger.log('Skipping unsupported file', { path: entryPath, extension })
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

  const rootId = walk(rootPath, '', 0)

  if (exceededLimit) {
    throw new Error(`Context graph has ${totalNodes} nodes, exceeding MAX_NODES (${maxNodes}).`)
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
    warnings
  }
}

const collectFileSummaries = (nodes, folderId, cache) => {
  if (cache.has(folderId)) {
    return cache.get(folderId)
  }

  const node = nodes[folderId]
  const summaries = []

  for (const childId of node.children || []) {
    const child = nodes[childId]
    if (!child) {
      continue
    }

    if (child.type === 'file') {
      if (child.summary) {
        summaries.push({ relativePath: child.relativePath, summary: child.summary })
      }
    } else if (child.type === 'folder') {
      summaries.push(...collectFileSummaries(nodes, childId, cache))
    }
  }

  cache.set(folderId, summaries)
  return summaries
}

const formatSummaries = (summaries) => summaries
  .map((item) => `- ${item.relativePath}: ${item.summary}`)
  .join('\n')

const syncContextGraph = async ({
  rootPath,
  store,
  summarizer,
  onProgress = () => {},
  logger = console,
  maxNodes = MAX_NODES,
  exclusions = []
}) => {
  const start = Date.now()
  logger.log('Context graph sync started', { rootPath })

  const previousGraph = store.load()
  const previousNodes = previousGraph?.nodes || {}

  const scanResult = scanContextFolder(rootPath, { logger, maxNodes, exclusions })
  const {
    nodes,
    rootId,
    counts,
    fileIds,
    folderIds,
    folderDepths,
    fileContents,
    errors,
    warnings
  } = scanResult

  const total = counts.files + counts.folders
  let completed = 0
  const markProgress = (node, phase) => {
    completed += 1
    onProgress({
      completed,
      total,
      phase,
      type: node.type,
      relativePath: node.relativePath
    })
  }

  const now = new Date().toISOString()

  for (const fileId of fileIds) {
    const node = nodes[fileId]
    const previous = previousNodes[fileId]
    const content = fileContents.get(fileId)

    if (
      previous &&
      previous.contentHash &&
      node.contentHash &&
      previous.contentHash === node.contentHash &&
      typeof previous.summary === 'string' &&
      previous.summary.trim().length > 0
    ) {
      node.summary = previous.summary
      node.summaryUpdatedAt = previous.summaryUpdatedAt || null
      markProgress(node, 'file:cached')
      continue
    }

    if (!content) {
      errors.push({ path: node.relativePath, message: 'File content unavailable for summary.' })
      markProgress(node, 'file:skipped')
      continue
    }

    try {
      const summary = await summarizer.summarizeFile({
        relativePath: node.relativePath,
        content
      })
      if (!summary || summary.trim().length === 0) {
        throw new Error('LLM returned empty summary.')
      }

      node.summary = summary
      node.summaryUpdatedAt = now
      markProgress(node, 'file:summarized')
    } catch (error) {
      errors.push({ path: node.relativePath, message: error.message })
      logger.error('Failed to summarize file', { path: node.relativePath, error })
      markProgress(node, 'file:error')
    }
  }

  const folderOrder = [...folderIds].sort((a, b) => (folderDepths.get(b) || 0) - (folderDepths.get(a) || 0))
  const folderSummaryCache = new Map()

  for (const folderId of folderOrder) {
    const node = nodes[folderId]
    const summaries = collectFileSummaries(nodes, folderId, folderSummaryCache)

    if (summaries.length === 0) {
      node.summary = ''
      node.summaryUpdatedAt = null
      markProgress(node, 'folder:empty')
      continue
    }

    try {
      const summary = await summarizer.summarizeFolder({
        relativePath: node.relativePath,
        summaries: formatSummaries(summaries)
      })
      if (!summary || summary.trim().length === 0) {
        throw new Error('LLM returned empty summary.')
      }

      node.summary = summary
      node.summaryUpdatedAt = now
      markProgress(node, 'folder:summarized')
    } catch (error) {
      errors.push({ path: node.relativePath, message: error.message })
      logger.error('Failed to summarize folder', { path: node.relativePath, error })
      markProgress(node, 'folder:error')
    }
  }

  const graph = {
    version: 1,
    rootPath,
    generatedAt: now,
    model: summarizer.model || null,
    rootId,
    counts,
    nodes: Object.fromEntries(
      Object.entries(nodes).map(([id, node]) => [id, node.toJSON ? node.toJSON() : node])
    )
  }

  store.save(graph)

  const durationMs = Date.now() - start
  logger.log('Context graph sync completed', {
    rootPath,
    files: counts.files,
    folders: counts.folders,
    errors: errors.length,
    durationMs
  })

  return { graph, errors, warnings, durationMs }
}

module.exports = {
  syncContextGraph,
  MAX_NODES
}
