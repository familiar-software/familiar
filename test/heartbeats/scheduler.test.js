const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { createHeartbeatScheduler } = require('../../src/heartbeats/scheduler')
const { ADAPTER_STATUS } = require('../../src/harness-adapters/types')
const { HEARTBEAT_HISTORY_STATUS } = require('../../src/heartbeats/store')
const { MAX_HEARTBEAT_ATTEMPTS } = require('../../src/heartbeats/constants')

const createHeartbeat = (overrides = {}) => ({
  id: 'hb-1',
  topic: 'daily-topic',
  prompt: 'Summarize',
  runner: 'codex',
  schedule: {
    frequency: 'daily',
    time: '00:00',
    timezone: 'UTC'
  },
  enabled: true,
  lastAttemptedScheduledAt: 0,
  ...overrides
})

const createHeartbeatHistoryStoreStub = ({
  initialRows = []
} = {}) => {
  const rows = initialRows.map((row) => ({ ...row }))

  return {
    rows,
    recordHeartbeatRun: (payload) => {
      rows.push({
        ...payload
      })
    },
    getLatestPendingRetry: ({ heartbeatId, nowUtc }) => {
      const latestRow = rows
        .filter((row) => row.heartbeatId === heartbeatId)
        .sort((left, right) => {
          if (left.scheduledAtUtc === right.scheduledAtUtc) {
            return (right.attemptNumber || 1) - (left.attemptNumber || 1)
          }
          return left.scheduledAtUtc < right.scheduledAtUtc ? 1 : -1
        })[0] || null

      if (
        !latestRow ||
        latestRow.status !== HEARTBEAT_HISTORY_STATUS.FAILED ||
        typeof latestRow.nextRetryAtUtc !== 'string' ||
        latestRow.nextRetryAtUtc.length === 0 ||
        latestRow.nextRetryAtUtc > nowUtc
      ) {
        return null
      }

      return latestRow
    },
    close: () => {}
  }
}

test('createHeartbeatScheduler requires dependencies', () => {
  assert.throws(
    () => createHeartbeatScheduler({ settingsSaver: () => ({}) }),
    /settingsLoader is required/
  )
  assert.throws(
    () => createHeartbeatScheduler({ settingsLoader: () => ({}) }),
    /settingsSaver is required/
  )
})

test('runDueHeartbeats throws when context folder is unavailable', async () => {
  const scheduler = createHeartbeatScheduler({
    settingsLoader: () => ({}),
    settingsSaver: () => ({}),
    runner: { runPrompt: async () => ({ status: ADAPTER_STATUS.OK }) }
  })

  await assert.rejects(
    () => scheduler.runDueHeartbeats(),
    /Context folder path is required\./
  )
})

test('runDueHeartbeats skips heartbeat checks when capture is not active', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'heartbeat-scheduler-'))
  const settings = {
    contextFolderPath: root,
    heartbeats: {
      items: [createHeartbeat()]
    }
  }
  let runCalls = 0
  const scheduler = createHeartbeatScheduler({
    settingsLoader: () => settings,
    settingsSaver: () => {},
    isCaptureActive: () => false,
    runner: {
      runPrompt: async () => {
        runCalls += 1
        return {
          status: ADAPTER_STATUS.OK,
          answer: 'should not run'
        }
      }
    },
    nowFn: () => Date.UTC(2026, 2, 5, 12, 0, 0)
  })

  const result = await scheduler.runDueHeartbeats()
  assert.equal(result.ok, true)
  assert.equal(result.processed.length, 0)
  assert.equal(result.reason, 'capture-inactive')
  assert.equal(runCalls, 0)
  fs.rmSync(root, { recursive: true, force: true })
})

test('runDueHeartbeats skips disabled items and does not execute runner', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'heartbeat-scheduler-'))
  const settings = {
    contextFolderPath: root,
    heartbeats: {
      items: [createHeartbeat({ enabled: false })]
    }
  }
  let runCalls = 0
  const scheduler = createHeartbeatScheduler({
    settingsLoader: () => settings,
    settingsSaver: ({ heartbeats }) => {
      settings.heartbeats = heartbeats
    },
    runner: {
      runPrompt: async () => {
        runCalls += 1
        return {
          status: ADAPTER_STATUS.OK,
          answer: 'disabled should not run'
        }
      }
    },
    nowFn: () => Date.UTC(2026, 2, 5, 12, 0, 0)
  })

  const result = await scheduler.runDueHeartbeats()

  assert.equal(result.ok, true)
  assert.equal(result.processed.length, 0)
  assert.equal(runCalls, 0)
  fs.rmSync(root, { recursive: true, force: true })
})

