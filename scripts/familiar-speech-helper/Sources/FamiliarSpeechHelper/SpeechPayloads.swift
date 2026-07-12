import Foundation

struct InputAudioDevicePayload: Codable, Equatable, Sendable {
    let id: UInt32
    let name: String
}

struct SpeechCapabilityPayload: Codable, Equatable, Sendable {
    let available: Bool
    let locale: String
    let assetState: String
    let microphonePermission: String
    let durationMs: Int
    let inputDevices: [InputAudioDevicePayload]
}

struct SpeechStatusPayload: Codable, Equatable, Sendable {
    let available: Bool
    let runtimeState: String
    let locale: String
    let assetState: String
    let microphonePermission: String
    let inputDevices: [InputAudioDevicePayload]
}

struct InputAudioDevicesPayload: Codable, Equatable, Sendable {
    let inputDevices: [InputAudioDevicePayload]
}

struct TranscriptWordPayload: Codable, Equatable, Hashable, Sendable {
    let text: String
    let startedAtMs: Int
    let endedAtMs: Int
}

struct TranscriptSegmentPayload: Codable, Equatable, Sendable {
    let text: String
    let startedAtMs: Int
    let endedAtMs: Int
    let words: [TranscriptWordPayload]
    let speaker: String?

    init(
        text: String,
        startedAtMs: Int,
        endedAtMs: Int,
        words: [TranscriptWordPayload],
        speaker: String? = nil
    ) {
        self.text = text
        self.startedAtMs = startedAtMs
        self.endedAtMs = endedAtMs
        self.words = words
        self.speaker = speaker
    }
}

struct TranscriptPayload: Codable, Equatable, Sendable {
    let text: String
    let isFinal: Bool
    let startedAtMs: Int
    let endedAtMs: Int
    let segments: [TranscriptSegmentPayload]
    let replaceTranscript: Bool
    let otherVoicesSource: OtherVoicesSource?

    init(
        text: String,
        isFinal: Bool,
        startedAtMs: Int,
        endedAtMs: Int,
        segments: [TranscriptSegmentPayload],
        replaceTranscript: Bool = false,
        otherVoicesSource: OtherVoicesSource? = nil
    ) {
        self.text = text
        self.isFinal = isFinal
        self.startedAtMs = startedAtMs
        self.endedAtMs = endedAtMs
        self.segments = segments
        self.replaceTranscript = replaceTranscript
        self.otherVoicesSource = otherVoicesSource
    }
}
