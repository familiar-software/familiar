import CoreMedia
import Foundation
import Speech

@available(macOS 26.0, *)
func makeTranscriptPayload(from result: SpeechTranscriber.Result) -> TranscriptPayload? {
    let text = String(result.text.characters).trimmingCharacters(in: .whitespacesAndNewlines)
    guard !text.isEmpty else {
        return nil
    }

    let startedAtMs = milliseconds(result.range.start)
    let endedAtMs = milliseconds(CMTimeRangeGetEnd(result.range))
    let segment = TranscriptSegmentPayload(
        text: text,
        startedAtMs: startedAtMs,
        endedAtMs: max(startedAtMs, endedAtMs),
        words: makeWordPayloads(from: result.text)
    )
    return TranscriptPayload(
        text: text,
        isFinal: result.isFinal,
        startedAtMs: segment.startedAtMs,
        endedAtMs: segment.endedAtMs,
        segments: [segment]
    )
}

@available(macOS 26.0, *)
private func makeWordPayloads(from text: AttributedString) -> [TranscriptWordPayload] {
    var words: [TranscriptWordPayload] = []
    for run in text.runs {
        guard let timeRange = run.audioTimeRange else {
            continue
        }
        let word = String(text[run.range].characters)
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard !word.isEmpty else {
            continue
        }
        let startedAtMs = milliseconds(timeRange.start)
        words.append(TranscriptWordPayload(
            text: word,
            startedAtMs: startedAtMs,
            endedAtMs: max(startedAtMs, milliseconds(CMTimeRangeGetEnd(timeRange)))
        ))
    }
    return words
}

private func milliseconds(_ time: CMTime) -> Int {
    let seconds = CMTimeGetSeconds(time)
    guard seconds.isFinite, seconds > 0 else {
        return 0
    }
    return Int((seconds * 1000).rounded(.down))
}