test('runDueHeartbeats runs due heartbeat and persists run metadata', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'heartbeat-scheduler-'))
  const settings = {
    contextFolderPath: root,
    heartbeats: {
      items: [createHeartbeat()]
    }
  }
  const saveCalls = []
  const scheduler = createHeartbeatScheduler({
    settingsLoader: () => settings,
    settingsSaver: ({ heartbeats }) => {
      settings.heartbeats = heartbeats
      saveCalls.push(heartbeats)
    },
    runner: {
      runPrompt: async () => ({
        status: ADAPTER_STATUS.OK,
        answer: 'result line'
      })
    },
    nowFn: () => Date.UTC(2026, 2, 5, 12, 0, 0)
  })

  const result = await scheduler.runDueHeartbeats()

  assert.equal(result.ok, true)
  assert.equal(result.processed.length, 1)
  assert.equal(result.processed[0].id, 'hb-1')
  assert.equal(result.processed[0].result.status, 'ok')
  assert.equal(saveCalls.length, 1)

  const updated = saveCalls[0].items[0]
  assert.equal(updated.lastRunStatus, 'ok')
  assert.equal(updated.lastRunError, '')
  assert.equal(updated.lastAttemptedScheduledAt, Date.UTC(2026, 2, 5, 0, 0, 0))
  assert.equal(updated.lastRunAt, Date.UTC(2026, 2, 5, 0, 0, 0))
  assert.equal(path.extname(updated.outputPath), '.md')
  assert.equal(fs.existsSync(updated.outputPath), true)

  fs.rmSync(root, { recursive: true, force: true })
})

test('runDueHeartbeats records successful runs in heartbeat history', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'heartbeat-scheduler-'))
  const settings = {
    contextFolderPath: root,
    heartbeats: {
      items: [createHeartbeat()]
    }
  }
  const recordedRuns = []
  const scheduler = createHeartbeatScheduler({
    settingsLoader: () => settings,
    settingsSaver: ({ heartbeats }) => {
      settings.heartbeats = heartbeats
    },
    heartbeatHistoryStoreFactory: () => ({
      recordHeartbeatRun: (payload) => {
        recordedRuns.push(payload)
      },
      close: () => {}
    }),
    runner: {
      runPrompt: async () => ({
        status: ADAPTER_STATUS.OK,
        answer: 'result line'
      })
    },
    nowFn: () => Date.UTC(2026, 2, 5, 12, 0, 0)
  })

  const result = await scheduler.runDueHeartbeats()

  assert.equal(result.ok, true)
  assert.equal(recordedRuns.length, 1)
  assert.equal(recordedRuns[0].heartbeatId, 'hb-1')
  assert.equal(recordedRuns[0].status, 'completed')
  assert.equal(typeof recordedRuns[0].outputPath, 'string')
  assert.equal(recordedRuns[0].errorMessage, null)

  fs.rmSync(root, { recursive: true, force: true })
})

test('runDueHeartbeats normalizes invalid timezone and still evaluates schedule', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'heartbeat-scheduler-'))
  let runCalls = 0
  const settings = {
    contextFolderPath: root,
    heartbeats: {
      items: [
        createHeartbeat({
          id: 'hb-bad-tz',
          schedule: {
            frequency: 'daily',
            time: '00:00',
            timezone: 'This/Is-Not-Real'
          }
        })
      ]
  } }
  const scheduler = createHeartbeatScheduler({
    settingsLoader: () => settings,
    settingsSaver: () => {},
    runner: {
      runPrompt: async () => {
        runCalls += 1
        return {
          status: ADAPTER_STATUS.OK,
          answer: 'should not run'
        }
      }
    },
    nowFn: () => Date.UTC(2026, 2, 5, 12, 0, 0)
  })

  const result = await scheduler.runDueHeartbeats()

  assert.equal(result.ok, true)
  assert.equal(result.processed.length, 1)
  assert.equal(runCalls, 1)
  fs.rmSync(root, { recursive: true, force: true })
})

