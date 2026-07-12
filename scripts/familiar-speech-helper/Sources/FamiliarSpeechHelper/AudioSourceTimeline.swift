import AVFoundation
import CoreMedia
import Foundation

enum AudioSourceTimelineError: Error, Equatable, LocalizedError {
    case beforeSessionOrigin
    case invalidSampleRate
    case invalidTimestamp
    case timestampRegressed

    var errorDescription: String? {
        switch self {
        case .beforeSessionOrigin:
            return "Captured audio arrived before the recording session started."
        case .invalidSampleRate:
            return "Captured audio has an invalid sample rate."
        case .invalidTimestamp:
            return "Captured audio has an invalid host timestamp."
        case .timestampRegressed:
            return "Captured audio timestamps moved backwards."
        }
    }
}

struct AudioSourceTimeline {
    private let sessionOrigin: CMTime
    private var previousHostTime: CMTime?
    private(set) var sourceOffsetMs: Int?

    init(sessionOrigin: CMTime) {
        self.sessionOrigin = sessionOrigin
    }

    mutating func relativeTime(for hostTime: CMTime) throws -> CMTime {
        guard sessionOrigin.isNumeric, hostTime.isNumeric else {
            throw AudioSourceTimelineError.invalidTimestamp
        }
        guard CMTimeCompare(hostTime, sessionOrigin) >= 0 else {
            throw AudioSourceTimelineError.beforeSessionOrigin
        }
        if let previousHostTime, CMTimeCompare(hostTime, previousHostTime) < 0 {
            throw AudioSourceTimelineError.timestampRegressed
        }

        let relativeTime = CMTimeSubtract(hostTime, sessionOrigin)
        if sourceOffsetMs == nil {
            sourceOffsetMs = milliseconds(from: relativeTime)
        }
        previousHostTime = hostTime
        return relativeTime
    }
}

func audioTime(
    start: CMTime,
    emittedFrameCount: AVAudioFramePosition,
    sampleRate: Double
) throws -> CMTime {
    guard sampleRate.isFinite,
          sampleRate > 0,
          sampleRate.rounded() == sampleRate,
          sampleRate <= Double(Int32.max) else {
        throw AudioSourceTimelineError.invalidSampleRate
    }
    let frameTime = CMTime(
        value: CMTimeValue(emittedFrameCount),
        timescale: CMTimeScale(sampleRate)
    )
    return CMTimeAdd(start, frameTime)
}

private func milliseconds(from time: CMTime) -> Int {
    let milliseconds = CMTimeConvertScale(
        time,
        timescale: 1_000,
        method: .roundHalfAwayFromZero
    )
    return Int(milliseconds.value)
}
