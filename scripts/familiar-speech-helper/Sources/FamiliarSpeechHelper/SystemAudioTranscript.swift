import Foundation

enum SpeakerTimelineOffsetError: Error, Equatable, LocalizedError {
    case invalidSourceOffset(Int)
    case timestampOverflow

    var errorDescription: String? {
        switch self {
        case .invalidSourceOffset(let value):
            return "Audio has an invalid source offset: \(value) ms."
        case .timestampOverflow:
            return "Remote speaker timestamps exceeded the supported range."
        }
    }
}

func makeSystemAudioTranscriptPayload(
    localWords: [TranscriptWordPayload],
    remoteWords: [TranscriptWordPayload],
    remoteSpeakerRanges: [SpeakerTimeRange],
    remoteSourceOffsetMs: Int
) throws -> TranscriptPayload? {
    try validateTranscriptWords(localWords)
    let localAttributedWords = localWords.map { word in
        SpeakerAttributedWord(word: word, speakerID: nil, speakerLabel: "You")
    }
    let shiftedRanges = try shiftSpeakerRanges(
        remoteSpeakerRanges,
        by: remoteSourceOffsetMs
    )
    let remoteAttributedWords = try alignWordsToSpeakers(
        words: remoteWords,
        speakerRanges: shiftedRanges
    )
    return try makeCompleteTranscriptPayload(
        attributedWords: localAttributedWords + remoteAttributedWords
    )
}

func shiftSpeakerRanges(
    _ ranges: [SpeakerTimeRange],
    by sourceOffsetMs: Int
) throws -> [SpeakerTimeRange] {
    guard sourceOffsetMs >= 0 else {
        throw SpeakerTimelineOffsetError.invalidSourceOffset(sourceOffsetMs)
    }
    return try ranges.map { range in
        SpeakerTimeRange(
            speakerID: range.speakerID,
            startedAtMs: try addOffset(sourceOffsetMs, to: range.startedAtMs),
            endedAtMs: try addOffset(sourceOffsetMs, to: range.endedAtMs)
        )
    }
}

private func addOffset(_ offset: Int, to value: Int) throws -> Int {
    let (result, overflow) = value.addingReportingOverflow(offset)
    guard !overflow else {
        throw SpeakerTimelineOffsetError.timestampOverflow
    }
    return result
}