test('runDueHeartbeats records retryable failures in heartbeat history without final notification', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'heartbeat-scheduler-'))
  const settings = {
    contextFolderPath: root,
    heartbeats: {
      items: [createHeartbeat()]
    }
  }
  const notifications = []
  const historyStore = createHeartbeatHistoryStoreStub()
  const scheduler = createHeartbeatScheduler({
    settingsLoader: () => settings,
    settingsSaver: ({ heartbeats }) => {
      settings.heartbeats = heartbeats
    },
    heartbeatHistoryStoreFactory: () => historyStore,
    runner: {
      runPrompt: async () => ({
        status: ADAPTER_STATUS.ERROR,
        message: 'Runner unavailable'
      })
    },
    nowFn: () => Date.UTC(2026, 2, 5, 12, 0, 0),
    onFailure: (payload) => notifications.push(payload)
  })

  const result = await scheduler.runDueHeartbeats()

  assert.equal(result.ok, true)
  assert.equal(result.processed.length, 1)
  assert.equal(result.processed[0].result.status, 'error')
  assert.equal(result.processed[0].result.error, 'Runner unavailable')
  assert.equal(notifications.length, 0)
  assert.equal(historyStore.rows.length, 1)
  assert.equal(historyStore.rows[0].status, HEARTBEAT_HISTORY_STATUS.FAILED)
  assert.equal(historyStore.rows[0].attemptNumber, 1)
  assert.equal(historyStore.rows[0].nextRetryAtUtc, '2026-03-05T12:01:00.000Z')

  fs.rmSync(root, { recursive: true, force: true })
})

test('runDueHeartbeats records failed runs in heartbeat history', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'heartbeat-scheduler-'))
  const settings = {
    contextFolderPath: root,
    heartbeats: {
      items: [createHeartbeat()]
    }
  }
  const recordedRuns = []
  const scheduler = createHeartbeatScheduler({
    settingsLoader: () => settings,
    settingsSaver: ({ heartbeats }) => {
      settings.heartbeats = heartbeats
    },
    heartbeatHistoryStoreFactory: () => ({
      recordHeartbeatRun: (payload) => {
        recordedRuns.push(payload)
      },
      close: () => {}
    }),
    runner: {
      runPrompt: async () => ({
        status: ADAPTER_STATUS.ERROR,
        message: 'Runner unavailable'
      })
    },
    nowFn: () => Date.UTC(2026, 2, 5, 12, 0, 0)
  })

  const result = await scheduler.runDueHeartbeats()

  assert.equal(result.ok, true)
  assert.equal(recordedRuns.length, 1)
  assert.equal(recordedRuns[0].status, 'failed')
  assert.equal(recordedRuns[0].errorMessage, 'Runner unavailable')
  assert.equal(recordedRuns[0].outputPath, null)
  assert.equal(recordedRuns[0].attemptNumber, 1)
  assert.equal(recordedRuns[0].nextRetryAtUtc, '2026-03-05T12:01:00.000Z')

  fs.rmSync(root, { recursive: true, force: true })
})

test('runDueHeartbeats emits running state lifecycle events', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'heartbeat-scheduler-'))
  const settings = {
    contextFolderPath: root,
    heartbeats: {
      items: [createHeartbeat()]
    }
  }
  const heartbeatStates = []
  const scheduler = createHeartbeatScheduler({
    settingsLoader: () => settings,
    settingsSaver: ({ heartbeats }) => {
      settings.heartbeats = heartbeats
    },
    runner: {
      runPrompt: async () => ({
        status: ADAPTER_STATUS.OK,
        answer: 'result line'
      })
    },
    nowFn: () => Date.UTC(2026, 2, 5, 12, 0, 0),
    onHeartbeatRunStateChanged: (payload) => heartbeatStates.push(payload)
  })

  const result = await scheduler.runDueHeartbeats()

  assert.equal(result.ok, true)
  assert.equal(result.processed.length, 1)
  assert.equal(heartbeatStates.length, 2)
  assert.equal(heartbeatStates[0].state, 'running')
  assert.equal(heartbeatStates[0].id, 'hb-1')
  assert.equal(heartbeatStates[1].state, 'completed')
  assert.equal(heartbeatStates[1].status, 'ok')

  fs.rmSync(root, { recursive: true, force: true })
})

