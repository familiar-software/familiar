import XCTest
@testable import FamiliarSpeechHelper

final class SpeakerAlignmentTests: XCTestCase {
    func testAssignsGreatestOverlapAndNormalizesLabelsByFirstAppearance() throws {
        let words = [
            word("hello", start: 100, end: 400),
            word("there", start: 450, end: 700),
            word("again", start: 750, end: 900),
        ]
        let ranges = [
            SpeakerTimeRange(speakerID: "remote-b", startedAtMs: 200, endedAtMs: 500),
            SpeakerTimeRange(speakerID: "remote-a", startedAtMs: 0, endedAtMs: 250),
            SpeakerTimeRange(speakerID: "remote-a", startedAtMs: 500, endedAtMs: 950),
        ]

        let aligned = try alignWordsToSpeakers(words: words, speakerRanges: ranges)

        XCTAssertEqual(aligned.map(\.speakerID), ["remote-b", "remote-a", "remote-a"])
        XCTAssertEqual(aligned.map(\.speakerLabel), ["Speaker 1", "Speaker 2", "Speaker 2"])
        XCTAssertEqual(aligned.map(\.word), words)
    }

    func testBreaksEqualOverlapTiesDeterministically() throws {
        let words = [
            word("earlier", start: 100, end: 300),
            word("identifier", start: 500, end: 700),
        ]
        let ranges = [
            SpeakerTimeRange(speakerID: "later", startedAtMs: 200, endedAtMs: 400),
            SpeakerTimeRange(speakerID: "earlier", startedAtMs: 0, endedAtMs: 200),
            SpeakerTimeRange(speakerID: "speaker-b", startedAtMs: 500, endedAtMs: 700),
            SpeakerTimeRange(speakerID: "speaker-a", startedAtMs: 500, endedAtMs: 700),
        ]

        let aligned = try alignWordsToSpeakers(words: words, speakerRanges: ranges)

        XCTAssertEqual(aligned.map(\.speakerID), ["earlier", "speaker-a"])
        XCTAssertEqual(aligned.map(\.speakerLabel), ["Speaker 1", "Speaker 2"])
    }

    func testLeavesWordsWithoutPositiveOverlapUnlabeled() throws {
        let words = [
            word("before", start: 0, end: 100),
            word("boundary", start: 200, end: 300),
        ]
        let ranges = [
            SpeakerTimeRange(speakerID: "speaker", startedAtMs: 100, endedAtMs: 200)
        ]

        let aligned = try alignWordsToSpeakers(words: words, speakerRanges: ranges)

        XCTAssertEqual(aligned.map(\.speakerID), [nil, nil])
        XCTAssertEqual(aligned.map(\.speakerLabel), ["", ""])
    }

    func testRejectsMalformedSpeakerRange() {
        let words = [word("hello", start: 100, end: 200)]
        let ranges = [
            SpeakerTimeRange(speakerID: "speaker", startedAtMs: 300, endedAtMs: 200)
        ]

        XCTAssertThrowsError(
            try alignWordsToSpeakers(words: words, speakerRanges: ranges)
        ) { error in
            XCTAssertEqual(
                error as? SpeakerAlignmentError,
                .invalidSpeakerRange(index: 0, startedAtMs: 300, endedAtMs: 200)
            )
        }
    }

    func testRejectsMalformedWordRange() {
        let words = [word("hello", start: 300, end: 200)]

        XCTAssertThrowsError(
            try alignWordsToSpeakers(words: words, speakerRanges: [])
        ) { error in
            XCTAssertEqual(
                error as? SpeakerAlignmentError,
                .invalidWordRange(index: 0, startedAtMs: 300, endedAtMs: 200)
            )
        }
    }

    func testRejectsEmptySpeakerIdentifier() {
        let words = [word("hello", start: 100, end: 200)]
        let ranges = [
            SpeakerTimeRange(speakerID: "  ", startedAtMs: 100, endedAtMs: 200)
        ]

        XCTAssertThrowsError(
            try alignWordsToSpeakers(words: words, speakerRanges: ranges)
        ) { error in
            XCTAssertEqual(error as? SpeakerAlignmentError, .emptySpeakerID(index: 0))
        }
    }

    func testBuildsCompleteTranscriptGroupedByNormalizedSpeaker() throws {
        let words = [
            word("hello", start: 100, end: 300),
            word("there", start: 320, end: 600),
            word("general", start: 800, end: 1_100),
            word("kenobi", start: 1_120, end: 1_500),
        ]
        let ranges = [
            SpeakerTimeRange(speakerID: "remote-b", startedAtMs: 0, endedAtMs: 700),
            SpeakerTimeRange(
                speakerID: "remote-a",
                startedAtMs: 700,
                endedAtMs: 1_600
            ),
        ]

        let payload = try XCTUnwrap(
            makeDiarizedTranscriptPayload(words: words, speakerRanges: ranges)
        )

        XCTAssertTrue(payload.isFinal)
        XCTAssertTrue(payload.replaceTranscript)
        XCTAssertEqual(payload.text, "hello there general kenobi")
        XCTAssertEqual(payload.startedAtMs, 100)
        XCTAssertEqual(payload.endedAtMs, 1_500)
        XCTAssertEqual(payload.segments.map(\.speaker), ["Speaker 1", "Speaker 2"])
        XCTAssertEqual(payload.segments.map(\.text), ["hello there", "general kenobi"])
        XCTAssertEqual(payload.segments[0].words, Array(words[0...1]))
        XCTAssertEqual(payload.segments[1].words, Array(words[2...3]))
    }

    func testBuildsUnlabeledSegmentForWordsWithoutSpeakerOverlap() throws {
        let words = [
            word("unknown", start: 0, end: 100),
            word("speaker", start: 120, end: 220),
        ]

        let payload = try XCTUnwrap(
            makeDiarizedTranscriptPayload(words: words, speakerRanges: [])
        )

        XCTAssertEqual(payload.segments.count, 1)
        XCTAssertNil(payload.segments[0].speaker)
        XCTAssertEqual(payload.segments[0].text, "unknown speaker")
    }

    private func word(_ text: String, start: Int, end: Int) -> TranscriptWordPayload {
        TranscriptWordPayload(text: text, startedAtMs: start, endedAtMs: end)
    }
}
