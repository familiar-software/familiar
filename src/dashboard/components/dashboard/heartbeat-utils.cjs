const toSafeString = (value, fallback = '') => (typeof value === 'string' ? value.trim() : fallback)

const resolveHeartbeatField = (payload, field, fallback = '') => {
  const direct = toSafeString(payload?.[field], '')
  if (direct) {
    return direct
  }
  if (!payload || typeof payload !== 'object') {
    return fallback
  }
  return toSafeString(payload.schedule?.[field], fallback)
}

module.exports = {
  resolveHeartbeatField
}
