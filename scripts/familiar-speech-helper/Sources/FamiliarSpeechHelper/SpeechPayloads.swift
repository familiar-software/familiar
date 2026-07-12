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

struct TranscriptWordPayload: Codable, Equatable, Sendable {
    let text: String
    let startedAtMs: Int
    let endedAtMs: Int
}

struct TranscriptSegmentPayload: Codable, Equatable, Sendable {
    let text: String
    let startedAtMs: Int
    let endedAtMs: Int
    let words: [TranscriptWordPayload]
}

struct TranscriptPayload: Codable, Equatable, Sendable {
    let text: String
    let isFinal: Bool
    let startedAtMs: Int
    let endedAtMs: Int
    let segments: [TranscriptSegmentPayload]
}
