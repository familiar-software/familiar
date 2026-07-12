import FluidAudio
import Foundation

struct DiarizationProgress: Equatable, Sendable {
    let completedChunks: Int
    let totalChunks: Int
}

typealias DiarizationProgressHandler = @Sendable (DiarizationProgress) -> Void

protocol OfflineSpeakerDiarizing: Sendable {
    func prepare() async throws
    func diarize(
        audioFileURL: URL,
        onProgress: @escaping DiarizationProgressHandler
    ) async throws -> [SpeakerTimeRange]
}

struct FluidAudioSpeakerSegment: Equatable, Sendable {
    let speakerID: String
    let startSeconds: Double
    let endSeconds: Double
}

enum FluidAudioDiarizationError: Error, Equatable, LocalizedError {
    case notPrepared
    case invalidSegment(
        index: Int,
        speakerID: String,
        startSeconds: Double,
        endSeconds: Double
    )
    case modelPreparationFailed(path: String, details: String)
    case processingFailed(path: String, details: String)

    var errorDescription: String? {
        switch self {
        case .notPrepared:
            return "FluidAudio diarization models have not been prepared."
        case .invalidSegment(let index, let speakerID, let start, let end):
            return "FluidAudio segment \(index) for \(speakerID) is invalid: \(start)-\(end)s."
        case .modelPreparationFailed(let path, let details):
            return "Failed to load bundled FluidAudio models from \(path): \(details)"
        case .processingFailed(let path, let details):
            return "FluidAudio failed to diarize \(path): \(details)"
        }
    }
}

actor FluidAudioOfflineDiarizer: OfflineSpeakerDiarizing {
    static let familiarClusteringThreshold = 0.6

    private let modelDirectory: URL
    private let manager: OfflineDiarizerManager
    private var isPrepared = false

    init(
        modelDirectory: URL,
        clusteringThreshold: Double = familiarClusteringThreshold
    ) {
        self.modelDirectory = modelDirectory
        manager = OfflineDiarizerManager(
            config: OfflineDiarizerConfig(clusteringThreshold: clusteringThreshold)
        )
    }

    func prepare() async throws {
        guard !isPrepared else {
            return
        }
        DownloadUtils.enforceOffline = true
        do {
            try validateBundledDiarizationModels(at: modelDirectory)
            let models = try await OfflineDiarizerModels.load(from: modelDirectory)
            manager.initialize(models: models)
            isPrepared = true
            writeDiagnostic("FluidAudio offline diarization models prepared")
        } catch {
            throw FluidAudioDiarizationError.modelPreparationFailed(
                path: modelDirectory.path,
                details: error.localizedDescription
            )
        }
    }

    func diarize(
        audioFileURL: URL,
        onProgress: @escaping DiarizationProgressHandler
    ) async throws -> [SpeakerTimeRange] {
        guard isPrepared else {
            throw FluidAudioDiarizationError.notPrepared
        }
        do {
            let result = try await manager.process(audioFileURL) { completed, total in
                onProgress(
                    DiarizationProgress(
                        completedChunks: completed,
                        totalChunks: total
                    )
                )
            }
            let segments = result.segments.map {
                FluidAudioSpeakerSegment(
                    speakerID: $0.speakerId,
                    startSeconds: Double($0.startTimeSeconds),
                    endSeconds: Double($0.endTimeSeconds)
                )
            }
            return try makeSpeakerTimeRanges(from: segments)
        } catch let error as FluidAudioDiarizationError {
            throw error
        } catch {
            throw FluidAudioDiarizationError.processingFailed(
                path: audioFileURL.path,
                details: error.localizedDescription
            )
        }
    }
}

func makeSpeakerTimeRanges(
    from segments: [FluidAudioSpeakerSegment]
) throws -> [SpeakerTimeRange] {
    try segments.enumerated().map { index, segment in
        let maximumSeconds = Double(Int.max) / 1_000
        guard !segment.speakerID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              segment.startSeconds.isFinite,
              segment.endSeconds.isFinite,
              segment.startSeconds >= 0,
              segment.endSeconds > segment.startSeconds,
              segment.endSeconds <= maximumSeconds else {
            throw FluidAudioDiarizationError.invalidSegment(
                index: index,
                speakerID: segment.speakerID,
                startSeconds: segment.startSeconds,
                endSeconds: segment.endSeconds
            )
        }
        return SpeakerTimeRange(
            speakerID: segment.speakerID,
            startedAtMs: milliseconds(segment.startSeconds),
            endedAtMs: milliseconds(segment.endSeconds)
        )
    }
}

private func milliseconds(_ seconds: Double) -> Int {
    Int((seconds * 1_000).rounded(.toNearestOrAwayFromZero))
}
