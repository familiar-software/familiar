import AVFoundation
import Foundation

final class AudioBufferConverter: @unchecked Sendable {
    private let converter: AVAudioConverter
    private let outputFormat: AVAudioFormat
    private let outputCapacity: AVAudioFrameCount

    init(inputFormat: AVAudioFormat, outputFormat: AVAudioFormat) throws {
        guard let converter = AVAudioConverter(from: inputFormat, to: outputFormat) else {
            throw HelperError.message("The microphone audio format cannot be converted.")
        }
        self.converter = converter
        self.outputFormat = outputFormat

        let ratio = outputFormat.sampleRate / inputFormat.sampleRate
        outputCapacity = AVAudioFrameCount(ceil(4096 * ratio)) + 64
    }

    func convert(_ input: AVAudioPCMBuffer) throws -> [AVAudioPCMBuffer] {
        let capacityRatio = outputFormat.sampleRate / input.format.sampleRate
        let capacity = AVAudioFrameCount(ceil(Double(input.frameLength) * capacityRatio)) + 64
        let output = try makeOutputBuffer(capacity: max(capacity, outputCapacity))
        var suppliedInput = false
        var conversionError: NSError?
        let status = converter.convert(to: output, error: &conversionError) { _, inputStatus in
            if suppliedInput {
                inputStatus.pointee = .noDataNow
                return nil
            }
            suppliedInput = true
            inputStatus.pointee = .haveData
            return input
        }
        try validate(status: status, error: conversionError)
        return output.frameLength > 0 ? [output] : []
    }

    func finish() throws -> [AVAudioPCMBuffer] {
        var outputs: [AVAudioPCMBuffer] = []
        for _ in 0..<8 {
            let output = try makeOutputBuffer(capacity: outputCapacity)
            var conversionError: NSError?
            let status = converter.convert(to: output, error: &conversionError) {
                _, inputStatus in
                inputStatus.pointee = .endOfStream
                return nil
            }
            try validate(status: status, error: conversionError)
            if output.frameLength > 0 {
                outputs.append(output)
            }
            if status == .endOfStream || output.frameLength == 0 {
                break
            }
        }
        return outputs
    }

    private func makeOutputBuffer(capacity: AVAudioFrameCount) throws -> AVAudioPCMBuffer {
        guard let output = AVAudioPCMBuffer(
            pcmFormat: outputFormat,
            frameCapacity: capacity
        ) else {
            throw HelperError.message("Failed to allocate converted audio buffer.")
        }
        return output
    }

    private func validate(
        status: AVAudioConverterOutputStatus,
        error: NSError?
    ) throws {
        guard status != .error else {
            let details = error?.localizedDescription ?? "unknown conversion error"
            throw HelperError.message("Failed to convert microphone audio: \(details)")
        }
    }
}
