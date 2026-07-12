import XCTest
@testable import FamiliarSpeechHelper

final class FinalTranscriptAccumulatorTests: XCTestCase {
    func testIgnoresPartialWordsAndReturnsDeduplicatedFinalWordsInTimeOrder() throws {
        let first = word("first", start: 100, end: 200)
        let second = word("second", start: 300, end: 400)
        var accumulator = FinalTranscriptAccumulator()

        try accumulator.append(payload(text: "draft", isFinal: false, words: [second]))
        try accumulator.append(payload(text: "second", isFinal: true, words: [second]))
        try accumulator.append(payload(text: "first", isFinal: true, words: [first]))
        try accumulator.append(payload(text: "second", isFinal: true, words: [second]))

        XCTAssertEqual(accumulator.orderedWords, [first, second])
    }

    func testRejectsFinalTextWithoutWordTimings() {
        var accumulator = FinalTranscriptAccumulator()

        XCTAssertThrowsError(
            try accumulator.append(payload(text: "spoken words", isFinal: true, words: []))
        ) { error in
            XCTAssertEqual(
                error as? FinalTranscriptAccumulatorError,
                .missingWordTimings(text: "spoken words")
            )
        }
    }

    private func payload(
        text: String,
        isFinal: Bool,
        words: [TranscriptWordPayload]
    ) -> TranscriptPayload {
        TranscriptPayload(
            text: text,
            isFinal: isFinal,
            startedAtMs: words.first?.startedAtMs ?? 0,
            endedAtMs: words.last?.endedAtMs ?? 0,
            segments: [
                TranscriptSegmentPayload(
                    text: text,
                    startedAtMs: words.first?.startedAtMs ?? 0,
                    endedAtMs: words.last?.endedAtMs ?? 0,
                    words: words
                )
            ]
        )
    }

    private func word(_ text: String, start: Int, end: Int) -> TranscriptWordPayload {
        TranscriptWordPayload(text: text, startedAtMs: start, endedAtMs: end)
    }
}
