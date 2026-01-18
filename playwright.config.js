const { defineConfig } = require('playwright/test')

module.exports = defineConfig({
  testDir: './test/e2e',
  timeout: 30000,
  workers: 1,
  reporter: 'list',
  use: {
    trace: 'on-first-retry'
  }
})
