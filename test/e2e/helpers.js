const assert = require('node:assert')

const confirmMoveContextFolder = async (window) => {
  const confirmDialog = await window.waitForEvent('dialog')
  assert.equal(confirmDialog.type(), 'confirm', 'Expected a confirm dialog when moving context folder')
  const message = String(confirmDialog.message() || '')
  assert.match(
    message.toLowerCase(),
    /context folder/,
    'Expected context folder move confirmation message'
  )
  await confirmDialog.accept()
  return confirmDialog
}

module.exports = {
  confirmMoveContextFolder
}
