import Foundation

struct SpeakerTimeRange: Equatable, Sendable {
    let speakerID: String
    let startedAtMs: Int
    let endedAtMs: Int
}

struct SpeakerAttributedWord: Equatable, Sendable {
    let word: TranscriptWordPayload
    let speakerID: String?
    let speakerLabel: String
}

enum SpeakerAlignmentError: Error, Equatable, LocalizedError {
    case invalidWordRange(index: Int, startedAtMs: Int, endedAtMs: Int)
    case invalidSpeakerRange(index: Int, startedAtMs: Int, endedAtMs: Int)
    case emptySpeakerID(index: Int)

    var errorDescription: String? {
        switch self {
        case .invalidWordRange(let index, let startedAtMs, let endedAtMs):
            return "Word \(index) has an invalid time range: \(startedAtMs)-\(endedAtMs) ms."
        case .invalidSpeakerRange(let index, let startedAtMs, let endedAtMs):
            return "Speaker range \(index) is invalid: \(startedAtMs)-\(endedAtMs) ms."
        case .emptySpeakerID(let index):
            return "Speaker range \(index) has an empty speaker identifier."
        }
    }
}

private struct SpeakerMatch {
    let range: SpeakerTimeRange
    let overlapMs: Int
}

func alignWordsToSpeakers(
    words: [TranscriptWordPayload],
    speakerRanges: [SpeakerTimeRange]
) throws -> [SpeakerAttributedWord] {
    try validateTranscriptWords(words)
    try validateSpeakerRanges(speakerRanges)

    let assignments = words.map { word in
        SpeakerAttributedWord(
            word: word,
            speakerID: bestSpeakerID(for: word, in: speakerRanges),
            speakerLabel: ""
        )
    }
    return addNormalizedLabels(to: assignments)
}

func validateTranscriptWords(_ words: [TranscriptWordPayload]) throws {
    for (index, word) in words.enumerated() {
        guard word.startedAtMs >= 0, word.endedAtMs >= word.startedAtMs else {
            throw SpeakerAlignmentError.invalidWordRange(
                index: index,
                startedAtMs: word.startedAtMs,
                endedAtMs: word.endedAtMs
            )
        }
    }
}

func chronologicallyOrderedTranscriptWords(
    _ words: [TranscriptWordPayload]
) -> [TranscriptWordPayload] {
    words.enumerated().sorted { left, right in
        if left.element.startedAtMs != right.element.startedAtMs {
            return left.element.startedAtMs < right.element.startedAtMs
        }
        if left.element.endedAtMs != right.element.endedAtMs {
            return left.element.endedAtMs < right.element.endedAtMs
        }
        return left.offset < right.offset
    }.map(\.element)
}

func makeDiarizedTranscriptPayload(
    words: [TranscriptWordPayload],
    speakerRanges: [SpeakerTimeRange],
    sourceOffsetMs: Int = 0
) throws -> TranscriptPayload? {
    let orderedWords = chronologicallyOrderedTranscriptWords(words)
    let alignedWords = try alignWordsToSpeakers(
        words: orderedWords,
        speakerRanges: try shiftSpeakerRanges(speakerRanges, by: sourceOffsetMs)
    )
    return try makeCompleteTranscriptPayload(attributedWords: alignedWords)
}

func makeCompleteTranscriptPayload(
    attributedWords: [SpeakerAttributedWord]
) throws -> TranscriptPayload? {
    let orderedWords = attributedWords.enumerated().sorted { left, right in
        if left.element.word.startedAtMs != right.element.word.startedAtMs {
            return left.element.word.startedAtMs < right.element.word.startedAtMs
        }
        if left.element.word.endedAtMs != right.element.word.endedAtMs {
            return left.element.word.endedAtMs < right.element.word.endedAtMs
        }
        return left.offset < right.offset
    }.map(\.element)
    guard !orderedWords.isEmpty else {
        return nil
    }
    try validateTranscriptWords(orderedWords.map(\.word))

    let segments = makeSpeakerTranscriptSegments(from: orderedWords)
    return TranscriptPayload(
        text: segments.map(\.text).joined(separator: " "),
        isFinal: true,
        startedAtMs: orderedWords.map(\.word.startedAtMs).min() ?? 0,
        endedAtMs: orderedWords.map(\.word.endedAtMs).max() ?? 0,
        segments: segments,
        replaceTranscript: true
    )
}

