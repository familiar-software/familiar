const toSafeNumber = (value, fallback = 0) => {
  const next = Number(value)
  return Number.isFinite(next) ? next : fallback
}

const toSafeString = (value, fallback = '') =>
  typeof value === 'string' ? value.trim() : fallback

const safeFsPath = (value) => (typeof value === 'string' ? value.trim() : '')

module.exports = {
  toSafeNumber,
  toSafeString,
  safeFsPath
}
