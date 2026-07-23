import AVFoundation
import CoreMedia
import Foundation
import Speech

@available(macOS 26.0, *)
actor AppleSpeechRuntime: SpeechRuntime {
    private let writer: OutputWriter
    private let diarizer: any OfflineSpeakerDiarizing
    private var capability: SpeechCapabilityPayload?
    private var locale: Locale?
    private var preparedMicrophoneSession: AppleSpeechSourceSession?
    private var microphoneCaptureEngine: AudioCaptureEngine?
    private var systemAudioCaptureEngine: SystemAudioCaptureEngine?
    private var microphoneSpeechSession: AppleSpeechSourceSession?
    private var systemAudioSpeechSession: AppleSpeechSourceSession?
    private var microphoneDiarizationSession: OfflineDiarizationSession?
    private var systemAudioDiarizationSession: OfflineDiarizationSession?
    private var isRecording = false

    init(writer: OutputWriter, diarizer: any OfflineSpeakerDiarizing) {
        self.writer = writer
        self.diarizer = diarizer
    }

    func prepare() async throws -> SpeechCapabilityPayload {
        if let capability, locale != nil {
            return capability
        }
        guard SpeechTranscriber.isAvailable else {
            throw HelperError.message("SpeechTranscriber is unavailable on this Mac.")
        }

        let permission = AudioCaptureEngine.microphonePermission
        guard permission != "denied", permission != "unknown" else {
            throw HelperError.message(
                "Microphone access is denied. Enable it in System Settings."
            )
        }
        if let reason = await SystemAudioCaptureEngine.unavailableReason() {
            throw HelperError.message(reason)
        }

        let locale = try await resolveLocale()
        let assetTranscriber = SpeechTranscriber(
            locale: locale,
            transcriptionOptions: [],
            reportingOptions: [.volatileResults],
            attributeOptions: [.audioTimeRange]
        )
        try await ensureInstalled(modules: [assetTranscriber])
        let inputDevices = try CoreAudioInputDevices.payloads()
        guard !inputDevices.isEmpty else {
            throw HelperError.message("No audio input devices are available.")
        }
        let removedStaleSessions = try removeStaleDiarizationSessions()
        if removedStaleSessions > 0 {
            writeDiagnostic(
                "Removed \(removedStaleSessions) stale diarization audio session(s)"
            )
        }
        try await diarizer.prepare()
        let preparedSession = try await AppleSpeechSourceSession.prepare(
            locale: locale,
            writer: writer,
            liveSpeakerLabel: "Microphone"
        )
        let capability = SpeechCapabilityPayload(
            available: true,
            locale: locale.identifier,
            assetState: "installed",
            microphonePermission: permission,
            durationMs: 0,
            inputDevices: inputDevices
        )
        self.capability = capability
        self.locale = locale
        preparedMicrophoneSession = preparedSession
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
        if capability == nil || locale == nil {
            _ = try await prepare()
        }
        guard await AudioCaptureEngine.requestMicrophonePermission() else {
            throw HelperError.message("Microphone access was not granted.")
        }
        if let reason = await SystemAudioCaptureEngine.unavailableReason() {
            throw HelperError.message(reason)
        }

        try await startAutomaticCapture(inputDeviceName: inputDeviceName)
        isRecording = true
    }

    func stopCapture() async throws {
        guard isRecording else {
            return
        }
        isRecording = false
        var firstError: Error?

        microphoneCaptureEngine?.stop()
        if let systemAudioCaptureEngine {
            do {
                try await systemAudioCaptureEngine.stop()
            } catch {
                firstError = error
            }
        }

        await finishAutomaticCapture(firstError: &firstError)
        cleanupDiarizationSessions(firstError: &firstError)
        clearActiveSession()
        if let firstError {
            throw firstError
        }
    }

    func shutdown() async {
        if isRecording {
            do {
                try await stopCapture()
            } catch {
                writeDiagnostic("Speech capture shutdown failed: \(error)")
            }
            return
        }
        await preparedMicrophoneSession?.cancel()
        preparedMicrophoneSession = nil
        cleanupDiarizationSessions()
        clearActiveSession()
    }

    private func startAutomaticCapture(inputDeviceName: String?) async throws {
        guard let locale else {
            throw HelperError.message("SpeechTranscriber preparation did not complete.")
        }
        let microphoneSession: AppleSpeechSourceSession
        if let preparedMicrophoneSession {
            microphoneSession = preparedMicrophoneSession
            self.preparedMicrophoneSession = nil
        } else {
            microphoneSession = try await AppleSpeechSourceSession.prepare(
                locale: locale,
                writer: writer,
                liveSpeakerLabel: "Microphone"
            )
        }
        let systemSession = try await AppleSpeechSourceSession.prepare(
            locale: locale,
            writer: writer,
            liveSpeakerLabel: "Mac audio"
        )
        let sessionOrigin = CMClockGetTime(CMClockGetHostTimeClock())
        let inputDeviceID = try CoreAudioInputDevices.resolveID(named: inputDeviceName)
        let microphoneEngine = AudioCaptureEngine()
        let systemEngine = SystemAudioCaptureEngine()
        var microphoneRecording: OfflineDiarizationSession?
        var systemRecording: OfflineDiarizationSession?

        do {
            let microphoneCapture = try microphoneEngine.start(inputDeviceID: inputDeviceID)
            let microphoneDiarization = try OfflineDiarizationSession(
                inputFormat: microphoneCapture.format
            )
            microphoneRecording = microphoneDiarization
            try await microphoneSession.start(
                capture: microphoneCapture,
                sessionOrigin: sessionOrigin,
                onCapturedBuffer: { buffer in
                    try microphoneDiarization.append(buffer)
                }
            )

            let systemCapture = try await systemEngine.start()
            let systemDiarization = try OfflineDiarizationSession(
                inputFormat: systemCapture.format
            )
            systemRecording = systemDiarization
            try await systemSession.start(
                capture: systemCapture,
                sessionOrigin: sessionOrigin,
                onCapturedBuffer: { buffer in
                    try systemDiarization.append(buffer)
                }
            )

            microphoneCaptureEngine = microphoneEngine
            systemAudioCaptureEngine = systemEngine
            microphoneSpeechSession = microphoneSession
            systemAudioSpeechSession = systemSession
            microphoneDiarizationSession = microphoneDiarization
            systemAudioDiarizationSession = systemDiarization
        } catch {
            microphoneEngine.stop()
            do {
                try await systemEngine.stop()
            } catch let stopError {
                writeDiagnostic("System-audio startup cleanup failed: \(stopError)")
            }
            await microphoneSession.cancel()
            await systemSession.cancel()
            cleanup(microphoneRecording, context: "automatic microphone startup")
            cleanup(systemRecording, context: "automatic system-audio startup")
            throw error
        }
    }

    private func finishAutomaticCapture(firstError: inout Error?) async {
        let microphoneTask = Task {
            try await microphoneSpeechSession?.finish() ?? SpeechSourceTranscript(
                words: [],
                sourceOffsetMs: 0
            )
        }
        let systemTask = Task {
            try await systemAudioSpeechSession?.finish() ?? SpeechSourceTranscript(
                words: [],
                sourceOffsetMs: 0
            )
        }
        var microphone = SpeechSourceTranscript(words: [], sourceOffsetMs: 0)
        var systemAudio = SpeechSourceTranscript(words: [], sourceOffsetMs: 0)
        do {
            microphone = try await microphoneTask.value
        } catch {
            firstError = firstError ?? error
        }
        do {
            systemAudio = try await systemTask.value
        } catch {
            firstError = firstError ?? error
        }
        finishDiarizationRecordings(firstError: &firstError)
        guard firstError == nil else {
            return
        }

        let source = detectOtherVoicesSource(systemAudioWords: systemAudio.words)
        writeDiagnostic("Automatic voice source detected source=\(source.rawValue)")
        do {
            let payload = try await makeAutomaticFinalPayload(
                source: source,
                microphone: microphone,
                systemAudio: systemAudio
            )
            if let payload {
                await writer.event("transcription", payload: payload)
            }
        } catch {
            firstError = error
        }
    }

    private func makeAutomaticFinalPayload(
        source: OtherVoicesSource,
        microphone: SpeechSourceTranscript,
        systemAudio: SpeechSourceTranscript
    ) async throws -> TranscriptPayload? {
        switch source {
        case .microphone:
            guard !microphone.words.isEmpty, let microphoneDiarizationSession else {
                return nil
            }
            writeDiagnostic("FluidAudio microphone diarization started")
            let ranges = try await microphoneDiarizationSession.diarize(
                using: diarizer,
                onProgress: reportDiarizationProgress
            )
            writeDiagnostic("FluidAudio microphone diarization finished")
            return try makeDiarizedTranscriptPayload(
                words: microphone.words,
                speakerRanges: ranges,
                sourceOffsetMs: microphone.sourceOffsetMs
            )?.applyingOtherVoicesSource(source)
        case .systemAudio:
            guard let systemAudioDiarizationSession else {
                return nil
            }
            writeDiagnostic("FluidAudio system-audio diarization started")
            let ranges = try await systemAudioDiarizationSession.diarize(
                using: diarizer,
                onProgress: reportDiarizationProgress
            )
            let localWords = try removeSystemAudioEcho(
                from: microphone.words,
                systemAudioWords: systemAudio.words
            )
            writeDiagnostic("FluidAudio system-audio diarization finished")
            return try makeSystemAudioTranscriptPayload(
                localWords: localWords,
                remoteWords: systemAudio.words,
                remoteSpeakerRanges: ranges,
                remoteSourceOffsetMs: systemAudio.sourceOffsetMs
            )?.applyingOtherVoicesSource(source)
        }
    }

    private func resolveLocale() async throws -> Locale {
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
        return locale
    }

    private func ensureInstalled(modules: [any SpeechModule]) async throws {
        let initialStatus = await AssetInventory.status(forModules: modules)
        switch initialStatus {
        case .installed:
            return
        case .unsupported:
            throw HelperError.message("The Apple speech model is unsupported for this locale.")
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
        guard await AssetInventory.status(forModules: modules) == .installed else {
            throw HelperError.message("The Apple speech model did not finish installing.")
        }
    }

    private func finishDiarizationRecordings(firstError: inout Error?) {
        for session in [microphoneDiarizationSession, systemAudioDiarizationSession] {
            do {
                try session?.finishRecording()
            } catch {
                firstError = firstError ?? error
            }
        }
    }

    private func cleanupDiarizationSessions(firstError: inout Error?) {
        for session in [microphoneDiarizationSession, systemAudioDiarizationSession] {
            do {
                try session?.cleanup()
            } catch {
                firstError = firstError ?? error
            }
        }
    }

    private func cleanupDiarizationSessions() {
        var cleanupError: Error?
        cleanupDiarizationSessions(firstError: &cleanupError)
        if let cleanupError {
            writeDiagnostic("Failed to clean diarization sessions: \(cleanupError)")
        }
    }

    private func cleanup(_ session: OfflineDiarizationSession?, context: String) {
        do {
            try session?.cleanup()
        } catch {
            writeDiagnostic("Failed to clean diarization session after \(context): \(error)")
        }
    }

    private func clearActiveSession() {
        microphoneCaptureEngine = nil
        systemAudioCaptureEngine = nil
        microphoneSpeechSession = nil
        systemAudioSpeechSession = nil
        microphoneDiarizationSession = nil
        systemAudioDiarizationSession = nil
    }
}

private extension TranscriptPayload {
    func applyingOtherVoicesSource(_ source: OtherVoicesSource) -> TranscriptPayload {
        TranscriptPayload(
            text: text,
            isFinal: isFinal,
            startedAtMs: startedAtMs,
            endedAtMs: endedAtMs,
            segments: segments,
            replaceTranscript: replaceTranscript,
            otherVoicesSource: source
        )
    }
}

private let reportDiarizationProgress: DiarizationProgressHandler = { progress in
    writeDiagnostic(
        "diarization_progress completed=\(progress.completedChunks) " +
            "total=\(progress.totalChunks)"
    )
}