test('runHeartbeatNow emits running state lifecycle events', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'heartbeat-scheduler-'))
  const settings = {
    contextFolderPath: root,
    heartbeats: {
      items: [createHeartbeat({ id: 'hb-now', topic: 'run-now-topic' })]
    }
  }
  const heartbeatStates = []
  const scheduler = createHeartbeatScheduler({
    settingsLoader: () => settings,
    settingsSaver: ({ heartbeats }) => {
      settings.heartbeats = heartbeats
    },
    runner: {
      runPrompt: async () => ({
        status: ADAPTER_STATUS.OK,
        answer: 'immediate result'
      })
    },
    nowFn: () => Date.UTC(2026, 2, 5, 12, 0, 0),
    onHeartbeatRunStateChanged: (payload) => heartbeatStates.push(payload)
  })

  const result = await scheduler.runHeartbeatNow({ heartbeatId: 'hb-now' })
  assert.equal(result.ok, true)
  assert.equal(heartbeatStates.length, 2)
  assert.equal(heartbeatStates[0].state, 'running')
  assert.equal(heartbeatStates[0].trigger, 'manual')
  assert.equal(heartbeatStates[1].state, 'completed')

  fs.rmSync(root, { recursive: true, force: true })
})

test('runDueHeartbeats skips heartbeat when due slot is not newer than last attempt', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'heartbeat-scheduler-'))
  const settings = {
    contextFolderPath: root,
    heartbeats: {
      items: [createHeartbeat({ lastAttemptedScheduledAt: Date.UTC(2026, 2, 5, 12, 0, 0) })]
    }
  }
  let runCalls = 0
  const scheduler = createHeartbeatScheduler({
    settingsLoader: () => settings,
    settingsSaver: () => {},
    runner: {
      runPrompt: async () => {
        runCalls += 1
        return {
          status: ADAPTER_STATUS.OK,
          answer: 'should not run'
        }
      }
    },
    nowFn: () => Date.UTC(2026, 2, 5, 12, 0, 0)
  })

  const result = await scheduler.runDueHeartbeats()

  assert.equal(result.ok, true)
  assert.equal(result.processed.length, 0)
  assert.equal(runCalls, 0)
  fs.rmSync(root, { recursive: true, force: true })
})

test('runDueHeartbeats retries the latest failed scheduled slot once', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'heartbeat-scheduler-'))
  const scheduledAtMs = Date.UTC(2026, 2, 5, 0, 0, 0)
  const settings = {
    contextFolderPath: root,
    heartbeats: {
      items: [createHeartbeat({ lastAttemptedScheduledAt: scheduledAtMs })]
    }
  }
  const historyStore = createHeartbeatHistoryStoreStub({
    initialRows: [
      {
        heartbeatId: 'hb-1',
        topic: 'daily-topic',
        runner: 'codex',
        scheduledAtUtc: '2026-03-05T00:00:00.000Z',
        startedAtUtc: '2026-03-05T00:00:05.000Z',
        completedAtUtc: '2026-03-05T00:00:45.000Z',
        status: HEARTBEAT_HISTORY_STATUS.FAILED,
        attemptNumber: 1,
        nextRetryAtUtc: '2026-03-05T00:01:00.000Z'
      }
    ]
  })
  let runCalls = 0
  const scheduler = createHeartbeatScheduler({
    settingsLoader: () => settings,
    settingsSaver: ({ heartbeats }) => {
      settings.heartbeats = heartbeats
    },
    heartbeatHistoryStoreFactory: () => historyStore,
    runner: {
      runPrompt: async () => {
        runCalls += 1
        return {
          status: ADAPTER_STATUS.OK,
          answer: 'retry succeeded'
        }
      }
    },
    nowFn: () => Date.UTC(2026, 2, 5, 12, 0, 0)
  })

  const firstResult = await scheduler.runDueHeartbeats()
  const secondResult = await scheduler.runDueHeartbeats()

  assert.equal(firstResult.ok, true)
  assert.equal(firstResult.processed.length, 1)
  assert.equal(firstResult.processed[0].result.status, 'ok')
  assert.equal(secondResult.ok, true)
  assert.equal(secondResult.processed.length, 0)
  assert.equal(runCalls, 1)
  assert.equal(historyStore.rows.length, 2)
  assert.equal(historyStore.rows[1].scheduledAtUtc, '2026-03-05T00:00:00.000Z')
  assert.equal(historyStore.rows[1].status, HEARTBEAT_HISTORY_STATUS.COMPLETED)
  assert.equal(historyStore.rows[1].attemptNumber, MAX_HEARTBEAT_ATTEMPTS)
  assert.equal(historyStore.rows[1].nextRetryAtUtc, null)

  fs.rmSync(root, { recursive: true, force: true })
})

