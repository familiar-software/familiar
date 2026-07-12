import Foundation

enum FinalTranscriptAccumulatorError: Error, Equatable, LocalizedError {
    case missingWordTimings(text: String)

    var errorDescription: String? {
        switch self {
        case .missingWordTimings(let text):
            return "Final speech result has no word timings: \(text)"
        }
    }
}

struct FinalTranscriptAccumulator {
    private var finalWords: [TranscriptWordPayload] = []
    private var seenWords: Set<TranscriptWordPayload> = []

    var orderedWords: [TranscriptWordPayload] {
        chronologicallyOrderedTranscriptWords(finalWords)
    }

    mutating func append(_ payload: TranscriptPayload) throws {
        guard payload.isFinal else {
            return
        }
        let words = payload.segments.flatMap(\.words)
        guard !words.isEmpty else {
            throw FinalTranscriptAccumulatorError.missingWordTimings(text: payload.text)
        }
        try validateTranscriptWords(words)
        for word in words where seenWords.insert(word).inserted {
            finalWords.append(word)
        }
    }
}
