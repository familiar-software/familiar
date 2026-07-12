import AVFoundation
import XCTest
@testable import FamiliarSpeechHelper

final class DiarizationAudioRecorderTests: XCTestCase {
    func testWritesConvertedMonoAudioAndCleansOnlyItsSessionDirectory() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(
            "familiar-recorder-test-\(UUID().uuidString)",
            isDirectory: true
        )
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: false)
        let session = try DiarizationAudioSession(processingRoot: root)
        let inputFormat = try XCTUnwrap(
            AVAudioFormat(
                commonFormat: .pcmFormatFloat32,
                sampleRate: 48_000,
                channels: 2,
                interleaved: false
            )
        )
        let recorder = try DiarizationAudioRecorder(
            inputFormat: inputFormat,
            outputURL: session.audioFileURL
        )
        let input = try makeInputBuffer(format: inputFormat, frameCount: 4_800)

        try recorder.append(input)
        try recorder.finish()

        let file = try AVAudioFile(forReading: session.audioFileURL)
        XCTAssertEqual(file.fileFormat.sampleRate, 16_000)
        XCTAssertEqual(file.fileFormat.channelCount, 1)
        XCTAssertEqual(file.length, 1_600, accuracy: 4)
        let permissions = try XCTUnwrap(
            try FileManager.default.attributesOfItem(
                atPath: session.audioFileURL.path
            )[.posixPermissions] as? NSNumber
        )
        XCTAssertEqual(permissions.intValue & 0o777, 0o600)

        try session.cleanup()

        XCTAssertFalse(FileManager.default.fileExists(atPath: session.directoryURL.path))
        XCTAssertTrue(FileManager.default.fileExists(atPath: root.path))
        try FileManager.default.removeItem(at: root)
    }

    private func makeInputBuffer(
        format: AVAudioFormat,
        frameCount: AVAudioFrameCount
    ) throws -> AVAudioPCMBuffer {
        let buffer = try XCTUnwrap(
            AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frameCount)
        )
        buffer.frameLength = frameCount
        let channels = try XCTUnwrap(buffer.floatChannelData)
        for channel in 0..<Int(format.channelCount) {
            for frame in 0..<Int(frameCount) {
                channels[channel][frame] = sin(Float(frame) / 20)
            }
        }
        return buffer
    }
}
