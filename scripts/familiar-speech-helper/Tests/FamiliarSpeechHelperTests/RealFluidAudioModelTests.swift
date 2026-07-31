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
    guard process.terminationStatus == 0 else {
        throw HelperError.message(
            "macOS say failed with status \(process.terminationStatus)."
        )
    }
    return audioURL
}
