const fs = require('node:fs/promises')
const path = require('node:path')

const buildExtractionPath = (inputPath) => {
  if (!inputPath) {
    return inputPath
  }

  const parsed = path.parse(inputPath)
  if (!parsed.ext) {
    return `${inputPath}-extraction.md`
  }

  return path.join(parsed.dir, `${parsed.name}-extraction.md`)
}

const writeExtractionFile = async ({ imagePath, markdown }) => {
  if (!imagePath) {
    throw new Error('Image path is required for extraction output.')
  }

  const outputPath = buildExtractionPath(imagePath)
  await fs.mkdir(path.dirname(outputPath), { recursive: true })
  const payload = markdown.endsWith('\n') ? markdown : `${markdown}\n`
  await fs.writeFile(outputPath, payload, 'utf-8')
  return outputPath
}

module.exports = {
  buildExtractionPath,
  writeExtractionFile
}

