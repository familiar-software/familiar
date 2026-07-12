import ScreenCaptureKit
import XCTest
@testable import FamiliarSpeechHelper

final class SystemAudioCaptureEngineTests: XCTestCase {
    func testConfigurationCapturesOnlyCurrentSystemAudioRequirements() {
        let configuration = makeSystemAudioStreamConfiguration()

        XCTAssertTrue(configuration.capturesAudio)
        XCTAssertTrue(configuration.excludesCurrentProcessAudio)
        if #available(macOS 15.0, *) {
            XCTAssertFalse(configuration.captureMicrophone)
        }
        XCTAssertEqual(configuration.sampleRate, 48_000)
        XCTAssertEqual(configuration.channelCount, 1)
    }

    func testRealSystemAudioStreamStartsAndStopsWhenOptedIn() async throws {
        guard ProcessInfo.processInfo.environment["FAMILIAR_REAL_SYSTEM_AUDIO_TEST"] == "1" else {
            throw XCTSkip("Set FAMILIAR_REAL_SYSTEM_AUDIO_TEST=1 to run ScreenCaptureKit.")
        }
        XCTAssertTrue(
            SystemAudioCaptureEngine.screenRecordingPermissionGranted,
            "Grant Screen Recording permission before running the real system-audio test."
        )

        let engine = SystemAudioCaptureEngine()
        let capture = try await engine.start()
        XCTAssertEqual(capture.format.sampleRate, 48_000)
        XCTAssertEqual(capture.format.channelCount, 1)
        try await engine.stop()
    }
}