private func makeSpeakerTranscriptSegments(
    from words: [SpeakerAttributedWord]
) -> [TranscriptSegmentPayload] {
    var groups: [[SpeakerAttributedWord]] = []
    for word in words {
        if groups.last?.last?.speakerLabel == word.speakerLabel {
            groups[groups.count - 1].append(word)
        } else {
            groups.append([word])
        }
    }
    return groups.compactMap(makeSpeakerTranscriptSegment)
}

private func makeSpeakerTranscriptSegment(
    from words: [SpeakerAttributedWord]
) -> TranscriptSegmentPayload? {
    guard let first = words.first, let last = words.last else {
        return nil
    }
    return TranscriptSegmentPayload(
        text: words.map(\.word.text).joined(separator: " "),
        startedAtMs: first.word.startedAtMs,
        endedAtMs: last.word.endedAtMs,
        words: words.map(\.word),
        speaker: first.speakerLabel.isEmpty ? nil : first.speakerLabel
    )
}

private func validateSpeakerRanges(_ ranges: [SpeakerTimeRange]) throws {
    for (index, range) in ranges.enumerated() {
        guard !range.speakerID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            throw SpeakerAlignmentError.emptySpeakerID(index: index)
        }
        guard range.startedAtMs >= 0, range.endedAtMs > range.startedAtMs else {
            throw SpeakerAlignmentError.invalidSpeakerRange(
                index: index,
                startedAtMs: range.startedAtMs,
                endedAtMs: range.endedAtMs
            )
        }
    }
}

private func bestSpeakerID(
    for word: TranscriptWordPayload,
    in ranges: [SpeakerTimeRange]
) -> String? {
    var bestMatch: SpeakerMatch?
    for range in ranges {
        let overlapMs = overlapDurationMs(word: word, range: range)
        guard overlapMs > 0 else {
            continue
        }
        let candidate = SpeakerMatch(range: range, overlapMs: overlapMs)
        if shouldPrefer(candidate, over: bestMatch) {
            bestMatch = candidate
        }
    }
    return bestMatch?.range.speakerID
}

private func overlapDurationMs(
    word: TranscriptWordPayload,
    range: SpeakerTimeRange
) -> Int {
    let overlapStart = max(word.startedAtMs, range.startedAtMs)
    let overlapEnd = min(word.endedAtMs, range.endedAtMs)
    return max(0, overlapEnd - overlapStart)
}

private func shouldPrefer(_ candidate: SpeakerMatch, over current: SpeakerMatch?) -> Bool {
    guard let current else {
        return true
    }
    if candidate.overlapMs != current.overlapMs {
        return candidate.overlapMs > current.overlapMs
    }
    if candidate.range.startedAtMs != current.range.startedAtMs {
        return candidate.range.startedAtMs < current.range.startedAtMs
    }
    return candidate.range.speakerID < current.range.speakerID
}

private func addNormalizedLabels(
    to assignments: [SpeakerAttributedWord]
) -> [SpeakerAttributedWord] {
    var labelsBySpeakerID: [String: String] = [:]
    var nextLabelNumber = 1
    var labeledWords: [SpeakerAttributedWord] = []
    labeledWords.reserveCapacity(assignments.count)

    for assignment in assignments {
        guard let speakerID = assignment.speakerID else {
            labeledWords.append(assignment)
            continue
        }
        let speakerLabel: String
        if let existingLabel = labelsBySpeakerID[speakerID] {
            speakerLabel = existingLabel
        } else {
            speakerLabel = "Speaker \(nextLabelNumber)"
            labelsBySpeakerID[speakerID] = speakerLabel
            nextLabelNumber += 1
        }
        labeledWords.append(SpeakerAttributedWord(
            word: assignment.word,
            speakerID: speakerID,
            speakerLabel: speakerLabel
        ))
    }
    return labeledWords
}
