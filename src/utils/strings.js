const normalizeAppString = (value, defaultValue) => {

  if (typeof value !== 'string') {
    return defaultValue
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : defaultValue
}

const unionStringLists = (left = [], right = []) => {
  const seen = new Set()
  const merged = []

  const values = [...(Array.isArray(left) ? left : []), ...(Array.isArray(right) ? right : [])]
  for (const value of values) {
    if (typeof value !== 'string') {
      continue
    }
    if (seen.has(value)) {
      continue
    }
    seen.add(value)
    merged.push(value)
  }

  return merged
}

module.exports = {
  normalizeAppString,
  unionStringLists
}
