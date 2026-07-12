import Foundation
import XCTest
@testable import FamiliarSpeechHelper

final class DiarizationModelManifestTests: XCTestCase {
    func testAcceptsAnExactModelBundle() throws {
        let root = try makeModelBundle()

        XCTAssertNoThrow(try validateBundledDiarizationModels(at: root))
    }

    func testRejectsAChangedModelFileWithTheExpectedSize() throws {
        let root = try makeModelBundle(content: Data("tampered model".utf8))

        XCTAssertThrowsError(try validateBundledDiarizationModels(at: root)) { error in
            XCTAssertTrue(error.localizedDescription.contains("failed SHA-256 validation"))
        }
    }

    func testRejectsUnexpectedFiles() throws {
        let root = try makeModelBundle(extraFile: true)

        XCTAssertThrowsError(try validateBundledDiarizationModels(at: root)) { error in
            XCTAssertTrue(error.localizedDescription.contains("unexpected files"))
        }
    }

    func testRejectsManifestPathTraversal() throws {
        let root = try makeModelBundle(listedPath: "../outside.bin")

        XCTAssertThrowsError(try validateBundledDiarizationModels(at: root)) { error in
            XCTAssertTrue(error.localizedDescription.contains("unsafe model path"))
        }
    }

    func testRejectsSymbolicLinkedModelFile() throws {
        let root = try makeModelBundle()
        let modelFile = root.appendingPathComponent(
            "speaker-diarization/Segmentation.mlmodelc/coremldata.bin"
        )
        let outsideFile = root.appendingPathComponent("outside.bin")
        try Data("verified model".utf8).write(to: outsideFile)
        try FileManager.default.removeItem(at: modelFile)
        try FileManager.default.createSymbolicLink(
            at: modelFile,
            withDestinationURL: outsideFile
        )

        XCTAssertThrowsError(try validateBundledDiarizationModels(at: root)) { error in
            XCTAssertTrue(error.localizedDescription.contains("symbolic link"))
        }
    }

    private func makeModelBundle(
        content: Data = Data("verified model".utf8),
        listedPath: String = "Segmentation.mlmodelc/coremldata.bin",
        extraFile: Bool = false
    ) throws -> URL {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(
            "familiar-model-manifest-test-\(UUID().uuidString)",
            isDirectory: true
        )
        let modelRoot = root.appendingPathComponent(
            "speaker-diarization",
            isDirectory: true
        )
        let modelFile = modelRoot.appendingPathComponent(
            "Segmentation.mlmodelc/coremldata.bin"
        )
        try FileManager.default.createDirectory(
            at: modelFile.deletingLastPathComponent(),
            withIntermediateDirectories: true
        )
        try content.write(to: modelFile)
        if extraFile {
            try Data("extra".utf8).write(
                to: modelRoot.appendingPathComponent("unexpected.bin")
            )
        }

        let manifest: [String: Any] = [
            "schemaVersion": 1,
            "localDirectory": "speaker-diarization",
            "files": [[
                "path": listedPath,
                "size": 14,
                "sha256": "6c736b3dfa943bf4e7c61df78d1dfcad9a3d8b56369f0559670497b19127e74d",
            ]],
        ]
        let manifestData = try JSONSerialization.data(
            withJSONObject: manifest,
            options: [.prettyPrinted, .sortedKeys]
        )
        try manifestData.write(
            to: root.appendingPathComponent("fluid-audio-model-manifest.json")
        )
        addTeardownBlock {
            try FileManager.default.removeItem(at: root)
        }
        return root
    }
}
