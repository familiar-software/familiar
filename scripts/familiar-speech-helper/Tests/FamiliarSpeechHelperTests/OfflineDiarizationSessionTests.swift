import AVFoundation
import XCTest
@testable import FamiliarSpeechHelper

final class OfflineDiarizationSessionTests: XCTestCase {
    func testFinalizesRecordedAudioForOfflineDiarization() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(
            "familiar-automatic-session-test-\(UUID().uuidString)",
            isDirectory: true
        )
        let format = try XCTUnwrap(
            AVAudioFormat(
                commonFormat: .pcmFormatFloat32,
                sampleRate: 16_000,
                channels: 1,
                interleaved: false
            )
        )
        let session = try OfflineDiarizationSession(
            inputFormat: format,
            processingRoot: root
        )
        let buffer = try XCTUnwrap(
            AVAudioPCMBuffer(pcmFormat: format, frameCapacity: 1_600)
        )
        buffer.frameLength = 1_600
        let diarizer = StubOfflineDiarizer(ranges: [
            SpeakerTimeRange(speakerID: "S1", startedAtMs: 0, endedAtMs: 500)
        ])
        let progressRecorder = ProgressRecorder()
        let progressHandler: DiarizationProgressHandler = { progress in
            progressRecorder.record(progress)
        }
        try session.append(buffer)
        try session.finishRecording()
        let ranges = try await session.diarize(
            using: diarizer,
            onProgress: progressHandler
        )
        let receivedAudioURL = await diarizer.receivedAudioURL()

        XCTAssertEqual(ranges.count, 1)
        XCTAssertEqual(ranges.first?.speakerID, "S1")
        XCTAssertEqual(receivedAudioURL, session.audioFileURL)
        XCTAssertEqual(progressRecorder.values, [
            DiarizationProgress(completedChunks: 1, totalChunks: 1)
        ])
        try session.cleanup()
        XCTAssertFalse(FileManager.default.fileExists(atPath: session.directoryURL.path))
        try FileManager.default.removeItem(at: root)
    }
}

private actor StubOfflineDiarizer: OfflineSpeakerDiarizing {
    private let ranges: [SpeakerTimeRange]
    private var audioURL: URL?

    init(ranges: [SpeakerTimeRange]) {
        self.ranges = ranges
    }

    func prepare() async throws {}

    func diarize(
        audioFileURL: URL,
        onProgress: @escaping DiarizationProgressHandler
    ) async throws -> [SpeakerTimeRange] {
        audioURL = audioFileURL
        onProgress(DiarizationProgress(completedChunks: 1, totalChunks: 1))
        return ranges
    }

    func receivedAudioURL() -> URL? {
        audioURL
    }
}

private final class ProgressRecorder: @unchecked Sendable {
    private let lock = NSLock()
    private var recordedValues: [DiarizationProgress] = []

    var values: [DiarizationProgress] {
        lock.withLock { recordedValues }
    }

    func record(_ progress: DiarizationProgress) {
        lock.withLock {
            recordedValues.append(progress)
        }
    }
}
