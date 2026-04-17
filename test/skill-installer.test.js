const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const {
  resolveHarnessSkillPath,
  installSkill,
  getSkillInstallStatus
} = require('../src/skills/installer')

test('skill installer', async (t) => {
  await t.test('resolveHarnessSkillPath builds harness-specific destinations', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-skill-paths-'))
    const homeDir = path.join(tempRoot, 'home')
    fs.mkdirSync(homeDir, { recursive: true })

    assert.equal(
      resolveHarnessSkillPath('codex', { homeDir }),
      path.join(homeDir, '.codex', 'skills', 'familiar')
    )
    assert.equal(
      resolveHarnessSkillPath('claude', { homeDir }),
      path.join(homeDir, '.claude', 'skills', 'familiar')
    )
    assert.equal(
      resolveHarnessSkillPath('cursor', { homeDir }),
      path.join(homeDir, '.cursor', 'skills', 'familiar')
    )
  })

  await t.test('installSkill copies and overwrites the destination', async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-skill-install-'))
    const homeDir = path.join(tempRoot, 'home')
    const sourceDir = path.join(tempRoot, 'source')
    const agentDir = path.join(sourceDir, 'agents')
    fs.mkdirSync(agentDir, { recursive: true })
    fs.writeFileSync(path.join(sourceDir, 'SKILL.md'), 'source-skill', 'utf-8')
    fs.writeFileSync(path.join(agentDir, 'openai.yaml'), 'source-config', 'utf-8')

    const firstInstall = await installSkill({ harness: 'codex', sourceDir, homeDir })
    const dest = firstInstall.path
    assert.equal(fs.readFileSync(path.join(dest, 'SKILL.md'), 'utf-8'), 'source-skill')

    fs.writeFileSync(path.join(dest, 'SKILL.md'), 'old-skill', 'utf-8')
    await installSkill({ harness: 'codex', sourceDir, homeDir })
    assert.equal(fs.readFileSync(path.join(dest, 'SKILL.md'), 'utf-8'), 'source-skill')
  })

  await t.test('installSkill is asar-safe (does not rely on fs.promises.cp)', async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-skill-asar-safe-'))
    const homeDir = path.join(tempRoot, 'home')
    const sourceDir = path.join(tempRoot, 'source')
    fs.mkdirSync(path.join(sourceDir, 'agents'), { recursive: true })
    fs.writeFileSync(path.join(sourceDir, 'SKILL.md'), 'source-skill', 'utf-8')
    fs.writeFileSync(path.join(sourceDir, 'agents', 'openai.yaml'), 'source-config', 'utf-8')

    const originalCp = fs.promises.cp
    fs.promises.cp = async () => {
      const error = new Error('ENOTDIR: not a directory, opendir \"/fake/app.asar/src/skills/familiar\"')
      error.code = 'ENOTDIR'
      throw error
    }

    try {
      const result = await installSkill({ harness: 'cursor', sourceDir, homeDir })
      assert.ok(result && result.path)
      assert.equal(fs.readFileSync(path.join(result.path, 'SKILL.md'), 'utf-8'), 'source-skill')
      assert.equal(
        fs.readFileSync(path.join(result.path, 'agents', 'openai.yaml'), 'utf-8'),
        'source-config'
      )
    } finally {
      fs.promises.cp = originalCp
    }
  })

  await t.test('getSkillInstallStatus reflects presence of the skill directory', async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-skill-status-'))
    const homeDir = path.join(tempRoot, 'home')
    const sourceDir = path.join(tempRoot, 'source')
    fs.mkdirSync(path.join(sourceDir, 'agents'), { recursive: true })
    fs.writeFileSync(path.join(sourceDir, 'SKILL.md'), 'skill', 'utf-8')

    const missingStatus = getSkillInstallStatus({ harness: 'cursor', homeDir })
    assert.equal(missingStatus.installed, false)

    await installSkill({ harness: 'cursor', sourceDir, homeDir })
    const installedStatus = getSkillInstallStatus({ harness: 'cursor', homeDir })
    assert.equal(installedStatus.installed, true)
  })

  await t.test('installSkill does not delete an existing install when the source dir is invalid', async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-skill-nondestructive-'))
    const homeDir = path.join(tempRoot, 'home')
    fs.mkdirSync(homeDir, { recursive: true })

    const dest = resolveHarnessSkillPath('codex', { homeDir })
    fs.mkdirSync(dest, { recursive: true })
    fs.writeFileSync(path.join(dest, 'SKILL.md'), 'existing-skill', 'utf-8')

    const missingSourceDir = path.join(tempRoot, 'does-not-exist')
    await assert.rejects(
      () => installSkill({ harness: 'codex', sourceDir: missingSourceDir, homeDir }),
      /Skill source directory/
    )

    assert.equal(fs.readFileSync(path.join(dest, 'SKILL.md'), 'utf-8'), 'existing-skill')
  })
})
