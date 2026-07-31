const test = require('node:test')
const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const appRoot = path.resolve(__dirname, '..')

const createMachOExecutable = (filePath, cpuType) => {
  const header = Buffer.alloc(32)
  header.writeUInt32LE(0xfeedfacf, 0)
  header.writeUInt32LE(cpuType, 4)
  header.writeUInt32LE(0, 8)
  header.writeUInt32LE(2, 12)
  fs.writeFileSync(filePath, header)
}

const createBundleFixture = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-rg-bundle-test-'))
  const scriptsDir = path.join(root, 'scripts')
  const fakeBinDir = path.join(root, 'fake-bin')
  fs.mkdirSync(scriptsDir)
  fs.mkdirSync(fakeBinDir)
  fs.copyFileSync(
    path.join(appRoot, 'scripts', 'build-rg-bundle.sh'),
    path.join(scriptsDir, 'build-rg-bundle.sh')
  )

  const fakeUnamePath = path.join(fakeBinDir, 'uname')
  fs.writeFileSync(fakeUnamePath, '#!/bin/sh\necho Linux\n')
  fs.chmodSync(fakeUnamePath, 0o755)

  const arm64Source = path.join(root, 'rg-darwin-arm64')
  const x64Source = path.join(root, 'rg-darwin-x64')
  createMachOExecutable(arm64Source, 0x0100000c)
  createMachOExecutable(x64Source, 0x01000007)

  return { root, fakeBinDir, arm64Source, x64Source }
}

const runBundleBuild = (fixture) => spawnSync(
  'bash',
  [path.join(fixture.root, 'scripts', 'build-rg-bundle.sh')],
  {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${fixture.fakeBinDir}:${process.env.PATH}`,
      FAMILIAR_RG_DARWIN_ARM64_SOURCE: fixture.arm64Source,
      FAMILIAR_RG_DARWIN_X64_SOURCE: fixture.x64Source
    }
  }
)

test('rg bundle build validates macOS binaries without executing them on Linux', (t) => {
  const fixture = createBundleFixture()
  t.after(() => fs.rmSync(fixture.root, { recursive: true, force: true }))

  const result = runBundleBuild(fixture)

  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stderr, /RG bundle ready/)
  assert.equal(
    fs.existsSync(path.join(fixture.root, 'scripts', 'bin', 'rg', 'rg-darwin-arm64')),
    true
  )
  assert.equal(
    fs.existsSync(path.join(fixture.root, 'scripts', 'bin', 'rg', 'rg-darwin-x64')),
    true
  )
})

test('rg bundle build rejects a binary with the wrong file format', (t) => {
  const fixture = createBundleFixture()
  t.after(() => fs.rmSync(fixture.root, { recursive: true, force: true }))
  fs.writeFileSync(fixture.x64Source, 'not a Mach-O executable')

  const result = runBundleBuild(fixture)

  assert.equal(result.status, 1)
  assert.match(result.stderr, /Invalid rg binary/)
})
