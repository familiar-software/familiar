const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const {
  parseDuKilobytes,
  getDuSizeBytes,
  getStorageUsageBreakdown
} = require('../src/storage/usage-breakdown')

test('parseDuKilobytes parses first du output field', () => {
  assert.equal(parseDuKilobytes('123\t/tmp/x\n'), 123)
  assert.equal(parseDuKilobytes('0 /tmp/x'), 0)
  assert.equal(parseDuKilobytes('invalid output'), 0)
})

test('getDuSizeBytes uses du -skA output when available', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-du-usage-'))
  const targetPath = path.join(root, 'example')
  fs.mkdirSync(targetPath, { recursive: true })
  const calls = []
  const bytes = getDuSizeBytes({
    targetPath,
    options: {
      execFile: (cmd, args) => {
        calls.push([cmd, ...args])
        if (cmd === 'du' && args[0] === '-skA') {
          return `42\t${targetPath}\n`
        }
        throw new Error('unexpected invocation')
      }
    }
  })

  assert.equal(bytes, 42 * 1024)
  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0], ['du', '-skA', targetPath])
  fs.rmSync(root, { recursive: true, force: true })
})

test('getDuSizeBytes falls back to du -sk when -A is unavailable', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-du-fallback-'))
  const targetPath = path.join(root, 'example')
  fs.mkdirSync(targetPath, { recursive: true })
  const calls = []
  const bytes = getDuSizeBytes({
    targetPath,
    options: {
      execFile: (cmd, args) => {
        calls.push([cmd, ...args])
        if (cmd === 'du' && args[0] === '-skA') {
          throw new Error('unknown option -- A')
        }
        return `11\t${targetPath}\n`
      }
    }
  })

  assert.equal(bytes, 11 * 1024)
  assert.equal(calls.length, 2)
  assert.deepEqual(calls[0], ['du', '-skA', targetPath])
  assert.deepEqual(calls[1], ['du', '-sk', targetPath])
  fs.rmSync(root, { recursive: true, force: true })
})

test('getStorageUsageBreakdown uses du category values and computes system as subtraction', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-storage-breakdown-'))
  const contextFolderPath = path.join(root, 'context')
  const familiarRoot = path.join(contextFolderPath, 'familiar')
  const stillsRoot = path.join(familiarRoot, 'stills')
  const markdownRoot = path.join(familiarRoot, 'stills-markdown')
  fs.mkdirSync(stillsRoot, { recursive: true })
  fs.mkdirSync(markdownRoot, { recursive: true })

  const outputsByPath = new Map([
    [familiarRoot, `1000\t${familiarRoot}\n`],
    [stillsRoot, `300\t${stillsRoot}\n`],
    [markdownRoot, `200\t${markdownRoot}\n`]
  ])

  const usage = getStorageUsageBreakdown({
    contextFolderPath,
    execFile: (_cmd, args) => {
      const output = outputsByPath.get(args[1])
      return output || '0\tunknown\n'
    }
  })

  assert.equal(usage.totalBytes, 1000 * 1024)
  assert.equal(usage.screenshotsBytes, 300 * 1024)
  assert.equal(usage.steelsMarkdownBytes, 200 * 1024)
  assert.equal(usage.systemBytes, 500 * 1024)
  fs.rmSync(root, { recursive: true, force: true })
})
