const test = require('node:test')
const assert = require('node:assert/strict')

const { createTrayMenuController } = require('../src/tray/refresh')

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
        menu: {
            buildFromTemplate: (template) => template
        },
        loadSettingsFn: () => ({})
    })

    controller.updateTrayMenu()
    assert.equal(menuCalls.length, 1)
    assert.equal(menuCalls[0][0].label, 'Capturing (click to pause)')

    recordingState = { manualPaused: true, state: 'armed', pauseRemainingMs: 61000 }
    controller.updateTrayMenu()
    assert.equal(menuCalls.length, 2)
    assert.equal(menuCalls[1][0].label, 'Paused for 2m (click to resume)')
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
