const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const DASHBOARD_HTML_PATH = path.join(__dirname, '..', 'src', 'dashboard', 'index.html')

function getStorageSectionMarkup() {
  const markup = fs.readFileSync(DASHBOARD_HTML_PATH, 'utf-8')
  const start = markup.indexOf('<section id="section-storage"')
  const end = markup.indexOf('<section id="section-install-skill"')

  assert.notEqual(start, -1, 'Storage section should exist in dashboard markup')
  assert.notEqual(end, -1, 'Install skill section should exist in dashboard markup')
  assert.ok(end > start, 'Install skill section should come after storage section')

  return markup.slice(start, end)
}

test('storage section no longer renders a danger zone heading', () => {
  const storageMarkup = getStorageSectionMarkup()

  assert.equal(
    storageMarkup.includes('dashboard.html.storageDangerZone'),
    false,
    'Storage section should not render the danger zone heading copy key'
  )
})

test('storage section renders images retention before delete recent files', () => {
  const storageMarkup = getStorageSectionMarkup()

  const retentionIndex = storageMarkup.indexOf('dashboard.html.storageImagesRetentionTitle')
  const deleteRecentIndex = storageMarkup.indexOf('dashboard.html.storageDeleteRecentFilesTitle')

  assert.notEqual(retentionIndex, -1, 'Images retention heading should be present')
  assert.notEqual(deleteRecentIndex, -1, 'Delete recent files heading should be present')
  assert.ok(
    retentionIndex < deleteRecentIndex,
    'Images retention heading should appear before delete recent files heading'
  )
})

test('storage headings render above gray cards with details inside each card', () => {
  const storageMarkup = getStorageSectionMarkup()

  const imagesHeading = '<h3 class="section-label" data-copy-key="dashboard.html.storageImagesRetentionTitle"></h3>'
  const deleteHeading = '<h3 class="section-label" data-copy-key="dashboard.html.storageDeleteRecentFilesTitle"></h3>'
  const grayCardClass = 'bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg overflow-hidden'

  const imagesHeadingIndex = storageMarkup.indexOf(imagesHeading)
  const imagesCardIndex = storageMarkup.indexOf(grayCardClass, imagesHeadingIndex)
  const imagesDescriptionIndex = storageMarkup.indexOf('dashboard.html.storageImagesRetentionDescription')
  const deleteHeadingIndex = storageMarkup.indexOf(deleteHeading)
  const deleteCardIndex = storageMarkup.indexOf(grayCardClass, deleteHeadingIndex)
  const deleteDescriptionIndex = storageMarkup.indexOf('dashboard.html.storageDeleteRecentFilesDescription')

  assert.notEqual(imagesHeadingIndex, -1, 'Images retention should use section-label heading')
  assert.notEqual(deleteHeadingIndex, -1, 'Delete recent files should use section-label heading')
  assert.notEqual(imagesCardIndex, -1, 'Images retention gray card should be present')
  assert.notEqual(deleteCardIndex, -1, 'Delete recent files gray card should be present')
  assert.ok(imagesHeadingIndex < imagesCardIndex, 'Images retention heading should be above its gray card')
  assert.ok(deleteHeadingIndex < deleteCardIndex, 'Delete recent files heading should be above its gray card')
  assert.ok(imagesCardIndex < imagesDescriptionIndex, 'Images retention details should be inside its gray card')
  assert.ok(deleteCardIndex < deleteDescriptionIndex, 'Delete recent files details should be inside its gray card')
})
