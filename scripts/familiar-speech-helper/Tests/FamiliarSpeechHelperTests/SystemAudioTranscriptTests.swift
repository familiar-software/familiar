import XCTest
@testable import FamiliarSpeechHelper

final class SystemAudioTranscriptTests: XCTestCase {
    func testMergesYouAndRemoteSpeakersOnTheCommonTimeline() throws {
        let localWords = [
            word("I", start: 100, end: 180),
            word("agree", start: 850, end: 1_000),
        ]
        let remoteWords = [
            word("hello", start: 250, end: 400),
            word("there", start: 500, end: 650),
        ]
        let remoteRanges = [
            SpeakerTimeRange(speakerID: "remote-a", startedAtMs: 0, endedAtMs: 500)
        ]

        let payload = try XCTUnwrap(makeSystemAudioTranscriptPayload(
            localWords: localWords,
            remoteWords: remoteWords,
            remoteSpeakerRanges: remoteRanges,
            remoteSourceOffsetMs: 200
        ))

        XCTAssertEqual(payload.text, "I hello there agree")
        XCTAssertEqual(payload.segments.map(\.speaker), ["You", "Speaker 1", "You"])
        XCTAssertEqual(payload.segments.map(\.text), ["I", "hello there", "agree"])
        XCTAssertEqual(payload.startedAtMs, 100)
        XCTAssertEqual(payload.endedAtMs, 1_000)
        XCTAssertTrue(payload.replaceTranscript)
    }

    func testPreservesSimultaneousLocalAndRemoteWords() throws {
        let payload = try XCTUnwrap(makeSystemAudioTranscriptPayload(
            localWords: [word("local", start: 100, end: 500)],
            remoteWords: [word("remote", start: 100, end: 500)],
            remoteSpeakerRanges: [
                SpeakerTimeRange(
                    speakerID: "remote-a",
                    startedAtMs: 100,
                    endedAtMs: 500
                )
            ],
            remoteSourceOffsetMs: 0
        ))

        XCTAssertEqual(payload.segments.map(\.text), ["local", "remote"])
        XCTAssertEqual(payload.segments.map(\.speaker), ["You", "Speaker 1"])
    }

    func testReturnsNilWhenNeitherSourceHasFinalWords() throws {
        XCTAssertNil(try makeSystemAudioTranscriptPayload(
            localWords: [],
            remoteWords: [],
            remoteSpeakerRanges: [],
            remoteSourceOffsetMs: 0
        ))
    }

    private func word(_ text: String, start: Int, end: Int) -> TranscriptWordPayload {
        TranscriptWordPayload(text: text, startedAtMs: start, endedAtMs: end)
    }
}
