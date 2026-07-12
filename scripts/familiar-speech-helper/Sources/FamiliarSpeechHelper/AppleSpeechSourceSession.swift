import AVFoundation
import CoreMedia
import Foundation
import Speech

@available(macOS 26.0, *)
struct SpeechSourceTranscript: Sendable {
    let words: [TranscriptWordPayload]
    let sourceOffsetMs: Int
}

@available(macOS 26.0, *)
private struct AudioFeedSummary {
    var frameCount: AVAudioFramePosition = 0
    var containsSignal = false
    var sourceOffsetMs = 0

    mutating func observe(_ buffer: AVAudioPCMBuffer) {
        frameCount += AVAudioFramePosition(buffer.frameLength)
        if !containsSignal {
            containsSignal = audioBufferContainsSignal(buffer)
        }
    }
}

@available(macOS 26.0, *)
final class AppleSpeechSourceSession: @unchecked Sendable {
    typealias CapturedBufferHandler = @Sendable (AVAudioPCMBuffer) throws -> Void

    private let writer: OutputWriter
    private let transcriber: SpeechTranscriber
    private let analyzer: SpeechAnalyzer
    private let analyzerFormat: AVAudioFormat
    private let liveSpeakerLabel: String?
    private var analyzerInput: AsyncThrowingStream<AnalyzerInput, Error>.Continuation?
    private var feedTask: Task<AudioFeedSummary, Error>?
    private var resultsTask: Task<FinalTranscriptAccumulator, Error>?
    private var started = false

    static func prepare(
        locale: Locale,
        writer: OutputWriter,
        liveSpeakerLabel: String? = nil
    ) async throws -> AppleSpeechSourceSession {
        let transcriber = SpeechTranscriber(
            locale: locale,
            transcriptionOptions: [],
            reportingOptions: [.volatileResults],
            attributeOptions: [.audioTimeRange]
        )
        let modules: [any SpeechModule] = [transcriber]
        guard let analyzerFormat = await SpeechAnalyzer.bestAvailableAudioFormat(
            compatibleWith: modules
        ) else {
            throw HelperError.message("SpeechTranscriber audio format is unavailable.")
        }
        let analyzer = SpeechAnalyzer(modules: modules)
        try await analyzer.prepareToAnalyze(in: analyzerFormat)
        return AppleSpeechSourceSession(
            writer: writer,
            transcriber: transcriber,
            analyzer: analyzer,
            analyzerFormat: analyzerFormat,
            liveSpeakerLabel: liveSpeakerLabel
        )
    }

    private init(
        writer: OutputWriter,
        transcriber: SpeechTranscriber,
        analyzer: SpeechAnalyzer,
        analyzerFormat: AVAudioFormat,
        liveSpeakerLabel: String?
    ) {
        self.writer = writer
        self.transcriber = transcriber
        self.analyzer = analyzer
        self.analyzerFormat = analyzerFormat
        self.liveSpeakerLabel = liveSpeakerLabel
    }

    func start(
        capture: AudioCaptureStream,
        sessionOrigin: CMTime,
        onCapturedBuffer: CapturedBufferHandler? = nil
    ) async throws {
        guard !started else {
            throw HelperError.message("Speech source analysis is already active.")
        }
        let converter = try AudioBufferConverter(
            inputFormat: capture.format,
            outputFormat: analyzerFormat
        )
        let (inputSequence, inputBuilder) = AsyncThrowingStream.makeStream(
            of: AnalyzerInput.self,
            throwing: Error.self,
            bufferingPolicy: .bufferingNewest(8)
        )
        let resultsTask = makeResultsTask()
        let feedTask = makeFeedTask(
            capture: capture,
            converter: converter,
            inputBuilder: inputBuilder,
            sessionOrigin: sessionOrigin,
            onCapturedBuffer: onCapturedBuffer
        )

        do {
            try await analyzer.start(inputSequence: inputSequence)
        } catch {
            inputBuilder.finish(throwing: error)
            feedTask.cancel()
            resultsTask.cancel()
            throw error
        }
        analyzerInput = inputBuilder
        self.feedTask = feedTask
        self.resultsTask = resultsTask
        started = true
    }

    func finish() async throws -> SpeechSourceTranscript {
        guard started else {
            return SpeechSourceTranscript(words: [], sourceOffsetMs: 0)
        }
        started = false
        var firstError: Error?
        var feedSummary = AudioFeedSummary()
        var accumulator = FinalTranscriptAccumulator()

        do {
            feedSummary = try await feedTask?.value ?? feedSummary
        } catch {
            firstError = error
        }
        analyzerInput?.finish()
        do {
            try await analyzer.finalizeAndFinishThroughEndOfInput()
        } catch {
            firstError = firstError ?? error
        }
        do {
            accumulator = try await resultsTask?.value ?? accumulator
        } catch {
            firstError = firstError ?? error
        }
        writeDiagnostic(
            "Speech source finished frames=\(feedSummary.frameCount) " +
                "signal=\(feedSummary.containsSignal) " +
                "words=\(accumulator.orderedWords.count)"
        )
        clearTasks()
        if let firstError {
            throw firstError
        }
        return SpeechSourceTranscript(
            words: accumulator.orderedWords,
            sourceOffsetMs: feedSummary.sourceOffsetMs
        )
    }

