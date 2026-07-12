import AVFoundation
import CoreMedia
import XCTest
@testable import FamiliarSpeechHelper

final class AudioSourceTimelineTests: XCTestCase {
    func testConvertsHostTimesToOneSessionTimeline() throws {
        var timeline = AudioSourceTimeline(sessionOrigin: milliseconds(1_000))

        let first = try timeline.relativeTime(for: milliseconds(1_250))
        let second = try timeline.relativeTime(for: milliseconds(1_750))

        XCTAssertEqual(first, milliseconds(250))
        XCTAssertEqual(second, milliseconds(750))
        XCTAssertEqual(timeline.sourceOffsetMs, 250)
    }

    func testRejectsTimeBeforeSessionOrigin() {
        var timeline = AudioSourceTimeline(sessionOrigin: milliseconds(1_000))

        XCTAssertThrowsError(
            try timeline.relativeTime(for: milliseconds(999))
        ) { error in
            XCTAssertEqual(error as? AudioSourceTimelineError, .beforeSessionOrigin)
        }
    }

    func testRejectsTimestampRegression() throws {
        var timeline = AudioSourceTimeline(sessionOrigin: milliseconds(1_000))
        _ = try timeline.relativeTime(for: milliseconds(1_500))

        XCTAssertThrowsError(
            try timeline.relativeTime(for: milliseconds(1_499))
        ) { error in
            XCTAssertEqual(error as? AudioSourceTimelineError, .timestampRegressed)
        }
    }

    func testFrameOffsetsDoNotDriftOverOneHour() throws {
        let start = milliseconds(250)
        let oneHourAt48Khz = AVAudioFramePosition(48_000 * 60 * 60)

        let result = try audioTime(
            start: start,
            emittedFrameCount: oneHourAt48Khz,
            sampleRate: 48_000
        )

        XCTAssertEqual(result, milliseconds(3_600_250))
    }

    private func milliseconds(_ value: Int64) -> CMTime {
        CMTime(value: value, timescale: 1_000)
    }
}
