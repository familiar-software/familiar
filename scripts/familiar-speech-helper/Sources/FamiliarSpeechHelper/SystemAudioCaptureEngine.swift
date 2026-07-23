import AVFoundation
import CoreGraphics
import CoreMedia
import Foundation
import ScreenCaptureKit

private let systemAudioSampleRate = 48_000
private let systemAudioChannelCount = 1

func makeSystemAudioStreamConfiguration() -> SCStreamConfiguration {
    let configuration = SCStreamConfiguration()
    configuration.width = 2
    configuration.height = 2
    configuration.minimumFrameInterval = CMTime(value: 1, timescale: 1)
    configuration.showsCursor = false
    configuration.capturesAudio = true
    configuration.sampleRate = systemAudioSampleRate
    configuration.channelCount = systemAudioChannelCount
    configuration.excludesCurrentProcessAudio = true
    if #available(macOS 15.0, *) {
        configuration.captureMicrophone = false
    }
    return configuration
}

func systemAudioCaptureFormat() throws -> AVAudioFormat {
    guard let format = AVAudioFormat(
        standardFormatWithSampleRate: Double(systemAudioSampleRate),
        channels: AVAudioChannelCount(systemAudioChannelCount)
    ) else {
        throw HelperError.message("Failed to create the system-audio capture format.")
    }
    return format
}

final class SystemAudioBufferNormalizer: @unchecked Sendable {
    private let outputFormat: AVAudioFormat
    private var inputFormat: AVAudioFormat?
    private var converter: AudioBufferConverter?
    private var lastHostTime: CMTime?

    init(outputFormat: AVAudioFormat) {
        self.outputFormat = outputFormat
    }

    func convert(_ captured: CapturedAudioBuffer) throws -> [CapturedAudioBuffer] {
        try validateInputFormat(captured.buffer.format)
        lastHostTime = captured.hostTime
        if captured.buffer.format == outputFormat {
            return [captured]
        }
        let converter = try resolveConverter(for: captured.buffer.format)
        return try converter.convert(captured.buffer).map { buffer in
            CapturedAudioBuffer(buffer: buffer, hostTime: captured.hostTime)
        }
    }

    func finish() throws -> [CapturedAudioBuffer] {
        guard let converter, let lastHostTime else {
            return []
        }
        return try converter.finish().map { buffer in
            CapturedAudioBuffer(buffer: buffer, hostTime: lastHostTime)
        }
    }

    private func resolveConverter(for format: AVAudioFormat) throws -> AudioBufferConverter {
        if let converter {
            return converter
        }
        let converter = try AudioBufferConverter(
            inputFormat: format,
            outputFormat: outputFormat
        )
        self.converter = converter
        return converter
    }

    private func validateInputFormat(_ format: AVAudioFormat) throws {
        if let inputFormat, inputFormat != format {
            throw HelperError.message(
                "System-audio format changed while capture was active."
            )
        }
        if inputFormat == nil {
            inputFormat = format
        }
    }
}

final class SystemAudioCaptureEngine: NSObject, @unchecked Sendable {
    private let outputQueue = DispatchQueue(
        label: "app.familiar.speech-helper.system-audio"
    )
    private var stream: SCStream?
    private var continuation: AsyncThrowingStream<
        CapturedAudioBuffer,
        Error
    >.Continuation?
    private var normalizer: SystemAudioBufferNormalizer?

    static var screenRecordingPermissionGranted: Bool {
        CGPreflightScreenCaptureAccess()
    }

    static func unavailableReason() async -> String? {
        guard screenRecordingPermissionGranted else {
            return "Screen Recording access is required for automatic voice capture."
        }
        do {
            let content = try await SCShareableContent.excludingDesktopWindows(
                false,
                onScreenWindowsOnly: true
            )
            return content.displays.isEmpty
                ? "No display is available for system-audio capture."
                : nil
        } catch {
            return "System-audio capture is unavailable: \(error)"
        }
    }

