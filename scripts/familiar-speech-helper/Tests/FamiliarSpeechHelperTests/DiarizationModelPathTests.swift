import Foundation
import XCTest
@testable import FamiliarSpeechHelper

final class DiarizationModelPathTests: XCTestCase {
    func testResolvesModelsBesideTheHelperExecutable() {
        let executableURL = URL(
            fileURLWithPath: "/Applications/Familiar.app/Contents/Resources/" +
                "familiar-speech-helper"
        )

        let modelDirectory = bundledDiarizationModelDirectory(
            executableURL: executableURL
        )

        XCTAssertEqual(
            modelDirectory.path,
            "/Applications/Familiar.app/Contents/Resources/fluid-audio-models"
        )
    }
}
