import CoreML
import Darwin
import Dispatch
import Foundation
import WhisperKit

private let defaultModel = "tiny"
private let modelRootEnvKey = "FAMILIAR_WHISPERKIT_MODEL_ROOT"
let sampleRate = 16_000
private let partialIntervalNs: UInt64 = 1_500_000_000
private let audioStartProbeIntervalNs: UInt64 = 100_000_000
private let audioStartTimeoutNs: UInt64 = 5_000_000_000

private func writeDiagnostic(_ message: String) {
    FileHandle.standardError.write(Data("[familiar-speech-helper] \(message)\n".utf8))
}

private struct HelperRequest: Decodable {
    let id: String
    let command: String
    let inputDeviceName: String?
}

actor OutputWriter {
    func response(id: String, ok: Bool, payload: [String: Any]? = nil, error: String? = nil) {
        var object: [String: Any] = [
            "type": "response",
            "id": id,
            "ok": ok
        ]
        if let payload {
            object["payload"] = payload
        }
        if let error {
            object["error"] = error
        }
        write(object)
    }

    func event(_ event: String, payload: [String: Any]) {
        write([
            "type": "event",
            "event": event,
            "payload": payload
        ])
    }

    private func write(_ object: [String: Any]) {
        do {
            let data = try JSONSerialization.data(withJSONObject: object)
            FileHandle.standardOutput.write(data)
            FileHandle.standardOutput.write(Data("\n".utf8))
        } catch {
            FileHandle.standardError.write(Data("Failed to write helper JSON: \(error)\n".utf8))
        }
    }
}