    func cancel() async {
        feedTask?.cancel()
        resultsTask?.cancel()
        analyzerInput?.finish(throwing: CancellationError())
        await analyzer.cancelAndFinishNow()
        started = false
        clearTasks()
    }

    private func makeResultsTask() -> Task<FinalTranscriptAccumulator, Error> {
        let liveSpeakerLabel = liveSpeakerLabel
        let transcriber = transcriber
        let writer = writer
        return Task {
            var accumulator = FinalTranscriptAccumulator()
            var accumulationError: Error?
            for try await result in transcriber.results {
                guard let payload = makeTranscriptPayload(from: result) else {
                    continue
                }
                do {
                    try accumulator.append(payload)
                } catch {
                    accumulationError = accumulationError ?? error
                }
                await writer.event(
                    "transcription",
                    payload: payload.applyingSpeakerLabel(liveSpeakerLabel)
                )
            }
            if let accumulationError {
                throw accumulationError
            }
            return accumulator
        }
    }

    private func makeFeedTask(
        capture: AudioCaptureStream,
        converter: AudioBufferConverter,
        inputBuilder: AsyncThrowingStream<AnalyzerInput, Error>.Continuation,
        sessionOrigin: CMTime,
        onCapturedBuffer: CapturedBufferHandler?
    ) -> Task<AudioFeedSummary, Error> {
        let analyzerFormat = analyzerFormat
        return Task {
            var timeline = AudioSourceTimeline(sessionOrigin: sessionOrigin)
            var summary = AudioFeedSummary()
            var sourceStartTime: CMTime?
            var emittedFrames: AVAudioFramePosition = 0
            do {
                for try await captured in capture.buffers {
                    try Task.checkCancellation()
                    summary.observe(captured.buffer)
                    let observedTime = try timeline.relativeTime(for: captured.hostTime)
                    sourceStartTime = sourceStartTime ?? observedTime
                    try onCapturedBuffer?(captured.buffer)
                    let converted = try converter.convert(captured.buffer)
                    try Self.yield(
                        converted,
                        sourceStartTime: sourceStartTime,
                        emittedFrames: &emittedFrames,
                        sampleRate: analyzerFormat.sampleRate,
                        to: inputBuilder
                    )
                }
                let converted = try converter.finish()
                try Self.yield(
                    converted,
                    sourceStartTime: sourceStartTime,
                    emittedFrames: &emittedFrames,
                    sampleRate: analyzerFormat.sampleRate,
                    to: inputBuilder
                )
                inputBuilder.finish()
                summary.sourceOffsetMs = timeline.sourceOffsetMs ?? 0
                return summary
            } catch {
                inputBuilder.finish(throwing: error)
                throw error
            }
        }
    }

    private static func yield(
        _ buffers: [AVAudioPCMBuffer],
        sourceStartTime: CMTime?,
        emittedFrames: inout AVAudioFramePosition,
        sampleRate: Double,
        to continuation: AsyncThrowingStream<AnalyzerInput, Error>.Continuation
    ) throws {
        guard buffers.isEmpty || sourceStartTime != nil else {
            throw HelperError.message("Converted audio has no source start time.")
        }
        for buffer in buffers {
            let startTime = try audioTime(
                start: sourceStartTime ?? .zero,
                emittedFrameCount: emittedFrames,
                sampleRate: sampleRate
            )
            let result = continuation.yield(
                AnalyzerInput(buffer: buffer, bufferStartTime: startTime)
            )
            if case .dropped = result {
                throw HelperError.message(
                    "Audio processing could not keep up with SpeechTranscriber."
                )
            }
            emittedFrames += AVAudioFramePosition(buffer.frameLength)
        }
    }

    private func clearTasks() {
        analyzerInput = nil
        feedTask = nil
        resultsTask = nil
    }
}

private extension TranscriptPayload {
    func applyingSpeakerLabel(_ speakerLabel: String?) -> TranscriptPayload {
        guard let speakerLabel else {
            return self
        }
        return TranscriptPayload(
            text: text,
            isFinal: isFinal,
            startedAtMs: startedAtMs,
            endedAtMs: endedAtMs,
            segments: segments.map { segment in
                TranscriptSegmentPayload(
                    text: segment.text,
                    startedAtMs: segment.startedAtMs,
                    endedAtMs: segment.endedAtMs,
                    words: segment.words,
                    speaker: speakerLabel
                )
            },
            replaceTranscript: replaceTranscript,
            otherVoicesSource: otherVoicesSource
        )
    }
}
