const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { test, expect } = require('playwright/test')
const { _electron: electron } = require('playwright')

const {
  FAMILIAR_BEHIND_THE_SCENES_DIR_NAME,
  STILLS_MARKDOWN_DIR_NAME
} = require('../../src/const')

const buildLaunchArgs = () => {
  const launchArgs = ['.']
  if (process.platform === 'linux') {
    launchArgs.push('--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage')
  }
  return launchArgs
}

const launchApp = async ({ contextPath, settingsDir, env = {}, initialSettings = {} }) => {
  const appRoot = path.join(__dirname, '../..')
  fs.mkdirSync(path.join(contextPath, FAMILIAR_BEHIND_THE_SCENES_DIR_NAME), { recursive: true })
  fs.writeFileSync(
    path.join(settingsDir, 'settings.json'),
    JSON.stringify(
      {
        wizardCompleted: true,
        contextFolderPath: contextPath,
        ...initialSettings
      },
      null,
      2
    )
  )

  return electron.launch({
    args: buildLaunchArgs(),
    cwd: appRoot,
    env: {
      ...process.env,
      FAMILIAR_E2E: '1',
      FAMILIAR_SETTINGS_DIR: settingsDir,
      FAMILIAR_E2E_SPEECH_HELPER_PATH: path.join(__dirname, 'fake-speech-helper.js'),
      ...env
    }
  })
}

const getMarkdownRoot = (contextPath) =>
  path.join(contextPath, FAMILIAR_BEHIND_THE_SCENES_DIR_NAME, STILLS_MARKDOWN_DIR_NAME)

const listSessionNames = (contextPath) => {
  const markdownRoot = getMarkdownRoot(contextPath)
  if (!fs.existsSync(markdownRoot)) {
    return []
  }
  return fs.readdirSync(markdownRoot).filter((name) => name.startsWith('session-')).sort()
}

const findTranscriptMarkdownPath = (contextPath) => {
  const sessions = listSessionNames(contextPath)
  if (sessions.length === 0) {
    return ''
  }
  const sessionDir = path.join(getMarkdownRoot(contextPath), sessions.at(-1))
  const transcriptNames = fs.readdirSync(sessionDir)
    .filter((name) => name.endsWith('.transcript.md'))
    .sort()
  const transcriptName = transcriptNames.at(-1)
  return transcriptName ? path.join(sessionDir, transcriptName) : ''
}

const listTranscriptJsonlPaths = (contextPath) => {
  const sessions = listSessionNames(contextPath)
  if (sessions.length === 0) {
    return []
  }
  const sessionDir = path.join(getMarkdownRoot(contextPath), sessions.at(-1))
  return fs.readdirSync(sessionDir)
    .filter((name) => name.endsWith('.jsonl'))
    .map((name) => path.join(sessionDir, name))
}

