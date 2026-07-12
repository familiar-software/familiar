import Foundation
import XCTest
@testable import FamiliarSpeechHelper

final class DiarizationSessionStorageTests: XCTestCase {
    func testRemovesOnlyStaleDirectSessionDirectories() throws {
        let fixture = try makeFixture()
        defer { try? FileManager.default.removeItem(at: fixture.container) }
        let oldSession = fixture.root.appendingPathComponent(UUID().uuidString)
        let freshSession = fixture.root.appendingPathComponent(UUID().uuidString)
        let unrelatedDirectory = fixture.root.appendingPathComponent("keep-me")
        let externalDirectory = fixture.container.appendingPathComponent("external")
        let linkedSession = fixture.root.appendingPathComponent(UUID().uuidString)
        for directory in [oldSession, freshSession, unrelatedDirectory, externalDirectory] {
            try FileManager.default.createDirectory(
                at: directory,
                withIntermediateDirectories: true
            )
        }
        try FileManager.default.createSymbolicLink(
            at: linkedSession,
            withDestinationURL: externalDirectory
        )
        let now = Date(timeIntervalSince1970: 2_000_000)
        try FileManager.default.setAttributes(
            [.modificationDate: now.addingTimeInterval(-90_000)],
            ofItemAtPath: oldSession.path
        )

        let removed = try removeStaleDiarizationSessions(
            processingRoot: fixture.root,
            olderThan: 86_400,
            now: now
        )

        XCTAssertEqual(removed, 1)
        XCTAssertFalse(FileManager.default.fileExists(atPath: oldSession.path))
        XCTAssertTrue(FileManager.default.fileExists(atPath: freshSession.path))
        XCTAssertTrue(FileManager.default.fileExists(atPath: unrelatedDirectory.path))
        XCTAssertNotNil(
            try? FileManager.default.destinationOfSymbolicLink(atPath: linkedSession.path)
        )
        XCTAssertTrue(FileManager.default.fileExists(atPath: externalDirectory.path))
    }

    func testRejectsSymbolicLinkInProcessingRootPath() throws {
        let fixture = try makeFixture(createRoot: false)
        defer { try? FileManager.default.removeItem(at: fixture.container) }
        let externalDirectory = fixture.container.appendingPathComponent("external")
        try FileManager.default.createDirectory(
            at: externalDirectory,
            withIntermediateDirectories: false
        )
        try FileManager.default.createSymbolicLink(
            at: fixture.root,
            withDestinationURL: externalDirectory
        )

        XCTAssertThrowsError(
            try prepareDiarizationProcessingRoot(fixture.root)
        )
    }

    private func makeFixture(
        createRoot: Bool = true
    ) throws -> (container: URL, root: URL) {
        let container = FileManager.default.temporaryDirectory.appendingPathComponent(
            "familiar-diarization-storage-tests-\(UUID().uuidString)",
            isDirectory: true
        )
        let root = container.appendingPathComponent("diarization", isDirectory: true)
        try FileManager.default.createDirectory(
            at: createRoot ? root : container,
            withIntermediateDirectories: true
        )
        return (container, root)
    }
}
