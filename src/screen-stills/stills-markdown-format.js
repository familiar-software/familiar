const splitMarkdownBlocks = (text) => {
  if (typeof text !== 'string') {
    return []
  }
  const normalized = text.replace(/\r\n/g, '\n').trim()
  if (!normalized) {
    return []
  }
  const lines = normalized.split('\n')
  const starts = []
  for (let i = 0; i < lines.length - 1; i += 1) {
    if (lines[i].trim() === '---' && lines[i + 1].trim().startsWith('format:')) {
      starts.push(i)
    }
  }
  const segments = []
  if (starts.length === 0) {
    const rawSegments = normalized.split(/\n---\n/)
    for (const segment of rawSegments) {
      const trimmed = segment.trim()
      if (trimmed) {
        segments.push(trimmed)
      }
    }
    return segments
  }

  for (let i = 0; i < starts.length; i += 1) {
    const start = starts[i]
    const end = i + 1 < starts.length ? starts[i + 1] : lines.length
    let chunk = lines.slice(start, end)
    while (chunk.length > 0 && chunk[0].trim() === '') {
      chunk = chunk.slice(1)
    }
    while (chunk.length > 0 && chunk[chunk.length - 1].trim() === '') {
      chunk = chunk.slice(0, -1)
    }
    if (chunk.length > 1 && chunk[chunk.length - 1].trim() === '---') {
      chunk = chunk.slice(0, -1)
    }
    if (chunk.length > 0) {
      segments.push(chunk.join('\n').trim())
    }
  }

  return segments
}

const buildBatchPrompt = (basePrompt, imageIds) => {
  const idsLine = imageIds.map((id) => `- ${id}`).join('\n')
  return [
    'Return markdown for each image in the same order as provided.',
    'Do NOT return JSON or wrap in code fences.',
    'Separate each image response with a single line containing exactly ---',
    'Each image response must follow the exact format below.',
    'Keep the frontmatter --- lines inside each response as shown in the template.',
    '',
    basePrompt,
    '',
    'Image ids (in the same order as images are sent):',
    idsLine
  ].join('\n')
}

const parseBatchResponse = (responseText, imageIds = []) => {
  const segments = splitMarkdownBlocks(responseText)
  const map = new Map()
  const limit = Math.min(segments.length, imageIds.length)
  for (let i = 0; i < limit; i += 1) {
    const markdown = segments[i]
    if (!markdown) {
      continue
    }
    map.set(String(imageIds[i]), markdown.trim())
  }
  return map
}

module.exports = {
  buildBatchPrompt,
  parseBatchResponse
}

