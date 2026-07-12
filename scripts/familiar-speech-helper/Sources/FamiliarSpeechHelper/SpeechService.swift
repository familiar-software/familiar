import Foundation

protocol SpeechRuntime: Sendable {
    func prepare() async throws -> SpeechCapabilityPayload
    func status(runtimeState: String) async -> SpeechStatusPayload
    func startCapture(inputDeviceName: String?) async throws
    func stopCapture() async throws
    func shutdown() async
}

actor SpeechService {
    private enum RuntimeState: String {
        case idle
        case preparing
        case recording
        case stopping
    }

    private let writer: OutputWriter
    private var state = RuntimeState.idle
    private var runtime: (any SpeechRuntime)?

    init(writer: OutputWriter) {
        self.writer = writer
    }

    func statusPayload() async -> SpeechStatusPayload {
        if let runtime {
            return await runtime.status(runtimeState: state.rawValue)
        }
        return SpeechStatusPayload(
            available: false,
            runtimeState: state.rawValue,
            locale: "",
            assetState: "unknown",
            microphonePermission: AudioCaptureEngine.microphonePermission,
            inputDevices: (try? CoreAudioInputDevices.payloads()) ?? []
        )
    }

    func inputDevicesPayload() throws -> InputAudioDevicesPayload {
        InputAudioDevicesPayload(inputDevices: try CoreAudioInputDevices.payloads())
    }

    func prewarmModel() async throws -> SpeechCapabilityPayload {
        guard state == .idle else {
            throw HelperError.message("Speech capture is already active.")
        }

        let startedAt = Date()
        state = .preparing
        writeDiagnostic("prewarm_model requested")
        do {
            let runtime = try makeRuntime()
            var capability = try await runtime.prepare()
            capability = SpeechCapabilityPayload(
                available: capability.available,
                locale: capability.locale,
                assetState: capability.assetState,
                microphonePermission: capability.microphonePermission,
                durationMs: Int(Date().timeIntervalSince(startedAt) * 1000),
                inputDevices: capability.inputDevices
            )
            self.runtime = runtime
            state = .idle
            writeDiagnostic(
                "SpeechTranscriber prepared locale=\(capability.locale) " +
                    "durationMs=\(capability.durationMs)"
            )
            return capability
        } catch {
            state = .idle
            writeDiagnostic("prewarm_model failed: \(error)")
            throw error
        }
    }

    func startCapture(inputDeviceName: String?) async throws {
        guard state == .idle else {
            throw HelperError.message("Speech capture is already active.")
        }

        let runtime = try runtime ?? makeRuntime()
        if self.runtime == nil {
            _ = try await runtime.prepare()
            self.runtime = runtime
        }
        do {
            try await runtime.startCapture(inputDeviceName: inputDeviceName)
            state = .recording
            writeDiagnostic("SpeechTranscriber capture started")
        } catch {
            writeDiagnostic("start_capture failed: \(error)")
            throw error
        }
    }

    func stopCapture() async throws {
        guard state == .recording else {
            return
        }
        state = .stopping
        writeDiagnostic("stop_capture requested")
        do {
            try await runtime?.stopCapture()
            state = .idle
            writeDiagnostic("SpeechTranscriber capture stopped")
        } catch {
            state = .idle
            writeDiagnostic("stop_capture failed: \(error)")
            throw error
        }
    }

    func shutdown() async {
        await runtime?.shutdown()
        runtime = nil
        state = .idle
    }

    private func makeRuntime() throws -> any SpeechRuntime {
        guard #available(macOS 26.0, *) else {
            throw HelperError.message(
                "Meeting transcription requires macOS 26 or newer."
            )
        }
        return AppleSpeechRuntime(writer: writer)
    }
}
