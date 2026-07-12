import AVFoundation
import Foundation
import Speech

@available(macOS 26.0, *)
actor AppleSpeechRuntime: SpeechRuntime {
    private let writer: OutputWriter
    private var capability: SpeechCapabilityPayload?
    private var transcriber: SpeechTranscriber?
    private var analyzer: SpeechAnalyzer?
    private var analyzerInput: AsyncThrowingStream<AnalyzerInput, Error>.Continuation?
    private var captureEngine: AudioCaptureEngine?
    private var feedTask: Task<Void, Error>?
    private var resultsTask: Task<Void, Error>?
    private var isRecording = false

    init(writer: OutputWriter) {
        self.writer = writer
    }

    func prepare() async throws -> SpeechCapabilityPayload {
        if let capability, analyzer != nil {
            return capability
        }
        guard SpeechTranscriber.isAvailable else {
            throw HelperError.message(
                "SpeechTranscriber is unavailable on this Mac."
            )
        }

        let permission = AudioCaptureEngine.microphonePermission
        guard permission != "denied", permission != "unknown" else {
            throw HelperError.message(
                "Microphone access is denied. Enable it in System Settings."
            )
        }

        let requestedLocale = Locale.current
        let supportedLocales = await SpeechTranscriber.supportedLocales
        let equivalent = await SpeechTranscriber.supportedLocale(
            equivalentTo: requestedLocale
        )
        guard let locale = resolveSupportedLocale(
            requested: requestedLocale,
            equivalent: equivalent,
            supported: supportedLocales
        ) else {
            throw HelperError.message(
                "SpeechTranscriber does not support the current locale: " +
                    "\(requestedLocale.identifier)."
            )
        }

        let transcriber = SpeechTranscriber(
            locale: locale,
            transcriptionOptions: [],
            reportingOptions: [.volatileResults],
            attributeOptions: [.audioTimeRange]
        )
        let modules: [any SpeechModule] = [transcriber]
        try await ensureInstalled(modules: modules)
        guard let audioFormat = await SpeechAnalyzer.bestAvailableAudioFormat(
            compatibleWith: modules
        ) else {
            throw HelperError.message(
                "SpeechTranscriber has no compatible audio format on this Mac."
            )
        }

        let analyzer = SpeechAnalyzer(modules: modules)
        try await analyzer.prepareToAnalyze(in: audioFormat)
        let inputDevices = try CoreAudioInputDevices.payloads()
        guard !inputDevices.isEmpty else {
            throw HelperError.message("No audio input devices are available.")
        }

        let capability = SpeechCapabilityPayload(
            available: true,
            locale: locale.identifier,
            assetState: "installed",
            microphonePermission: permission,
            durationMs: 0,
            inputDevices: inputDevices
        )
        self.capability = capability
        self.transcriber = transcriber
        self.analyzer = analyzer
        return capability
    }

    func status(runtimeState: String) -> SpeechStatusPayload {
        SpeechStatusPayload(
            available: capability?.available == true,
            runtimeState: runtimeState,
            locale: capability?.locale ?? "",
            assetState: capability?.assetState ?? "unknown",
            microphonePermission: AudioCaptureEngine.microphonePermission,
            inputDevices: (try? CoreAudioInputDevices.payloads()) ?? []
        )
    }

    func startCapture(inputDeviceName: String?) async throws {
        guard !isRecording else {
            throw HelperError.message("Speech capture is already active.")
        }
        if analyzer == nil || transcriber == nil {
            _ = try await prepare()
        }
        guard await AudioCaptureEngine.requestMicrophonePermission() else {
            throw HelperError.message("Microphone access was not granted.")
        }
        guard let analyzer, let transcriber else {
            throw HelperError.message("SpeechTranscriber preparation did not complete.")
        }
        guard let analyzerFormat = await SpeechAnalyzer.bestAvailableAudioFormat(
            compatibleWith: [transcriber]
        ) else {
            throw HelperError.message("SpeechTranscriber audio format is unavailable.")
        }

        let inputDeviceID = try CoreAudioInputDevices.resolveID(named: inputDeviceName)
        let captureEngine = AudioCaptureEngine()
        let capture = try captureEngine.start(inputDeviceID: inputDeviceID)
        let converter = try AudioBufferConverter(
            inputFormat: capture.format,
            outputFormat: analyzerFormat
        )
        let (inputSequence, inputBuilder) = AsyncThrowingStream.makeStream(
            of: AnalyzerInput.self,
            throwing: Error.self,
            bufferingPolicy: .bufferingNewest(8)
        )

        let writer = writer
        resultsTask = Task {
            for try await result in transcriber.results {
                if let payload = makeTranscriptPayload(from: result) {
                    await writer.event("transcription", payload: payload)
                }
            }
        }
        feedTask = Task {
            do {
                for try await captured in capture.buffers {
                    for buffer in try converter.convert(captured.buffer) {
                        try Self.yield(buffer, to: inputBuilder)
                    }
                }
                for buffer in try converter.finish() {
                    try Self.yield(buffer, to: inputBuilder)
                }
                inputBuilder.finish()
            } catch {
                inputBuilder.finish(throwing: error)
                throw error
            }
        }

        do {
            try await analyzer.start(inputSequence: inputSequence)
        } catch {
            captureEngine.stop()
            inputBuilder.finish(throwing: error)
            feedTask?.cancel()
            resultsTask?.cancel()
            throw error
        }

        self.analyzerInput = inputBuilder
        self.captureEngine = captureEngine
        isRecording = true
    }

    func stopCapture() async throws {
        guard isRecording else {
            return
        }
        isRecording = false
        captureEngine?.stop()

        var firstError: Error?
        do {
            try await feedTask?.value
        } catch {
            firstError = error
        }
        analyzerInput?.finish()
        if let analyzer {
            do {
                try await analyzer.finalizeAndFinishThroughEndOfInput()
            } catch {
                firstError = firstError ?? error
            }
        }
        do {
            try await resultsTask?.value
        } catch {
            firstError = firstError ?? error
        }

        clearSession()
        if let firstError {
            throw firstError
        }
    }

    func shutdown() async {
        if isRecording {
            try? await stopCapture()
            return
        }
        if let analyzer {
            await analyzer.cancelAndFinishNow()
        }
        clearSession()
    }

    private func ensureInstalled(modules: [any SpeechModule]) async throws {
        let initialStatus = await AssetInventory.status(forModules: modules)
        switch initialStatus {
        case .installed:
            return
        case .unsupported:
            throw HelperError.message(
                "The Apple speech model is unsupported for this locale."
            )
        case .supported, .downloading:
            guard let request = try await AssetInventory.assetInstallationRequest(
                supporting: modules
            ) else {
                throw HelperError.message(
                    "The Apple speech model is not installed and cannot be downloaded."
                )
            }
            writeDiagnostic("Downloading Apple SpeechTranscriber model")
            try await request.downloadAndInstall()
        @unknown default:
            throw HelperError.message("The Apple speech model has an unknown status.")
        }

        let finalStatus = await AssetInventory.status(forModules: modules)
        guard finalStatus == .installed else {
            throw HelperError.message(
                "The Apple speech model did not finish installing."
            )
        }
    }

    private static func yield(
        _ buffer: AVAudioPCMBuffer,
        to continuation: AsyncThrowingStream<AnalyzerInput, Error>.Continuation
    ) throws {
        let result = continuation.yield(AnalyzerInput(buffer: buffer))
        if case .dropped = result {
            throw HelperError.message(
                "Audio processing could not keep up with SpeechTranscriber."
            )
        }
    }

    private func clearSession() {
        analyzerInput = nil
        captureEngine = nil
        feedTask = nil
        resultsTask = nil
        transcriber = nil
        analyzer = nil
    }
}
