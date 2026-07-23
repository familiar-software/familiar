import AVFoundation
import CoreMedia
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

    func testNormalizerMakesYieldedBuffersMatchDeclaredCaptureFormat() throws {
        let inputFormat = try XCTUnwrap(AVAudioFormat(
            commonFormat: .pcmFormatInt16,
            sampleRate: 44_100,
            channels: 2,
            interleaved: true
        ))
        let outputFormat = try systemAudioCaptureFormat()
        let input = try XCTUnwrap(
            AVAudioPCMBuffer(pcmFormat: inputFormat, frameCapacity: 4_410)
        )
        input.frameLength = 4_410
        let samples = try XCTUnwrap(input.int16ChannelData?[0])
        for index in 0..<Int(input.frameLength * inputFormat.channelCount) {
            samples[index] = index.isMultiple(of: 2) ? 1_000 : -1_000
        }
        let normalizer = SystemAudioBufferNormalizer(outputFormat: outputFormat)

        let converted = try normalizer.convert(CapturedAudioBuffer(
            buffer: input,
            hostTime: CMTime(value: 1, timescale: 1)
        )) + normalizer.finish()

        XCTAssertFalse(converted.isEmpty)
        XCTAssertTrue(converted.allSatisfy { $0.buffer.format == outputFormat })
        XCTAssertTrue(converted.contains { audioBufferContainsSignal($0.buffer) })
    }

    func testNormalizerRejectsAFormatChangeDuringCapture() throws {
        let outputFormat = try systemAudioCaptureFormat()
        let changedFormat = try XCTUnwrap(AVAudioFormat(
            standardFormatWithSampleRate: 44_100,
            channels: 1
        ))
        let first = try XCTUnwrap(
            AVAudioPCMBuffer(pcmFormat: outputFormat, frameCapacity: 10)
        )
        let changed = try XCTUnwrap(
            AVAudioPCMBuffer(pcmFormat: changedFormat, frameCapacity: 10)
        )
        first.frameLength = 10
        changed.frameLength = 10
        let normalizer = SystemAudioBufferNormalizer(outputFormat: outputFormat)
        _ = try normalizer.convert(CapturedAudioBuffer(buffer: first, hostTime: .zero))

        XCTAssertThrowsError(try normalizer.convert(CapturedAudioBuffer(
            buffer: changed,
            hostTime: CMTime(value: 1, timescale: 1)
        ))) { error in
            XCTAssertTrue(String(describing: error).contains("format changed"))
        }
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
