import AVFoundation
import Foundation
import XCTest
@testable import FamiliarSpeechHelper

final class RealFluidAudioModelTests: XCTestCase {
    func testDiarizesGeneratedSpeechWithPinnedBundledModelsInOfflineMode() async throws {
        let environment = ProcessInfo.processInfo.environment
        guard environment["FAMILIAR_REAL_DIARIZATION_MODEL_TEST"] == "1" else {
            throw XCTSkip(
                "Set FAMILIAR_REAL_DIARIZATION_MODEL_TEST=1 to run FluidAudio inference."
            )
        }
        guard let modelPath = environment["FAMILIAR_DIARIZATION_MODEL_PATH"] else {
            XCTFail("FAMILIAR_DIARIZATION_MODEL_PATH must point to fluid-audio-models.")
            return
        }

        let audioURL = try makeGeneratedSpeechFixture()
        defer { try? FileManager.default.removeItem(at: audioURL) }
        let diarizer = FluidAudioOfflineDiarizer(
            modelDirectory: URL(fileURLWithPath: modelPath, isDirectory: true)
        )

        try await diarizer.prepare()
        let ranges = try await diarizer.diarize(
            audioFileURL: audioURL,
            onProgress: { _ in }
        )

        XCTAssertFalse(ranges.isEmpty, "FluidAudio should detect the generated speaker.")
    }
}

private func makeGeneratedSpeechFixture() throws -> URL {
    let audioURL = FileManager.default.temporaryDirectory
        .appendingPathComponent("familiar-fluid-audio-\(UUID().uuidString).aiff")
    var latestStatus: Int32 = -1

    for attempt in 1...3 {
        try? FileManager.default.removeItem(at: audioURL)
        latestStatus = try generateSpeech(at: audioURL)
        if latestStatus == 0, hasUsableSpeechDuration(at: audioURL) {
            return audioURL
        }
        if attempt < 3 {
            Thread.sleep(forTimeInterval: 0.5)
        }
    }

    throw HelperError.message(
        "macOS say did not generate two seconds of audio after 3 attempts " +
            "(latest status: \(latestStatus))."
    )
}

private func generateSpeech(at audioURL: URL) throws -> Int32 {
    let process = Process()
    process.executableURL = URL(fileURLWithPath: "/usr/bin/say")
    process.arguments = [
        "-o",
        audioURL.path,
        "Hello Familiar. This generated voice verifies offline speaker diarization. " +
            "The model must process speech without downloading any additional files.",
    ]

    try process.run()
    process.waitUntilExit()
    return process.terminationStatus
}

private func hasUsableSpeechDuration(at audioURL: URL) -> Bool {
    guard let audioFile = try? AVAudioFile(forReading: audioURL) else {
        return false
    }
    let sampleRate = audioFile.processingFormat.sampleRate
    guard sampleRate > 0 else {
        return false
    }
    return Double(audioFile.length) / sampleRate >= 2
}
