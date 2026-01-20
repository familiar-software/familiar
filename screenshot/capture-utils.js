function normalizeRect (rect) {
  if (!rect) {
    return null
  }

  const rawWidth = Number.isFinite(rect.width) ? rect.width : rect.w
  const rawHeight = Number.isFinite(rect.height) ? rect.height : rect.h

  if (!Number.isFinite(rect.x) || !Number.isFinite(rect.y) || !Number.isFinite(rawWidth) || !Number.isFinite(rawHeight)) {
    return null
  }

  const x2 = rect.x + rawWidth
  const y2 = rect.y + rawHeight
  const x = Math.min(rect.x, x2)
  const y = Math.min(rect.y, y2)
  const width = Math.abs(rawWidth)
  const height = Math.abs(rawHeight)

  return { x, y, width, height }
}

function scaleRect (rect, scaleFactor) {
  if (!rect || !Number.isFinite(scaleFactor) || scaleFactor <= 0) {
    return null
  }

  return {
    x: Math.round(rect.x * scaleFactor),
    y: Math.round(rect.y * scaleFactor),
    width: Math.round(rect.width * scaleFactor),
    height: Math.round(rect.height * scaleFactor)
  }
}

function clampRectToBounds (rect, bounds) {
  if (!rect || !bounds || !Number.isFinite(bounds.width) || !Number.isFinite(bounds.height)) {
    return null
  }

  const maxX = Math.max(0, bounds.width)
  const maxY = Math.max(0, bounds.height)

  if (rect.x >= maxX || rect.y >= maxY) {
    return null
  }

  const x = Math.min(Math.max(0, rect.x), Math.max(0, maxX - 1))
  const y = Math.min(Math.max(0, rect.y), Math.max(0, maxY - 1))
  const width = Math.min(rect.width, maxX - x)
  const height = Math.min(rect.height, maxY - y)

  if (width <= 0 || height <= 0) {
    return null
  }

  return { x, y, width, height }
}

function getCropRect (rectCss, scaleFactor, imageSize) {
  const normalized = normalizeRect(rectCss)
  if (!normalized || normalized.width <= 0 || normalized.height <= 0) {
    return null
  }

  const scaled = scaleRect(normalized, scaleFactor)
  if (!scaled) {
    return null
  }

  return clampRectToBounds(scaled, imageSize)
}

module.exports = {
  normalizeRect,
  scaleRect,
  clampRectToBounds,
  getCropRect
}
