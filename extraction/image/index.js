const fs = require('node:fs/promises')
const path = require('node:path')
const { generateVisionContent } = require('../../modelProviders/gemini')

const DEFAULT_VISION_MODEL = 'gemini-2.0-flash'
const DEFAULT_VISION_MIME = 'image/png'

const MIME_BY_EXTENSION = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp'
}

const buildImageExtractionPrompt = () => (
  'You are extracting information from an image. Output Markdown only.\n' +
  'Rules:\n' +
  '- Describe exactly what is visible. Be exhaustive but concise.\n' +
  '- Do not guess or infer hidden content. If something is unclear, say so.\n' +
  '- If any text is present, explain its context (where it appears and what it belongs to) before providing the full text.\n' +
  '- Provide the full text exactly as shown, preserving line breaks, punctuation, and capitalization.\n' +
  'Format:\n' +
  '# Image Extraction\n' +
  '## Description\n' +
  '## Text Context\n' +
  'If no text is present, say \"No text present.\"\n' +
  '## Full Text\n' +
  'If text is present, put it in a fenced code block.\n'
)

const inferMimeType = (imagePath, fallback = DEFAULT_VISION_MIME) => {
  if (!imagePath) {
    return fallback
  }

  const extension = path.extname(imagePath).toLowerCase()
  return MIME_BY_EXTENSION[extension] || fallback
}

const readImageAsBase64 = async (imagePath) => {
  if (!imagePath) {
    throw new Error('Image path is required to read image data.')
  }

  const buffer = await fs.readFile(imagePath)
  return buffer.toString('base64')
}

const createGeminiVisionExtractor = ({ apiKey, model = DEFAULT_VISION_MODEL, fetchImpl } = {}) => ({
  model,
  extract: async ({ imageBase64, mimeType, prompt }) => generateVisionContent({
    apiKey,
    model,
    prompt,
    imageBase64,
    mimeType,
    fetchImpl
  })
})

const createMockVisionExtractor = ({ text = 'gibberish', model = 'mock' } = {}) => ({
  model,
  extract: async () => text
})

const createVisionExtractor = (options = {}) => {
  if (process.env.JIMINY_LLM_MOCK === '1') {
    return createMockVisionExtractor({ text: process.env.JIMINY_LLM_MOCK_TEXT || 'gibberish' })
  }

  return createGeminiVisionExtractor(options)
}

const buildExtractionPath = (imagePath) => {
  if (!imagePath) {
    return imagePath
  }

  const parsed = path.parse(imagePath)
  if (!parsed.ext) {
    return `${imagePath}-extraction.md`
  }

  return path.join(parsed.dir, `${parsed.name}-extraction.md`)
}

const extractImageMarkdown = async ({
  apiKey,
  model,
  imageBase64,
  mimeType,
  fetchImpl,
  prompt,
  imagePath
} = {}) => {
  const extractor = createVisionExtractor({ apiKey, model, fetchImpl })
  const finalPrompt = prompt || buildImageExtractionPrompt()
  const resolvedMime = mimeType || inferMimeType(imagePath, DEFAULT_VISION_MIME)
  const resolvedBase64 = imageBase64 || await readImageAsBase64(imagePath)
  const markdown = await extractor.extract({
    imageBase64: resolvedBase64,
    mimeType: resolvedMime,
    prompt: finalPrompt
  })

  return markdown.trim()
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

const runImageExtraction = async ({
  apiKey,
  model,
  imagePath,
  imageBase64,
  mimeType,
  fetchImpl,
  prompt
} = {}) => {
  const markdown = await extractImageMarkdown({
    apiKey,
    model,
    imageBase64,
    mimeType,
    fetchImpl,
    prompt,
    imagePath
  })

  if (!markdown) {
    throw new Error('Gemini returned an empty extraction.')
  }

  const outputPath = await writeExtractionFile({ imagePath, markdown })
  return { outputPath, markdown }
}

module.exports = {
  DEFAULT_VISION_MODEL,
  DEFAULT_VISION_MIME,
  buildImageExtractionPrompt,
  buildExtractionPath,
  createGeminiVisionExtractor,
  createMockVisionExtractor,
  createVisionExtractor,
  extractImageMarkdown,
  writeExtractionFile,
  runImageExtraction,
  inferMimeType,
  readImageAsBase64
}
