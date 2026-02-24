const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const {
  RG_WARNING_CODE,
  resolveRgBinaryPath,
  scanAndRedactContent
} = require('../src/security/rg-redaction')

const makeTempDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-rg-redaction-test-'))

const writeStubRgBinary = ({ scriptBody }) => {
  const tempDir = makeTempDir()
  const stubPath = path.join(tempDir, 'rg-stub.js')
  fs.writeFileSync(
    stubPath,
    ['#!/usr/bin/env node', scriptBody, ''].join('\n'),
    'utf-8'
  )
  fs.chmodSync(stubPath, 0o755)
  return { tempDir, stubPath }
}

test('scanAndRedactContent redacts provider keys and password values', async () => {
  const { stubPath } = writeStubRgBinary({
    scriptBody: [
      'let input = "";',
      'process.stdin.setEncoding("utf8");',
      'process.stdin.on("data", (chunk) => { input += chunk; });',
      'process.stdin.on("end", () => {',
      '  const lines = input.split(/\\n/);',
      '  for (let i = 0; i < lines.length; i += 1) {',
      '    const line = lines[i];',
      '    if (line.includes("sk-") || line.toLowerCase().includes("password")) {',
      '      process.stdout.write(JSON.stringify({ type: "match", data: { line_number: i + 1, submatches: [{ match: { text: "x" }, start: 0, end: 1 }] } }) + "\\n");',
      '    }',
      '  }',
      '  process.exit(0);',
      '});'
    ].join('\n')
  })

  const prior = process.env.FAMILIAR_RG_BINARY
  process.env.FAMILIAR_RG_BINARY = stubPath

  try {
    const result = await scanAndRedactContent({
      content: [
        'openai=sk-123456789012345678901234',
        'password: "abc12345"'
      ].join('\n')
    })

    assert.equal(result.redactionBypassed, false)
    assert.equal(result.findings >= 2, true)
    assert.match(result.content, /\[REDACTED:openai_sk\]/)
    assert.match(result.content, /password: "\[REDACTED:password_assignment\]"/i)
  } finally {
    if (prior === undefined) {
      delete process.env.FAMILIAR_RG_BINARY
    } else {
      process.env.FAMILIAR_RG_BINARY = prior
    }
  }
})

test('scanAndRedactContent redacts placeholder-like values in token assignments', async () => {
  const { stubPath } = writeStubRgBinary({
    scriptBody: [
      'let input = "";',
      'process.stdin.setEncoding("utf8");',
      'process.stdin.on("data", (chunk) => { input += chunk; });',
      'process.stdin.on("end", () => {',
      '  const lines = input.split(/\\n/);',
      '  for (let i = 0; i < lines.length; i += 1) {',
      '    process.stdout.write(JSON.stringify({ type: "match", data: { line_number: i + 1, submatches: [{ match: { text: "x" }, start: 0, end: 1 }] } }) + "\\n");',
      '  }',
      '  process.exit(0);',
      '});'
    ].join('\n')
  })

  const prior = process.env.FAMILIAR_RG_BINARY
  process.env.FAMILIAR_RG_BINARY = stubPath

  try {
    const content = [
      'api_key=YOUR_API_KEY',
      'token=abc123456789012345678901234567'
    ].join('\n')

    const result = await scanAndRedactContent({ content })

    assert.equal(result.content.split('\n')[0], 'api_key=[REDACTED:generic_api_assignment]')
    assert.match(result.content, /\[REDACTED:generic_api_assignment\]/)
    assert.doesNotMatch(result.content, /abc123456789012345678901234567/)
  } finally {
    if (prior === undefined) {
      delete process.env.FAMILIAR_RG_BINARY
    } else {
      process.env.FAMILIAR_RG_BINARY = prior
    }
  }
})

test('scanAndRedactContent retries once and bypasses with warning when scanner keeps failing', async () => {
  const { stubPath } = writeStubRgBinary({
    scriptBody: 'process.exit(2);'
  })

  const warnings = []
  const consoleWarnings = []

  const prior = process.env.FAMILIAR_RG_BINARY
  const priorConsoleWarn = console.warn
  console.warn = (...args) => {
    consoleWarnings.push(args)
  }
  process.env.FAMILIAR_RG_BINARY = stubPath

  try {
    const result = await scanAndRedactContent({
      content: 'api_key=sk-123456789012345678901234',
      fileType: 'clipboard',
      fileIdentifier: 'demo.txt',
      onRedactionWarning: (warning) => warnings.push(warning)
    })

    assert.equal(result.redactionBypassed, true)
    assert.equal(result.content, 'api_key=sk-123456789012345678901234')
    assert.equal(warnings.length, 1)
    assert.equal(warnings[0].code, RG_WARNING_CODE)
    assert.equal(consoleWarnings.length >= 2, true)
  } finally {
    console.warn = priorConsoleWarn
    if (prior === undefined) {
      delete process.env.FAMILIAR_RG_BINARY
    } else {
      process.env.FAMILIAR_RG_BINARY = prior
    }
  }
})

test('scanAndRedactContent redacts all lines covered by a multiline rg match event', async () => {
  const { stubPath } = writeStubRgBinary({
    scriptBody: [
      'let input = "";',
      'process.stdin.setEncoding("utf8");',
      'process.stdin.on("data", (chunk) => { input += chunk; });',
      'process.stdin.on("end", () => {',
      '  const linesText = input.endsWith("\\n") ? input : `${input}\\n`;',
      '  process.stdout.write(JSON.stringify({',
      '    type: "match",',
      '    data: {',
      '      line_number: 1,',
      '      lines: { text: linesText },',
      '      submatches: [{ match: { text: "x" }, start: 0, end: 1 }]',
      '    }',
      '  }) + "\\n");',
      '  process.exit(0);',
      '});'
    ].join('\n')
  })

  const prior = process.env.FAMILIAR_RG_BINARY
  process.env.FAMILIAR_RG_BINARY = stubPath

  try {
    const content = [
      'Authorization: Bearer abcdefghijklmnopqrstuvwxyz012345',
      'api_key = "abcDEF1234567890XYZ_+-/="',
      'password = "mysecretpass"',
      'openai=sk-abcdefghijklmnopqrstuvwxyz123456'
    ].join('\n')

    const result = await scanAndRedactContent({ content })

    assert.match(result.content, /\[REDACTED:auth_bearer\]/)
    assert.match(result.content, /api_key = "\[REDACTED:generic_api_assignment\]"/)
    assert.match(result.content, /password = "\[REDACTED:password_assignment\]"/)
    assert.match(result.content, /\[REDACTED:openai_sk\]/)
  } finally {
    if (prior === undefined) {
      delete process.env.FAMILIAR_RG_BINARY
    } else {
      process.env.FAMILIAR_RG_BINARY = prior
    }
  }
})

test('resolveRgBinaryPath uses env override when present', async () => {
  const { stubPath } = writeStubRgBinary({
    scriptBody: 'process.exit(0);'
  })

  const prior = process.env.FAMILIAR_RG_BINARY
  process.env.FAMILIAR_RG_BINARY = stubPath

  try {
    const resolved = await resolveRgBinaryPath()
    assert.equal(resolved, stubPath)
  } finally {
    if (prior === undefined) {
      delete process.env.FAMILIAR_RG_BINARY
    } else {
      process.env.FAMILIAR_RG_BINARY = prior
    }
  }
})
