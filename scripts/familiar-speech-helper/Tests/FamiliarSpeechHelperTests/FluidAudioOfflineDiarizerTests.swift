import XCTest
@testable import FamiliarSpeechHelper

final class FluidAudioOfflineDiarizerTests: XCTestCase {
    func testUsesFluidAudioCommunityClusteringThreshold() {
        XCTAssertEqual(FluidAudioOfflineDiarizer.familiarClusteringThreshold, 0.6)
    }

    func testMapsFluidAudioSecondsAndSpeakerIdentifiersToTimeRanges() throws {
        let segments = [
            FluidAudioSpeakerSegment(
                speakerID: "S2",
                startSeconds: 0.123,
                endSeconds: 1.999
            ),
            FluidAudioSpeakerSegment(
                speakerID: "S1",
                startSeconds: 2.0,
                endSeconds: 2.75
            ),
        ]

        let ranges = try makeSpeakerTimeRanges(from: segments)

        XCTAssertEqual(ranges, [
            SpeakerTimeRange(speakerID: "S2", startedAtMs: 123, endedAtMs: 1_999),
            SpeakerTimeRange(speakerID: "S1", startedAtMs: 2_000, endedAtMs: 2_750),
        ])
    }

    func testRejectsInvalidFluidAudioTimeRange() {
        let segment = FluidAudioSpeakerSegment(
            speakerID: "S1",
            startSeconds: 2,
            endSeconds: 1
        )

        XCTAssertThrowsError(try makeSpeakerTimeRanges(from: [segment])) { error in
            XCTAssertEqual(
                error as? FluidAudioDiarizationError,
                .invalidSegment(
                    index: 0,
                    speakerID: "S1",
                    startSeconds: 2,
                    endSeconds: 1
                )
            )
        }
    }
}