test.describe('meeting recording', () => {
  test('streams meeting transcript into the current session from the tray', async () => {
    const contextPath = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-context-meeting-'))
    const settingsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-settings-meeting-'))
    const electronApp = await launchApp({
      contextPath,
      settingsDir,
      env: {
        FAMILIAR_E2E_AUDIO_FINAL_DELAY_MS: '2000'
      }
    })

    try {
      const window = await electronApp.firstWindow()
      await window.waitForLoadState('domcontentloaded')

      const initialMenuItems = await window.evaluate(() => window.familiar.getTrayMenuItemsForE2E())
      expect(initialMenuItems?.items.map((item) => item.label)).toContain('Record meeting')

      const startResult = await window.evaluate(() =>
        window.familiar.clickTrayMeetingRecordingActionForE2E()
      )
      expect(startResult?.ok).toBe(true)
      expect(startResult?.status?.isRecording).toBe(true)
      expect(startResult?.status?.awakeLockActive).toBe(true)

      await expect
        .poll(async () => {
          const status = await window.evaluate(() => window.familiar.getMeetingRecordingStatus())
          return status?.isRecording === true && status?.awakeLockActive === true
        })
        .toBe(true)

      await expect
        .poll(() => {
          const transcriptPath = findTranscriptMarkdownPath(contextPath)
          return transcriptPath && fs.existsSync(transcriptPath)
            ? fs.readFileSync(transcriptPath, 'utf-8')
            : ''
        }, { timeout: 10000 })
        .toContain('Hello from')

      const liveTranscript = fs.readFileSync(findTranscriptMarkdownPath(contextPath), 'utf-8')
      expect(liveTranscript).toContain('In progress')

      await expect
        .poll(() => {
          const transcriptPath = findTranscriptMarkdownPath(contextPath)
          return transcriptPath && fs.existsSync(transcriptPath)
            ? fs.readFileSync(transcriptPath, 'utf-8')
            : ''
        }, { timeout: 10000 })
        .toContain('Hello from the meeting.')

      await expect
        .poll(() => {
          const transcriptPath = findTranscriptMarkdownPath(contextPath)
          return transcriptPath && fs.existsSync(transcriptPath)
            ? fs.readFileSync(transcriptPath, 'utf-8')
            : ''
        }, { timeout: 10000 })
        .toContain('We should ship live notes.')

      const transcriptPath = findTranscriptMarkdownPath(contextPath)
      expect(path.basename(transcriptPath)).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}\.transcript\.md$/
      )
      const transcript = fs.readFileSync(transcriptPath, 'utf-8')
      expect(transcript).toContain('We should ship live notes.')
      expect(transcript).not.toContain('In progress')
      expect(transcript).not.toContain('Started:')
      expect(transcript).not.toMatch(/\[\d{2}:\d{2}:\d{2}\]/)
      expect(listTranscriptJsonlPaths(contextPath)).toEqual([])

      const stopResult = await window.evaluate(() =>
        window.familiar.clickTrayMeetingRecordingActionForE2E()
      )
      expect(stopResult?.ok).toBe(true)
      expect(stopResult?.status?.isRecording).toBe(false)
      expect(stopResult?.status?.awakeLockActive).toBe(false)

      const stoppedMenuItems = await window.evaluate(() => window.familiar.getTrayMenuItemsForE2E())
      expect(stoppedMenuItems?.items.map((item) => item.label)).toContain('Record meeting')
    } finally {
      await electronApp.close()
    }
  })

  test('keeps meeting recording active when the Mac would otherwise become idle', async () => {
    const contextPath = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-context-meeting-idle-'))
    const settingsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'familiar-settings-meeting-idle-'))
    const electronApp = await launchApp({ contextPath, settingsDir })

    try {
      const window = await electronApp.firstWindow()
      await window.waitForLoadState('domcontentloaded')

      const startResult = await window.evaluate(() =>
        window.familiar.clickTrayMeetingRecordingActionForE2E()
      )
      expect(startResult?.ok).toBe(true)

      await electronApp.evaluate(() => {
        const { powerMonitor } = process.mainModule.require('electron')
        Object.defineProperty(powerMonitor, 'getSystemIdleTime', {
          value: () => 600,
          configurable: true
        })
      })

      await expect
        .poll(async () => {
          const status = await window.evaluate(() => window.familiar.getMeetingRecordingStatus())
          return {
            isRecording: status?.isRecording,
            awakeLockActive: status?.awakeLockActive
          }
        })
        .toEqual({ isRecording: true, awakeLockActive: true })

      await expect
        .poll(() => {
          const transcriptPath = findTranscriptMarkdownPath(contextPath)
          return transcriptPath && fs.existsSync(transcriptPath)
            ? fs.readFileSync(transcriptPath, 'utf-8')
            : ''
        }, { timeout: 10000 })
        .toContain('We should ship live notes.')

      const stopResult = await window.evaluate(() =>
        window.familiar.clickTrayMeetingRecordingActionForE2E()
      )
      expect(stopResult?.status?.isRecording).toBe(false)
      expect(stopResult?.status?.awakeLockActive).toBe(false)
    } finally {
      await electronApp.close()
    }
  })
})
