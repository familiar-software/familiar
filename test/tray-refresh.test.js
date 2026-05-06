const test = require('node:test')
const assert = require('node:assert/strict')

const { createTrayMenuController } = require('../src/tray/refresh')
const { microcopy } = require('../src/microcopy')
const createMockIndicatorIcon = () => ({ id: 'indicator' })

test('tray menu shows recording and paused labels without auto-refresh loop', () => {
    let recordingState = { manualPaused: false, state: 'recording', pauseRemainingMs: 0 }

    const menuCalls = []
    const controller = createTrayMenuController({
        tray: {
            setContextMenu: (menu) => {
                menuCalls.push(menu)
            }
        },
        trayHandlers: {},
        getRecordingState: () => recordingState,
        recordingIndicatorIconFactory: createMockIndicatorIcon,
        menu: {
            buildFromTemplate: (template) => template
        },
        loadSettingsFn: () => ({})
    })

    controller.updateTrayMenu()
    assert.equal(menuCalls.length, 1)
    assert.equal(menuCalls[0][0].label, 'Capturing')

    recordingState = { manualPaused: true, state: 'armed', pauseRemainingMs: 61000 }
    controller.updateTrayMenu()
    assert.equal(menuCalls.length, 2)
    assert.ok(menuCalls[1][0].label.includes('remaining'), 'paused label should show countdown')
})

test('registerTrayRefreshHandlers refreshes tray on click and right-click', () => {
    let clickHandler = null
    let rightClickHandler = null
    let loadSettingsCalls = 0
    let setContextMenuCalls = 0

    const controller = createTrayMenuController({
        tray: {
            setContextMenu: () => {
                setContextMenuCalls += 1
            },
            on: (event, handler) => {
                if (event === 'click') {
                    clickHandler = handler
                }
                if (event === 'right-click') {
                    rightClickHandler = handler
                }
            }
        },
        trayHandlers: {},
        getRecordingState: () => ({ manualPaused: false, state: 'armed', pauseRemainingMs: 0 }),
        recordingIndicatorIconFactory: createMockIndicatorIcon,
        menu: {
            buildFromTemplate: (template) => template
        },
        loadSettingsFn: () => {
            loadSettingsCalls += 1
            return {}
        }
    })

    controller.registerTrayRefreshHandlers()
    assert.ok(clickHandler)
    assert.ok(rightClickHandler)

    clickHandler()
    rightClickHandler()

    assert.equal(loadSettingsCalls, 2)
    assert.equal(setContextMenuCalls, 2)
})

test('registerTrayRefreshHandlers runs tray-open side effects after refresh', async () => {
    let clickHandler = null
    const trayOpenPromise = new Promise((resolve) => {
        const controller = createTrayMenuController({
            tray: {
                setContextMenu: () => {},
                on: (event, handler) => {
                    if (event === 'click') {
                        clickHandler = handler
                    }
                }
            },
            trayHandlers: {},
            onTrayMenuOpened: async ({ settings }) => {
                assert.equal(settings.contextFolderPath, '/tmp/context')
                resolve()
            },
            getRecordingState: () => ({ manualPaused: false, state: 'armed', pauseRemainingMs: 0 }),
            recordingIndicatorIconFactory: createMockIndicatorIcon,
            menu: {
                buildFromTemplate: (template) => template
            },
            loadSettingsFn: () => ({
                contextFolderPath: '/tmp/context'
            })
        })

        controller.registerTrayRefreshHandlers()
    })
    assert.ok(clickHandler)

    clickHandler()
    await trayOpenPromise
})

test('handleTrayMenuOpen is exposed for callers that need tray-open side effects', async () => {
    let trayOpenCalls = 0

    const controller = createTrayMenuController({
        tray: {
            setContextMenu: () => {},
            on: () => {}
        },
        trayHandlers: {},
        onTrayMenuOpened: async () => {
            trayOpenCalls += 1
        },
        getRecordingState: () => ({ manualPaused: false, state: 'armed', pauseRemainingMs: 0 }),
        recordingIndicatorIconFactory: createMockIndicatorIcon,
        menu: {
            buildFromTemplate: (template) => template
        },
        loadSettingsFn: () => ({})
    })

    await controller.handleTrayMenuOpen()

    assert.equal(trayOpenCalls, 1)
})