    func start() async throws -> AudioCaptureStream {
        guard stream == nil else {
            throw HelperError.message("System-audio capture is already active.")
        }
        guard Self.screenRecordingPermissionGranted else {
            throw HelperError.message(
                "Screen Recording access is required for automatic voice capture."
            )
        }

        let content = try await SCShareableContent.excludingDesktopWindows(
            false,
            onScreenWindowsOnly: true
        )
        guard let display = content.displays.first else {
            throw HelperError.message("No display is available for system-audio capture.")
        }
        let excludedApplications = content.applications.filter { application in
            application.processID == ProcessInfo.processInfo.processIdentifier
        }
        let filter = SCContentFilter(
            display: display,
            excludingApplications: excludedApplications,
            exceptingWindows: []
        )
        let stream = SCStream(
            filter: filter,
            configuration: makeSystemAudioStreamConfiguration(),
            delegate: self
        )
        let captureFormat = try systemAudioCaptureFormat()
        let (buffers, continuation) = AsyncThrowingStream.makeStream(
            of: CapturedAudioBuffer.self,
            throwing: Error.self,
            bufferingPolicy: .bufferingNewest(16)
        )

        do {
            try stream.addStreamOutput(
                self,
                type: .audio,
                sampleHandlerQueue: outputQueue
            )
            self.stream = stream
            self.continuation = continuation
            normalizer = SystemAudioBufferNormalizer(outputFormat: captureFormat)
            try await stream.startCapture()
        } catch {
            continuation.finish(throwing: error)
            self.stream = nil
            self.continuation = nil
            normalizer = nil
            throw HelperError.message("Failed to start system-audio capture: \(error)")
        }

        return AudioCaptureStream(
            buffers: buffers,
            format: captureFormat
        )
    }

    func stop() async throws {
        guard let stream else {
            return
        }
        var firstError: Error?
        do {
            try await stream.stopCapture()
        } catch {
            firstError = error
        }
        do {
            try stream.removeStreamOutput(self, type: .audio)
        } catch {
            firstError = firstError ?? error
        }
        do {
            let trailingBuffers = try outputQueue.sync {
                try normalizer?.finish() ?? []
            }
            try yield(trailingBuffers)
        } catch {
            firstError = firstError ?? error
        }
        continuation?.finish()
        continuation = nil
        normalizer = nil
        self.stream = nil
        if let firstError {
            throw HelperError.message("Failed to stop system-audio capture: \(firstError)")
        }
    }

    private func capturedBuffer(
        from sampleBuffer: CMSampleBuffer,
        stream: SCStream
    ) throws -> CapturedAudioBuffer {
        guard sampleBuffer.isValid, CMSampleBufferDataIsReady(sampleBuffer) else {
            throw HelperError.message("ScreenCaptureKit returned invalid system audio.")
        }
        guard let formatDescription = CMSampleBufferGetFormatDescription(sampleBuffer) else {
            throw HelperError.message("System audio has no format description.")
        }
        let format = AVAudioFormat(cmAudioFormatDescription: formatDescription)
        let frameCount = CMSampleBufferGetNumSamples(sampleBuffer)
        guard frameCount > 0,
              let buffer = AVAudioPCMBuffer(
                  pcmFormat: format,
                  frameCapacity: AVAudioFrameCount(frameCount)
              ) else {
            throw HelperError.message("Failed to allocate a system-audio buffer.")
        }
        buffer.frameLength = AVAudioFrameCount(frameCount)
        let copyStatus = CMSampleBufferCopyPCMDataIntoAudioBufferList(
            sampleBuffer,
            at: 0,
            frameCount: Int32(frameCount),
            into: buffer.mutableAudioBufferList
        )
        guard copyStatus == noErr else {
            throw HelperError.message(
                "Failed to copy system audio (CoreMedia status \(copyStatus))."
            )
        }
        guard let synchronizationClock = stream.synchronizationClock else {
            throw HelperError.message("System audio has no synchronization clock.")
        }
        let hostTime = CMSyncConvertTime(
            CMSampleBufferGetPresentationTimeStamp(sampleBuffer),
            from: synchronizationClock,
            to: CMClockGetHostTimeClock()
        )
        guard hostTime.isNumeric else {
            throw HelperError.message("System audio has an invalid presentation timestamp.")
        }
        return CapturedAudioBuffer(buffer: buffer, hostTime: hostTime)
    }

    private func yield(_ buffers: [CapturedAudioBuffer]) throws {
        for buffer in buffers {
            if case .dropped = continuation?.yield(buffer) {
                throw HelperError.message(
                    "Audio processing could not keep up with system audio."
                )
            }
        }
    }
}

extension SystemAudioCaptureEngine: SCStreamOutput {
    func stream(
        _ stream: SCStream,
        didOutputSampleBuffer sampleBuffer: CMSampleBuffer,
        of type: SCStreamOutputType
    ) {
        guard type == .audio else {
            return
        }
        do {
            let captured = try capturedBuffer(from: sampleBuffer, stream: stream)
            let buffers = try normalizer?.convert(captured) ?? []
            try yield(buffers)
        } catch {
            continuation?.finish(throwing: error)
        }
    }
}

extension SystemAudioCaptureEngine: SCStreamDelegate {
    func stream(_ stream: SCStream, didStopWithError error: Error) {
        continuation?.finish(throwing: error)
    }
}