actor SpeechService {
    private enum RuntimeState: String {
        case idle
        case loading
        case recording
    }

    private let writer: OutputWriter
    private var state = RuntimeState.idle
    private var whisperKit: WhisperKit?
    private var partialTask: Task<Void, Never>?
    private var startedAt = Date()
    private var lastText = ""

    init(writer: OutputWriter) {
        self.writer = writer
    }

    func statusPayload() -> [String: Any] {
        [
            "installProgress": 100,
            "installState": "installed",
            "runtimeState": state.rawValue,
            "inputDevices": inputDevicePayloads()
        ]
    }

    func installAssets() async throws -> [String: Any] {
        _ = try await loadWhisperKit()
        return statusPayload()
    }

    func startCapture(inputDeviceName: String?) async throws {
        writeDiagnostic("start_capture requested")
        guard state == .idle else {
            throw HelperError.message("Speech capture is already active.")
        }
        writeDiagnostic("requesting microphone permission")
        guard await AudioProcessor.requestRecordPermission() else {
            throw HelperError.message("Microphone access was not granted.")
        }
        writeDiagnostic("microphone permission granted")

        do {
            state = .loading
            writeDiagnostic("loading WhisperKit")
            let pipe = try await loadWhisperKit()
            writeDiagnostic("resolving input device")
            let inputDeviceID = try resolveInputDeviceID(named: inputDeviceName)
            startedAt = Date()
            lastText = ""

            writeDiagnostic("starting audio processor")
            let initialSampleCount = pipe.audioProcessor.audioSamples.count
            try pipe.audioProcessor.startRecordingLive(inputDeviceID: inputDeviceID) { _ in }
            writeDiagnostic("waiting for audio samples")
            let sampleCount = try await waitForAudioSamples(
                from: pipe.audioProcessor,
                previousSampleCount: initialSampleCount
            )
            state = .recording
            writeDiagnostic("audio processor started samples=\(sampleCount)")
            partialTask = Task { await self.runPartialLoop() }
        } catch {
            writeDiagnostic("start_capture failed: \(error)")
            partialTask?.cancel()
            partialTask = nil
            whisperKit?.audioProcessor.stopRecording()
            state = .idle
            throw error
        }
    }

    private func waitForAudioSamples(
        from audioProcessor: any AudioProcessing,
        previousSampleCount: Int
    ) async throws -> Int {
        let deadline = DispatchTime.now().uptimeNanoseconds + audioStartTimeoutNs
        while DispatchTime.now().uptimeNanoseconds < deadline {
            let sampleCount = audioProcessor.audioSamples.count
            if sampleCount > 0 && sampleCount != previousSampleCount {
                return sampleCount
            }
            try await Task.sleep(nanoseconds: audioStartProbeIntervalNs)
        }

        throw HelperError.message(
            "Audio capture did not start: no microphone samples were received."
        )
    }

    func stopCapture() async -> [String: Any] {
        writeDiagnostic("stop_capture requested state=\(state.rawValue)")
        guard state == .recording else {
            return [:]
        }

        partialTask?.cancel()
        partialTask = nil
        whisperKit?.audioProcessor.stopRecording()
        state = .idle
        let finalPayload = await transcribeCurrentAudio(isFinal: true) ?? [:]
        return finalPayload
    }

    func shutdown() async {
        _ = await stopCapture()
    }

    private func runPartialLoop() async {
        while !Task.isCancelled {
            do {
                try await Task.sleep(nanoseconds: partialIntervalNs)
                if let payload = await transcribeCurrentAudio(isFinal: false) {
                    await writer.event("transcription", payload: payload)
                }
            } catch {
                return
            }
        }
    }

    private func transcribeCurrentAudio(isFinal: Bool) async -> [String: Any]? {
        guard let pipe = whisperKit else {
            return nil
        }

        let selected = selectTranscriptionSamples(
            pipe.audioProcessor.audioSamples,
            isFinal: isFinal
        )
        if selected.samples.count < sampleRate {
            return nil
        }

        do {
            let options = DecodingOptions(
                detectLanguage: true,
                skipSpecialTokens: true,
                withoutTimestamps: false,
                wordTimestamps: true,
                concurrentWorkerCount: 1,
                chunkingStrategy: ChunkingStrategy.none
            )
            let results = try await pipe.transcribe(
                audioArray: selected.samples,
                decodeOptions: options
            )
            guard let result = results.first else {
                return nil
            }

            let text = result.text.trimmingCharacters(in: .whitespacesAndNewlines)
            if text.isEmpty || (!isFinal && text == lastText) {
                return nil
            }

            lastText = text
            return transcriptPayload(
                result: result,
                text: text,
                isFinal: isFinal,
                audioSampleOffsetMs: selected.audioSampleOffsetMs
            )
        } catch {
            FileHandle.standardError.write(Data("Transcription failed: \(error)\n".utf8))
            return nil
        }
    }

    private func transcriptPayload(
        result: TranscriptionResult,
        text: String,
        isFinal: Bool,
        audioSampleOffsetMs: Int
    ) -> [String: Any] {
        let elapsedMs = Int(Date().timeIntervalSince(startedAt) * 1000)
        let segmentPayloads = transcriptSegmentPayloads(
            from: result,
            audioSampleOffsetMs: audioSampleOffsetMs
        )
        let startedAtMs = segmentPayloads.first?["startedAtMs"] as? Int ?? 0
        let endedAtMs = segmentPayloads.last?["endedAtMs"] as? Int ?? elapsedMs
        return [
            "text": text,
            "isFinal": isFinal,
            "startedAtMs": startedAtMs,
            "endedAtMs": endedAtMs,
            "segments": segmentPayloads
        ]
    }

    private func transcriptSegmentPayloads(
        from result: TranscriptionResult,
        audioSampleOffsetMs: Int
    ) -> [[String: Any]] {
        var payloads: [[String: Any]] = []
        for segment in result.segments {
            let text = segment.text.trimmingCharacters(in: .whitespacesAndNewlines)
            if text.isEmpty {
                continue
            }
            payloads.append([
                "text": text,
                "startedAtMs": Int(segment.start * 1000) + audioSampleOffsetMs,
                "endedAtMs": Int(segment.end * 1000) + audioSampleOffsetMs,
                "words": wordPayloads(
                    from: segment.words,
                    audioSampleOffsetMs: audioSampleOffsetMs
                )
            ])
        }
        return payloads
    }

    private func wordPayloads(
        from words: [WordTiming]?,
        audioSampleOffsetMs: Int
    ) -> [[String: Any]] {
        guard let words else {
            return []
        }
        var payloads: [[String: Any]] = []
        for word in words {
            let text = word.word.trimmingCharacters(in: .whitespacesAndNewlines)
            if text.isEmpty {
                continue
            }
            payloads.append([
                "text": text,
                "startedAtMs": Int(word.start * 1000) + audioSampleOffsetMs,
                "endedAtMs": Int(word.end * 1000) + audioSampleOffsetMs
            ])
        }
        return payloads
    }

    private func loadWhisperKit() async throws -> WhisperKit {
        if let whisperKit {
            return whisperKit
        }

        let model = ProcessInfo.processInfo.environment["FAMILIAR_WHISPERKIT_MODEL"] ??
            defaultModel
        let modelRoot = resolveModelRoot()
        let localModelFolder = resolveLocalModelFolder(modelRoot: modelRoot, model: model)
        writeDiagnostic("resolved model root \(modelRoot.path)")
        try FileManager.default.createDirectory(
            at: modelRoot,
            withIntermediateDirectories: true
        )

        let computeOptions = ModelComputeOptions(
            audioEncoderCompute: .cpuAndNeuralEngine,
            textDecoderCompute: .cpuAndNeuralEngine
        )
        let config = WhisperKitConfig(
            model: model.contains("*") ? model : "openai*\(model)",
            downloadBase: modelRoot,
            modelFolder: localModelFolder?.path,
            tokenizerFolder: modelRoot,
            computeOptions: computeOptions,
            verbose: false,
            logLevel: .error,
            prewarm: false,
            load: true,
            useBackgroundDownloadSession: false
        )
        let loaded = try await WhisperKit(config)
        writeDiagnostic("WhisperKit loaded")
        whisperKit = loaded
        return loaded
    }

    private func resolveModelRoot() -> URL {
        let configuredPath = ProcessInfo.processInfo.environment[modelRootEnvKey]?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        if let configuredPath, !configuredPath.isEmpty {
            return URL(fileURLWithPath: configuredPath, isDirectory: true)
        }
        return FileManager.default.homeDirectoryForCurrentUser
            .appending(path: ".familiar/models/speech/whisperkit/models")
    }

    private func resolveLocalModelFolder(modelRoot: URL, model: String) -> URL? {
        let variantName = localModelVariantName(for: model)
        let modelFolder = modelRoot
            .appending(path: "models/argmaxinc/whisperkit-coreml")
            .appending(path: variantName)
        let encoderModel = modelFolder.appending(path: "AudioEncoder.mlmodelc")
        if FileManager.default.fileExists(atPath: encoderModel.path) {
            return modelFolder
        }
        return nil
    }

    private func localModelVariantName(for model: String) -> String {
        let trimmed = model.trimmingCharacters(in: .whitespacesAndNewlines)
        let modelName = trimmed.split(separator: "*").last.map(String.init) ?? trimmed
        if modelName.hasPrefix("openai_whisper-") {
            return modelName
        }
        if modelName.hasPrefix("whisper-") {
            return "openai_\(modelName)"
        }
        return "openai_whisper-\(modelName)"
    }

    private func inputDevicePayloads() -> [[String: Any]] {
        AudioProcessor.getAudioDevices().map { device in
            [
                "id": device.id,
                "name": device.name
            ]
        }
    }

    private func resolveInputDeviceID(named inputDeviceName: String?) throws -> DeviceID? {
        guard let inputDeviceName else {
            return nil
        }
        if inputDeviceName.trimmingCharacters(in: .whitespaces).isEmpty {
            return nil
        }

        let devices = AudioProcessor.getAudioDevices()
        if let exact = devices.first(where: { $0.name == inputDeviceName }) {
            return exact.id
        }
        if let partial = devices.first(where: {
            $0.name.localizedCaseInsensitiveContains(inputDeviceName)
        }) {
            return partial.id
        }

        throw HelperError.message("Input audio device not found: \(inputDeviceName)")
    }
}

