import AVFoundation
import CoreMedia
import Speech
import XCTest
@testable import FamiliarSpeechHelper

@available(macOS 26.0, *)
final class AppleSpeechSourceSessionTests: XCTestCase {
    func testLiveTranscriptLabelsThePhysicalAudioSource() {
        let payload = TranscriptPayload(
            text: "hello",
            isFinal: true,
            startedAtMs: 0,
            endedAtMs: 500,
            segments: [
                TranscriptSegmentPayload(
                    text: "hello",
                    startedAtMs: 0,
                    endedAtMs: 500,
                    words: []
                )
            ]
        )

        let labeled = payload.applyingSpeakerLabel("Mac audio")

        XCTAssertEqual(labeled.segments.map(\.speaker), ["Mac audio"])
        XCTAssertFalse(labeled.replaceTranscript)
    }

    func testTwoSpeechSourcesAnalyzeConcurrentlyWhenOptedIn() async throws {
        let environment = ProcessInfo.processInfo.environment
        guard environment["FAMILIAR_REAL_SPEECH_CONCURRENCY_TEST"] == "1" else {
            throw XCTSkip(
                "Set FAMILIAR_REAL_SPEECH_CONCURRENCY_TEST=1 to run two SpeechAnalyzers."
            )
        }
        guard SpeechTranscriber.isAvailable else {
            throw XCTSkip("SpeechTranscriber is unavailable on this test Mac.")
        }

        let writer = OutputWriter()
        let locale = Locale(identifier: "en-US")
        let assetTranscriber = SpeechTranscriber(
            locale: locale,
            transcriptionOptions: [],
            reportingOptions: [.volatileResults],
            attributeOptions: [.audioTimeRange]
        )
        let assetStatus = await AssetInventory.status(forModules: [assetTranscriber])
        guard assetStatus == .installed else {
            throw XCTSkip(
                "SpeechTranscriber model is not installed on this test Mac " +
                    "(status: \(assetStatus))."
            )
        }
        async let localPreparation = AppleSpeechSourceSession.prepare(
            locale: locale,
            writer: writer,
            liveSpeakerLabel: "You"
        )
        async let remotePreparation = AppleSpeechSourceSession.prepare(
            locale: locale,
            writer: writer
        )
        let (localSession, remoteSession) = try await (
            localPreparation,
            remotePreparation
        )
        let origin = CMClockGetTime(CMClockGetHostTimeClock())
        let (localCapture, localInput) = try makeSilentCapture(origin: origin)
        let (remoteCapture, remoteInput) = try makeSilentCapture(origin: origin)

        async let localStart: Void = localSession.start(
            capture: localCapture,
            sessionOrigin: origin
        )
        async let remoteStart: Void = remoteSession.start(
            capture: remoteCapture,
            sessionOrigin: origin
        )
        _ = try await (localStart, remoteStart)
        localInput.finish()
        remoteInput.finish()

        async let localTranscript = localSession.finish()
        async let remoteTranscript = remoteSession.finish()
        let transcripts = try await (localTranscript, remoteTranscript)

        XCTAssertGreaterThanOrEqual(transcripts.0.sourceOffsetMs, 0)
        XCTAssertGreaterThanOrEqual(transcripts.1.sourceOffsetMs, 0)
    }

    private func makeSilentCapture(
        origin: CMTime
    ) throws -> (
        AudioCaptureStream,
        AsyncThrowingStream<CapturedAudioBuffer, Error>.Continuation
    ) {
        guard let format = AVAudioFormat(
            standardFormatWithSampleRate: 48_000,
            channels: 1
        ), let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: 4_800) else {
            throw HelperError.message("Failed to create concurrent speech test audio.")
        }
        buffer.frameLength = 4_800
        let (buffers, continuation) = AsyncThrowingStream.makeStream(
            of: CapturedAudioBuffer.self,
            throwing: Error.self
        )
        continuation.yield(CapturedAudioBuffer(buffer: buffer, hostTime: origin))
        return (AudioCaptureStream(buffers: buffers, format: format), continuation)
    }
}
