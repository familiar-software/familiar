import Foundation

enum OtherVoicesSource: String, Codable, Equatable, Sendable {
    case microphone
    case systemAudio = "system-audio"
}

private let echoWordAlignmentToleranceMs = 500

func detectOtherVoicesSource(
    systemAudioWords: [TranscriptWordPayload]
) -> OtherVoicesSource {
    systemAudioWords.isEmpty ? .microphone : .systemAudio
}

func removeSystemAudioEcho(
    from microphoneWords: [TranscriptWordPayload],
    systemAudioWords: [TranscriptWordPayload]
) throws -> [TranscriptWordPayload] {
    try validateTranscriptWords(microphoneWords)
    try validateTranscriptWords(systemAudioWords)

    let systemWordsByText = Dictionary(grouping: systemAudioWords) { word in
        normalizedWordText(word.text)
    }
    return microphoneWords.filter { microphoneWord in
        let text = normalizedWordText(microphoneWord.text)
        guard !text.isEmpty, let candidates = systemWordsByText[text] else {
            return true
        }
        return !candidates.contains { systemWord in
            wordsAreTimeAligned(microphoneWord, systemWord)
        }
    }
}

private func normalizedWordText(_ text: String) -> String {
    text.lowercased().filter { character in
        character.isLetter || character.isNumber
    }
}

private func wordsAreTimeAligned(
    _ first: TranscriptWordPayload,
    _ second: TranscriptWordPayload
) -> Bool {
    let firstMidpoint = first.startedAtMs + ((first.endedAtMs - first.startedAtMs) / 2)
    let secondMidpoint = second.startedAtMs + ((second.endedAtMs - second.startedAtMs) / 2)
    return abs(firstMidpoint - secondMidpoint) <= echoWordAlignmentToleranceMs
}
