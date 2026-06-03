private let maxPartialTranscriptionSamples = sampleRate * 30

func selectTranscriptionSamples(
    _ audioSamples: ContiguousArray<Float>,
    isFinal: Bool
) -> (samples: [Float], audioSampleOffsetMs: Int) {
    if isFinal || audioSamples.count <= maxPartialTranscriptionSamples {
        return (Array(audioSamples), 0)
    }

    let sampleOffset = audioSamples.count - maxPartialTranscriptionSamples
    return (
        Array(audioSamples.suffix(maxPartialTranscriptionSamples)),
        Int((Double(sampleOffset) / Double(sampleRate)) * 1000)
    )
}