test('runDueHeartbeats exhausts heartbeat retry after one additional failure', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'heartbeat-scheduler-'))
  const scheduledAtMs = Date.UTC(2026, 2, 5, 0, 0, 0)
  const settings = {
    contextFolderPath: root,
    heartbeats: {
      items: [createHeartbeat({ lastAttemptedScheduledAt: scheduledAtMs })]
    }
  }
  const historyStore = createHeartbeatHistoryStoreStub({
    initialRows: [
      {
        heartbeatId: 'hb-1',
        topic: 'daily-topic',
        runner: 'codex',
        scheduledAtUtc: '2026-03-05T00:00:00.000Z',
        startedAtUtc: '2026-03-05T00:00:05.000Z',
        completedAtUtc: '2026-03-05T00:00:45.000Z',
        status: HEARTBEAT_HISTORY_STATUS.FAILED,
        attemptNumber: 1,
        nextRetryAtUtc: '2026-03-05T00:01:00.000Z'
      }
    ]
  })
  const notifications = []
  let runCalls = 0
  const scheduler = createHeartbeatScheduler({
    settingsLoader: () => settings,
    settingsSaver: ({ heartbeats }) => {
      settings.heartbeats = heartbeats
    },
    heartbeatHistoryStoreFactory: () => historyStore,
    runner: {
      runPrompt: async () => {
        runCalls += 1
        return {
          status: ADAPTER_STATUS.ERROR,
          message: 'Still unavailable'
        }
      }
    },
    nowFn: () => Date.UTC(2026, 2, 5, 12, 0, 0),
    onFailure: (payload) => notifications.push(payload)
  })

  const firstResult = await scheduler.runDueHeartbeats()
  const secondResult = await scheduler.runDueHeartbeats()

  assert.equal(firstResult.ok, true)
  assert.equal(firstResult.processed.length, 1)
  assert.equal(firstResult.processed[0].result.status, 'error')
  assert.equal(runCalls, 1)
  assert.equal(historyStore.rows.length, 2)
  assert.equal(historyStore.rows[1].status, HEARTBEAT_HISTORY_STATUS.FAILED)
  assert.equal(historyStore.rows[1].attemptNumber, 2)
  assert.equal(historyStore.rows[1].nextRetryAtUtc, null)
  assert.equal(notifications.length, 1)
  assert.equal(notifications[0].attemptNumber, 2)
  assert.equal(notifications[0].message, 'Still unavailable')
  assert.equal(secondResult.ok, true)
  assert.equal(secondResult.processed.length, 0)

  fs.rmSync(root, { recursive: true, force: true })
})

test('runDueHeartbeats does not start a nested run when previous cycle is still busy', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'heartbeat-scheduler-'))
  let resolveRun
  const settings = {
    contextFolderPath: root,
    heartbeats: {
      items: [createHeartbeat()]
    }
  }
    const scheduler = createHeartbeatScheduler({
    settingsLoader: () => settings,
    settingsSaver: () => {},
    nowFn: () => Date.UTC(2026, 2, 5, 12, 0, 0),
    runner: {
      runPrompt: async () => new Promise((resolve) => {
        resolveRun = () => {
          resolve({
            status: ADAPTER_STATUS.OK,
            answer: 'deferred output'
          })
        }
      })
    }
  })

  const firstCall = scheduler.runDueHeartbeats()
  await new Promise((resolve) => setImmediate(resolve))
  const secondCall = await scheduler.runDueHeartbeats()
  assert.equal(secondCall.ok, true)
  assert.equal(secondCall.reason, 'busy')

  resolveRun()
  const firstResult = await firstCall
  assert.equal(firstResult.ok, true)
  assert.equal(firstResult.processed.length, 1)

  fs.rmSync(root, { recursive: true, force: true })
})