enum HelperError: Error, CustomStringConvertible {
    case message(String)

    var description: String {
        switch self {
        case .message(let message):
            return message
        }
    }
}

struct FamiliarSpeechHelper {
    static func main() async {
        writeDiagnostic("helper started pid=\(getpid())")
        let writer = OutputWriter()
        let service = SpeechService(writer: writer)
        let decoder = JSONDecoder()
        let signalHandlers = TerminationSignalHandlers(service: service)
        defer {
            signalHandlers.cancel()
        }

        while let line = readLine() {
            guard let data = line.data(using: .utf8) else {
                continue
            }

            do {
                let request = try decoder.decode(HelperRequest.self, from: data)
                writeDiagnostic("received command=\(request.command) id=\(request.id)")
                await handle(request: request, service: service, writer: writer)
            } catch {
                FileHandle.standardError.write(Data("Invalid helper request: \(error)\n".utf8))
            }
        }

        await service.shutdown()
    }

    private static func handle(
        request: HelperRequest,
        service: SpeechService,
        writer: OutputWriter
    ) async {
        do {
            switch request.command {
            case "get_status":
                let payload = await service.statusPayload()
                await writer.response(id: request.id, ok: true, payload: payload)
            case "list_input_devices":
                let payload = ["inputDevices": await service.statusPayload()["inputDevices"] ?? []]
                await writer.response(id: request.id, ok: true, payload: payload)
            case "install_assets":
                let payload = try await service.installAssets()
                await writer.response(id: request.id, ok: true, payload: payload)
            case "start_capture":
                try await service.startCapture(inputDeviceName: request.inputDeviceName)
                await writer.response(id: request.id, ok: true, payload: [:])
            case "stop_capture":
                let payload = await service.stopCapture()
                await writer.response(id: request.id, ok: true, payload: payload)
            default:
                throw HelperError.message("Unsupported speech helper command: \(request.command)")
            }
        } catch {
            await writer.response(id: request.id, ok: false, error: String(describing: error))
        }
    }
}

await FamiliarSpeechHelper.main()
