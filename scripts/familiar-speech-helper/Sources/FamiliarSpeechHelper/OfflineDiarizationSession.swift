import AVFoundation
import Foundation

enum OfflineDiarizationSessionError: Error, LocalizedError {
    case recordingNotFinished

    var errorDescription: String? {
        switch self {
        case .recordingNotFinished:
            return "Audio recording must finish before diarization."
        }
    }
}

final class OfflineDiarizationSession: @unchecked Sendable {
    private let audioSession: DiarizationAudioSession
    private let recorder: DiarizationAudioRecorder
    private var recordingFinished = false

    var directoryURL: URL {
        audioSession.directoryURL
    }

    var audioFileURL: URL {
        audioSession.audioFileURL
    }

    init(
        inputFormat: AVAudioFormat,
        processingRoot: URL = defaultDiarizationProcessingRoot()
    ) throws {
        let audioSession = try DiarizationAudioSession(processingRoot: processingRoot)
        do {
            recorder = try DiarizationAudioRecorder(
                inputFormat: inputFormat,
                outputURL: audioSession.audioFileURL
            )
            self.audioSession = audioSession
        } catch {
            do {
                try audioSession.cleanup()
            } catch let cleanupError {
                writeDiagnostic(
                    "Failed to clean incomplete diarization session: \(cleanupError)"
                )
            }
            throw error
        }
    }

    func append(_ buffer: AVAudioPCMBuffer) throws {
        try recorder.append(buffer)
    }

    func finishRecording() throws {
        try recorder.finish()
        recordingFinished = true
    }

    func diarize(
        using diarizer: any OfflineSpeakerDiarizing,
        onProgress: @escaping DiarizationProgressHandler
    ) async throws -> [SpeakerTimeRange] {
        guard recordingFinished else {
            throw OfflineDiarizationSessionError.recordingNotFinished
        }
        return try await diarizer.diarize(
            audioFileURL: audioFileURL,
            onProgress: onProgress
        )
    }

    func cleanup() throws {
        recorder.cancel()
        try audioSession.cleanup()
    }
}