test('runHeartbeatNow handles input and settings edge cases', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'heartbeat-scheduler-'))
  const settings = {
    contextFolderPath: root,
    heartbeats: {
      items: [createHeartbeat({ id: 'hb-now', topic: 'run-now-topic' })]
    }
  }
  const schedulerMissingContext = createHeartbeatScheduler({
    settingsLoader: () => ({ heartbeats: { items: [createHeartbeat()] } }),
    settingsSaver: () => {},
    runner: {
      runPrompt: async () => ({
        status: ADAPTER_STATUS.OK,
        answer: 'should not run'
      })
    }
  })
  await assert.rejects(
    () => schedulerMissingContext.runHeartbeatNow({ heartbeatId: 'hb-now' }),
    /Context folder path is required\./
  )

  const runNowCalls = []
  const scheduler = createHeartbeatScheduler({
    settingsLoader: () => settings,
      settingsSaver: ({ heartbeats }) => {
      settings.heartbeats = heartbeats
    },
    runner: {
      runPrompt: async () => {
        runNowCalls.push(1)
        return {
          status: ADAPTER_STATUS.OK,
          answer: 'immediate result'
        }
      }
    }
  })

  const missingId = await scheduler.runHeartbeatNow()
  assert.equal(missingId.ok, false)
  assert.equal(missingId.message, 'heartbeatId is required.')

  const notFound = await scheduler.runHeartbeatNow({ heartbeatId: 'not-found' })
  assert.equal(notFound.ok, false)
  assert.equal(notFound.message, 'Heartbeat not found.')

  const success = await scheduler.runHeartbeatNow({ heartbeatId: 'hb-now' })
  assert.equal(success.ok, true)
  assert.equal(success.status, 'ok')
  assert.equal(success.message, 'Heartbeat completed.')
  assert.equal(success.heartbeatId, 'hb-now')
  assert.equal(success.topic, 'run-now-topic')
  assert.equal(typeof success.outputPath, 'string')
  assert.equal(runNowCalls.length, 1)

  const updated = settings.heartbeats.items[0]
  assert.equal(updated.lastRunStatus, 'ok')
  assert.equal(updated.lastRunError, '')
  assert.equal(updated.outputPath, success.outputPath)

  fs.rmSync(root, { recursive: true, force: true })
})

test('start and stop scheduler lifecycle', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'heartbeat-scheduler-'))
  let clearCalls = 0
  const scheduler = createHeartbeatScheduler({
    settingsLoader: () => ({ contextFolderPath: root, heartbeats: { items: [] } }),
    settingsSaver: () => {},
    setIntervalFn: () => {
      return 'timer-id'
    },
    clearIntervalFn: () => {
      clearCalls += 1
    },
    nowFn: () => Date.UTC(2026, 2, 5, 12, 0, 0),
    runner: {
      runPrompt: async () => ({
        status: ADAPTER_STATUS.OK,
        answer: 'done'
      })
    }
  })

  const startResult = scheduler.start()
  assert.equal(startResult.ok, true)
  assert.equal(scheduler.getState().running, true)
  assert.equal(scheduler.getState().intervalMs, 60_000)

  const secondStart = scheduler.start()
  assert.equal(secondStart.ok, false)
  assert.equal(secondStart.reason, 'already-running')

  const stopResult = scheduler.stop()
  assert.equal(stopResult.ok, true)
  assert.equal(clearCalls, 1)
  assert.equal(scheduler.getState().running, false)

  const secondStop = scheduler.stop()
  assert.equal(secondStop.ok, true)
  assert.equal(secondStop.reason, 'not-running')

  fs.rmSync(root, { recursive: true, force: true })
})
