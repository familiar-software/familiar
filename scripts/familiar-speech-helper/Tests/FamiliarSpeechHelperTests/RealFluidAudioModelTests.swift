import Foundation
import XCTest
@testable import FamiliarSpeechHelper

final class RealFluidAudioModelTests: XCTestCase {
    func testLoadsPinnedBundledModelsInOfflineMode() async throws {
        let environment = ProcessInfo.processInfo.environment
        guard environment["FAMILIAR_REAL_DIARIZATION_MODEL_TEST"] == "1" else {
            throw XCTSkip(
                "Set FAMILIAR_REAL_DIARIZATION_MODEL_TEST=1 to load the bundled models."
            )
        }
        guard let modelPath = environment["FAMILIAR_DIARIZATION_MODEL_PATH"] else {
            XCTFail("FAMILIAR_DIARIZATION_MODEL_PATH must point to fluid-audio-models.")
            return
        }

        let diarizer = FluidAudioOfflineDiarizer(
            modelDirectory: URL(fileURLWithPath: modelPath, isDirectory: true)
        )

        try await diarizer.prepare()
    }
}
