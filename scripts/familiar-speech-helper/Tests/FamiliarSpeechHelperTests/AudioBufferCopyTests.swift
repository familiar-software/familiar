import AVFoundation
import XCTest
@testable import FamiliarSpeechHelper

final class AudioBufferCopyTests: XCTestCase {
    func testCopiesSamplesIntoIndependentStorage() throws {
        let format = try XCTUnwrap(AVAudioFormat(
            standardFormatWithSampleRate: 48_000,
            channels: 1
        ))
        let source = try XCTUnwrap(AVAudioPCMBuffer(pcmFormat: format, frameCapacity: 3))
        source.frameLength = 3
        let sourceSamples = try XCTUnwrap(source.floatChannelData?[0])
        sourceSamples[0] = 0.1
        sourceSamples[1] = 0.2
        sourceSamples[2] = 0.3

        let copied = try XCTUnwrap(copyAudioPCMBuffer(source))
        sourceSamples[1] = 0.9

        let copiedSamples = try XCTUnwrap(copied.floatChannelData?[0])
        XCTAssertEqual(Array(UnsafeBufferPointer(start: copiedSamples, count: 3)), [0.1, 0.2, 0.3])
        XCTAssertEqual(copied.frameLength, 3)
        XCTAssertEqual(copied.format, format)
    }

    func testDetectsWhetherAudioBufferContainsSignal() throws {
        let format = try XCTUnwrap(AVAudioFormat(
            standardFormatWithSampleRate: 48_000,
            channels: 1
        ))
        let buffer = try XCTUnwrap(
            AVAudioPCMBuffer(pcmFormat: format, frameCapacity: 3)
        )
        buffer.frameLength = 3

        XCTAssertFalse(audioBufferContainsSignal(buffer))

        let samples = try XCTUnwrap(buffer.floatChannelData?[0])
        samples[1] = 0.25

        XCTAssertTrue(audioBufferContainsSignal(buffer))
    }
}
