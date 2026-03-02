const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const {
  getFamiliarSkillSourceVersion,
  parseFrontmatterField,
  normalizeSkillVersion
} = require('../src/skills/familiar-skill-version')

test('familiar skill version metadata', async (t) => {
  await t.test('getFamiliarSkillSourceVersion reads version from frontmatter', async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-skill-source-version-'))
    const sourceDir = path.join(tempRoot, 'source')
    fs.mkdirSync(path.join(sourceDir, 'agents'), { recursive: true })
    fs.writeFileSync(
      path.join(sourceDir, 'SKILL.md'),
      [
        '---',
        'name: familiar',
        'version: 2.4.6',
        '---',
        '# Familiar Skill'
      ].join('\n'),
      'utf-8'
    )

    const version = await getFamiliarSkillSourceVersion({ sourceDir })
    assert.equal(version, '2.4.6')
  })

  await t.test('getFamiliarSkillSourceVersion treats missing version as unknown', async () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-skill-source-version-missing-'))
    const sourceDir = path.join(tempRoot, 'source')
    fs.mkdirSync(path.join(sourceDir, 'agents'), { recursive: true })
    fs.writeFileSync(path.join(sourceDir, 'SKILL.md'), '---\nname: familiar\n---', 'utf-8')

    const version = await getFamiliarSkillSourceVersion({ sourceDir })
    assert.equal(version, 'unknown')
  })

  await t.test('parseFrontmatterField reads the requested key from top frontmatter', () => {
    const doc = [
      '---',
      'name: familiar',
      'version: "3.1.0"',
      '---',
      'body'
    ].join('\n')

    assert.equal(parseFrontmatterField(doc, 'name'), 'familiar')
    assert.equal(parseFrontmatterField(doc, 'version'), '3.1.0')
    assert.equal(parseFrontmatterField(doc, 'missing'), null)
  })

  await t.test('normalizeSkillVersion maps empty values to unknown', () => {
    assert.equal(normalizeSkillVersion(''), 'unknown')
    assert.equal(normalizeSkillVersion('   '), 'unknown')
    assert.equal(normalizeSkillVersion('3.1.0'), '3.1.0')
  })
})
