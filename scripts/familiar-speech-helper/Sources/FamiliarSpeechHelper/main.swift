import CoreML
import Foundation
import WhisperKit

private let defaultModel = "tiny"
private let modelRootEnvKey = "FAMILIAR_WHISPERKIT_MODEL_ROOT"
private let sampleRate = 16_000
private let partialIntervalNs: UInt64 = 1_500_000_000

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
        guard state == .idle else {
            throw HelperError.message("Speech capture is already active.")
        }
        guard await AudioProcessor.requestRecordPermission() else {
            throw HelperError.message("Microphone access was not granted.")
        }

        state = .loading
        let pipe = try await loadWhisperKit()
        let inputDeviceID = try resolveInputDeviceID(named: inputDeviceName)
        startedAt = Date()
        lastText = ""

        try pipe.audioProcessor.startRecordingLive(inputDeviceID: inputDeviceID) { _ in }
        state = .recording
        partialTask = Task { await self.runPartialLoop() }
    }

    func stopCapture() async -> [String: Any] {
        guard state == .recording else {
            return [:]
        }

        partialTask?.cancel()
        partialTask = nil
        whisperKit?.audioProcessor.stopRecording()
        let finalPayload = await transcribeCurrentAudio(isFinal: true) ?? [:]
        state = .idle
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

        let samples = Array(pipe.audioProcessor.audioSamples)
        if samples.count < sampleRate {
            return nil
        }

        do {
            let options = DecodingOptions(
                skipSpecialTokens: true,
                withoutTimestamps: true,
                concurrentWorkerCount: 1,
                chunkingStrategy: ChunkingStrategy.none
            )
            let results = try await pipe.transcribe(audioArray: samples, decodeOptions: options)
            guard let result = results.first else {
                return nil
            }

            let text = result.text.trimmingCharacters(in: .whitespacesAndNewlines)
            if text.isEmpty || (!isFinal && text == lastText) {
                return nil
            }

            lastText = text
            return transcriptPayload(text: text, isFinal: isFinal)
        } catch {
            FileHandle.standardError.write(Data("Transcription failed: \(error)\n".utf8))
            return nil
        }
    }

    private func transcriptPayload(text: String, isFinal: Bool) -> [String: Any] {
        let elapsedMs = Int(Date().timeIntervalSince(startedAt) * 1000)
        return [
            "text": text,
            "isFinal": isFinal,
            "startedAtMs": 0,
            "endedAtMs": elapsedMs
        ]
    }

    private func loadWhisperKit() async throws -> WhisperKit {
        if let whisperKit {
            return whisperKit
        }

        let model = ProcessInfo.processInfo.environment["FAMILIAR_WHISPERKIT_MODEL"] ??
            defaultModel
        let modelRoot = resolveModelRoot()
        let localModelFolder = resolveLocalModelFolder(modelRoot: modelRoot, model: model)
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

@main
struct FamiliarSpeechHelper {
    static func main() async {
        let writer = OutputWriter()
        let service = SpeechService(writer: writer)
        let decoder = JSONDecoder()

        while let line = readLine() {
            guard let data = line.data(using: .utf8) else {
                continue
            }

            do {
                let request = try decoder.decode(HelperRequest.self, from: data)
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
