import XCTest
@testable import FamiliarSpeechHelper

final class AutomaticCaptureTranscriptTests: XCTestCase {
    func testUsesMicrophoneWhenSystemAudioHasNoRecognizedSpeech() {
        XCTAssertEqual(
            detectOtherVoicesSource(systemAudioWords: []),
            .microphone
        )
    }

    func testUsesSystemAudioWhenItHasRecognizedSpeech() {
        XCTAssertEqual(
            detectOtherVoicesSource(
                systemAudioWords: [word("hello", start: 100, end: 300)]
            ),
            .systemAudio
        )
    }

    func testRemovesMatchingSystemAudioEchoFromMicrophoneWords() throws {
        let microphoneWords = [
            word("I", start: 100, end: 200),
            word("agree", start: 250, end: 500),
            word("Hello!", start: 700, end: 950),
        ]
        let systemAudioWords = [
            word("hello", start: 750, end: 1_000)
        ]

        let filtered = try removeSystemAudioEcho(
            from: microphoneWords,
            systemAudioWords: systemAudioWords
        )

        XCTAssertEqual(filtered.map(\.text), ["I", "agree"])
    }

    func testPreservesDifferentWordsSpokenAtTheSameTime() throws {
        let filtered = try removeSystemAudioEcho(
            from: [word("local", start: 100, end: 500)],
            systemAudioWords: [word("remote", start: 100, end: 500)]
        )

        XCTAssertEqual(filtered.map(\.text), ["local"])
    }

    func testRejectsInvalidWordTimelinesBeforeEchoRemoval() {
        XCTAssertThrowsError(try removeSystemAudioEcho(
            from: [word("invalid", start: 500, end: 100)],
            systemAudioWords: []
        ))
    }

    private func word(_ text: String, start: Int, end: Int) -> TranscriptWordPayload {
        TranscriptWordPayload(text: text, startedAtMs: start, endedAtMs: end)
    }
}
