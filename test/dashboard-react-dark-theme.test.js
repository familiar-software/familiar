const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const reactCssPath = path.join(__dirname, '../src/dashboard/react.css')
const reactCss = fs.readFileSync(reactCssPath, 'utf8')

test('legacy dashboard stylesheet defines dark surfaces for install guide card and shell', () => {
  assert.match(reactCss, /@media \(prefers-color-scheme: dark\)/)
  assert.match(reactCss, /\.react-shell\s*\{\s*background: #111111;\s*color: #f4f4f5;/)
  assert.match(
    reactCss,
    /\.react-install-guide-card\s*\{\s*border-color: #27272a;\s*background: #18181b;\s*color: #f4f4f5;/
  )
})

test('legacy dashboard stylesheet defines dark skill-picker surfaces', () => {
  assert.match(
    reactCss,
    /\.react-skill-picker-option-card\s*\{\s*border-color: #3f3f46;\s*color: #e4e4e7;/
  )
  assert.match(
    reactCss,
    /\.react-skill-picker-option-card:hover\s*\{\s*background: rgba\(39, 39, 42, 0.6\);/
  )
})
