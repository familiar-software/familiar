const createRecordingQueryError = (code, message, meta = undefined) => {
  const error = { code, message }
  if (meta && typeof meta === 'object') {
    error.meta = meta
  }
  return error
}

const toErrorResult = (code, message, meta) => ({
  ok: false,
  error: createRecordingQueryError(code, message, meta)
})

module.exports = {
  createRecordingQueryError,
  toErrorResult
}
