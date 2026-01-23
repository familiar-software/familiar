const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')

const { createNodeId } = require('../context-graph')
const { GENERAL_ANALYSIS_DIR_NAME } = require('../const')
const { runAnalysis } = require('../analysis')

const makeTempDir = async (prefix) => fs.mkdtemp(path.join(os.tmpdir(), prefix))

const buildContextGraph = ({ rootPath, fileRelativePath }) => {
  const rootId = createNodeId({ relativePath: '', type: 'folder' })
  const folderRelative = path.dirname(fileRelativePath)
  const folderRelativeNormalized = folderRelative === '.' ? '' : folderRelative
  const folderId = createNodeId({ relativePath: folderRelativeNormalized, type: 'folder' })
  const fileId = createNodeId({ relativePath: fileRelativePath, type: 'file' })

  const nodes = {}
  nodes[rootId] = {
    id: rootId,
    type: 'folder',
    name: path.basename(rootPath),
    relativePath: '',
    summary: ''
  }

  if (folderRelativeNormalized) {
    nodes[folderId] = {
      id: folderId,
      type: 'folder',
      name: path.basename(folderRelativeNormalized),
      relativePath: folderRelativeNormalized,
      summary: ''
    }
  }

  nodes[fileId] = {
    id: fileId,
    type: 'file',
    name: path.basename(fileRelativePath),
    relativePath: fileRelativePath,
    summary: ''
  }

  return {
    version: 1,
    rootPath,
    rootId,
    nodes
  }
}

test('analysis writes summary alongside relevant node folder', async () => {
  const contextRoot = await makeTempDir('jiminy-context-')
  const projectDir = path.join(contextRoot, 'project')
  await fs.mkdir(projectDir, { recursive: true })
  await fs.writeFile(path.join(projectDir, 'notes.md'), '# Notes\n', 'utf-8')

  const extractionDir = await makeTempDir('jiminy-extraction-')
  const extractionPath = path.join(extractionDir, 'capture-extraction.md')
  await fs.writeFile(extractionPath, 'Extraction content', 'utf-8')

  const graph = buildContextGraph({ rootPath: contextRoot, fileRelativePath: path.join('project', 'notes.md') })
  const fileNode = Object.values(graph.nodes).find((node) => node.type === 'file')

  const result = await runAnalysis({
    resultMdPath: extractionPath,
    contextGraph: graph,
    contextFolderPath: contextRoot,
    summarizeFn: async () => 'Summary of extraction.',
    findRelevantNodeFn: async () => fileNode
  })

  const expectedDir = path.join(contextRoot, 'project', 'notes-jiminy-extra-context')
  const expectedFile = path.join(expectedDir, 'capture-analysis.md')

  assert.equal(result.outputPath, expectedFile)
  assert.ok(await fs.stat(result.outputPath))
})

test('analysis writes summary to general analysis folder when no relevant node found', async () => {
  const contextRoot = await makeTempDir('jiminy-context-')
  const extractionDir = await makeTempDir('jiminy-extraction-')
  const extractionPath = path.join(extractionDir, 'capture-extraction.md')
  await fs.writeFile(extractionPath, 'Extraction content', 'utf-8')

  const graph = buildContextGraph({ rootPath: contextRoot, fileRelativePath: path.join('project', 'notes.md') })

  const result = await runAnalysis({
    resultMdPath: extractionPath,
    contextGraph: graph,
    contextFolderPath: contextRoot,
    summarizeFn: async () => 'Summary of extraction.',
    findRelevantNodeFn: async () => null
  })

  const expectedFile = path.join(
    contextRoot,
    GENERAL_ANALYSIS_DIR_NAME,
    'capture-analysis.md'
  )

  assert.equal(result.outputPath, expectedFile)
  assert.ok(await fs.stat(result.outputPath))
})
