import AVFoundation
import Foundation

enum DiarizationAudioRecorderError: Error, LocalizedError {
    case finished
    case outputFormatUnavailable

    var errorDescription: String? {
        switch self {
        case .finished:
            return "The diarization audio recorder has already finished."
        case .outputFormatUnavailable:
            return "The 16 kHz mono diarization audio format is unavailable."
        }
    }
}

struct DiarizationAudioSession: Sendable {
    let processingRoot: URL
    let directoryURL: URL
    let audioFileURL: URL

    init(processingRoot: URL = defaultDiarizationProcessingRoot()) throws {
        let fileManager = FileManager.default
        let processingRoot = try prepareDiarizationProcessingRoot(processingRoot)

        let directoryURL = processingRoot.appendingPathComponent(
            UUID().uuidString,
            isDirectory: true
        )
        try fileManager.createDirectory(
            at: directoryURL,
            withIntermediateDirectories: false,
            attributes: [.posixPermissions: 0o700]
        )
        self.processingRoot = processingRoot.standardizedFileURL
        self.directoryURL = directoryURL.standardizedFileURL
        audioFileURL = directoryURL.appendingPathComponent(
            "audio.caf",
            isDirectory: false
        )
    }

    func cleanup() throws {
        let expectedParent = directoryURL.deletingLastPathComponent().standardizedFileURL
        guard expectedParent == processingRoot else {
            throw HelperError.message(
                "Refusing to clean a diarization session outside its processing root."
            )
        }
        if FileManager.default.fileExists(atPath: directoryURL.path) {
            try FileManager.default.removeItem(at: directoryURL)
        }
    }
}

final class DiarizationAudioRecorder: @unchecked Sendable {
    private let converter: AudioBufferConverter
    private var outputFile: AVAudioFile?

    init(inputFormat: AVAudioFormat, outputURL: URL) throws {
        guard let outputFormat = AVAudioFormat(
            commonFormat: .pcmFormatFloat32,
            sampleRate: 16_000,
            channels: 1,
            interleaved: false
        ) else {
            throw DiarizationAudioRecorderError.outputFormatUnavailable
        }
        converter = try AudioBufferConverter(
            inputFormat: inputFormat,
            outputFormat: outputFormat
        )
        outputFile = try AVAudioFile(
            forWriting: outputURL,
            settings: outputFormat.settings,
            commonFormat: .pcmFormatFloat32,
            interleaved: false
        )
        try FileManager.default.setAttributes(
            [.posixPermissions: 0o600],
            ofItemAtPath: outputURL.path
        )
    }

    func append(_ input: AVAudioPCMBuffer) throws {
        guard let outputFile else {
            throw DiarizationAudioRecorderError.finished
        }
        for buffer in try converter.convert(input) {
            try outputFile.write(from: buffer)
        }
    }

    func finish() throws {
        guard let outputFile else {
            throw DiarizationAudioRecorderError.finished
        }
        for buffer in try converter.finish() {
            try outputFile.write(from: buffer)
        }
        self.outputFile = nil
    }

    func cancel() {
        outputFile = nil
    }
}

func defaultDiarizationProcessingRoot() -> URL {
    FileManager.default.temporaryDirectory
        .appendingPathComponent("com.familiar.familiar-desktop", isDirectory: true)
        .appendingPathComponent("diarization", isDirectory: true)
}
