const { EventEmitter } = require('node:events')
const assert = require('node:assert/strict')
const test = require('node:test')

const {
  createLowPowerModeMonitor,
  parseLowPowerModeFromPmsetOutput
} = require('../src/screen-capture/low-power-mode')

function createStubPowerMonitor(initialBatteryState = false) {
  const emitter = new EventEmitter()
  let onBattery = Boolean(initialBatteryState)

  return {
    isOnBatteryPower: () => onBattery,
    setOnBatteryPower(nextValue) {
      onBattery = Boolean(nextValue)
    },
    on: emitter.on.bind(emitter),
    removeListener: emitter.removeListener.bind(emitter),
    emitPowerEvent: emitter.emit.bind(emitter)
  }
}

function createNoopLogger() {
  return {
    log: () => {},
    warn: () => {},
    error: () => {}
  }
}

test('parseLowPowerModeFromPmsetOutput reads low power mode values', () => {
  assert.equal(parseLowPowerModeFromPmsetOutput('lowpowermode 1'), true)
  assert.equal(parseLowPowerModeFromPmsetOutput('lowpowermode\t0'), false)
  assert.equal(parseLowPowerModeFromPmsetOutput('other'), false)
})

test('low power mode follows on-battery and on-ac events', () => {
  const monitorState = []
  const powerMonitor = createStubPowerMonitor(true)
  const monitor = createLowPowerModeMonitor({
    powerMonitor,
    platform: 'darwin',
    logger: createNoopLogger()
  })

  monitor.on('change', (payload) => {
    monitorState.push(payload)
  })
  monitor.start()

  assert.equal(monitor.isLowPowerModeEnabled(), true)
  assert.equal(monitorState.length, 1)
  assert.equal(monitorState[0].enabled, true)
  assert.equal(monitorState[0].source, 'start')

  powerMonitor.setOnBatteryPower(false)
  powerMonitor.emitPowerEvent('on-ac')
  assert.equal(monitor.isLowPowerModeEnabled(), false)

  powerMonitor.setOnBatteryPower(true)
  powerMonitor.emitPowerEvent('on-battery')
  assert.equal(monitor.isLowPowerModeEnabled(), true)

  assert.equal(monitorState.length, 3)
  assert.equal(monitorState[1].enabled, false)
  assert.equal(monitorState[1].source, 'power-source-change')
  assert.equal(monitorState[2].enabled, true)
  assert.equal(monitorState[2].source, 'power-source-change')

  monitor.stop()
})

test('low power mode stays off on non-darwin platforms', () => {
  const powerMonitor = createStubPowerMonitor(true)
  const monitor = createLowPowerModeMonitor({
    powerMonitor,
    platform: 'linux',
    logger: createNoopLogger()
  })

  monitor.start()
  assert.equal(monitor.isLowPowerModeEnabled(), false)

  powerMonitor.setOnBatteryPower(false)
  powerMonitor.emitPowerEvent('on-ac')
  assert.equal(monitor.isLowPowerModeEnabled(), false)
})

