import AudioToolbox
import AVFoundation
import CoreAudio
import CoreMedia
import Foundation

struct CapturedAudioBuffer: @unchecked Sendable {
    let buffer: AVAudioPCMBuffer
    let hostTime: CMTime
}

struct AudioCaptureStream: @unchecked Sendable {
    let buffers: AsyncThrowingStream<CapturedAudioBuffer, Error>
    let format: AVAudioFormat
}

final class AudioCaptureEngine: @unchecked Sendable {
    private var audioEngine: AVAudioEngine?
    private var continuation: AsyncThrowingStream<CapturedAudioBuffer, Error>.Continuation?

    static var microphonePermission: String {
        switch AVAudioApplication.shared.recordPermission {
        case .undetermined:
            return "undetermined"
        case .denied:
            return "denied"
        case .granted:
            return "granted"
        @unknown default:
            return "unknown"
        }
    }

    static func requestMicrophonePermission() async -> Bool {
        await AVAudioApplication.requestRecordPermission()
    }

    func start(inputDeviceID: AudioDeviceID?) throws -> AudioCaptureStream {
        guard audioEngine == nil else {
            throw HelperError.message("Audio capture is already active.")
        }

        let engine = AVAudioEngine()
        let inputNode = engine.inputNode
        if let inputDeviceID {
            try assignInputDevice(inputDeviceID, to: inputNode)
        }

        let currentDeviceID = try currentInputDeviceID(for: inputNode)
        let hardwareFormat = inputNode.inputFormat(forBus: 0)
        guard hardwareFormat.sampleRate > 0, hardwareFormat.channelCount > 0 else {
            throw HelperError.message("The selected audio input is not enabled.")
        }
        let format = inputNode.outputFormat(forBus: 0)
        guard format.sampleRate > 0, format.channelCount > 0 else {
            throw HelperError.message("The selected audio input has no usable format.")
        }

        let (buffers, continuation) = AsyncThrowingStream.makeStream(
            of: CapturedAudioBuffer.self,
            throwing: Error.self,
            bufferingPolicy: .bufferingNewest(8)
        )
        inputNode.installTap(onBus: 0, bufferSize: 4096, format: format) { buffer, time in
            guard time.isHostTimeValid else {
                continuation.finish(
                    throwing: HelperError.message("Captured audio has no host timestamp.")
                )
                return
            }
            guard let copiedBuffer = copyAudioPCMBuffer(buffer) else {
                continuation.finish(
                    throwing: HelperError.message("Failed to copy captured audio.")
                )
                return
            }
            let captured = CapturedAudioBuffer(
                buffer: copiedBuffer,
                hostTime: CMClockMakeHostTimeFromSystemUnits(time.hostTime)
            )
            if case .dropped = continuation.yield(captured) {
                continuation.finish(
                    throwing: HelperError.message(
                        "Audio processing could not keep up with the input stream."
                    )
                )
            }
        }

        do {
            engine.prepare()
            try engine.start()
            writeDiagnostic(
                "Audio capture started device=\(currentDeviceID) " +
                    "hardware=\(hardwareFormat.sampleRate)Hz/" +
                    "\(hardwareFormat.channelCount)ch " +
                    "tap=\(format.sampleRate)Hz/\(format.channelCount)ch"
            )
        } catch {
            inputNode.removeTap(onBus: 0)
            continuation.finish(throwing: error)
            throw HelperError.message("Failed to start audio capture: \(error)")
        }

        audioEngine = engine
        self.continuation = continuation
        return AudioCaptureStream(buffers: buffers, format: format)
    }

    func stop() {
        guard let audioEngine else {
            return
        }
        audioEngine.inputNode.removeTap(onBus: 0)
        audioEngine.stop()
        continuation?.finish()
        continuation = nil
        self.audioEngine = nil
    }

    private func assignInputDevice(
        _ deviceID: AudioDeviceID,
        to inputNode: AVAudioInputNode
    ) throws {
        guard let audioUnit = inputNode.audioUnit else {
            throw HelperError.message("Failed to access the audio input unit.")
        }
        var deviceID = deviceID
        let status = AudioUnitSetProperty(
            audioUnit,
            kAudioOutputUnitProperty_CurrentDevice,
            kAudioUnitScope_Global,
            0,
            &deviceID,
            UInt32(MemoryLayout<AudioDeviceID>.size)
        )
        guard status == noErr else {
            throw HelperError.message(
                "Failed to select input audio device (AudioUnit status \(status))."
            )
        }
        let selectedDeviceID = try currentInputDeviceID(for: inputNode)
        guard selectedDeviceID == deviceID else {
            throw HelperError.message(
                "Selected input device \(deviceID), but Core Audio uses \(selectedDeviceID)."
            )
        }
    }

    private func currentInputDeviceID(for inputNode: AVAudioInputNode) throws -> AudioDeviceID {
        guard let audioUnit = inputNode.audioUnit else {
            throw HelperError.message("Failed to access the audio input unit.")
        }
        var deviceID = AudioDeviceID(0)
        var byteCount = UInt32(MemoryLayout<AudioDeviceID>.size)
        let status = AudioUnitGetProperty(
            audioUnit,
            kAudioOutputUnitProperty_CurrentDevice,
            kAudioUnitScope_Global,
            0,
            &deviceID,
            &byteCount
        )
        guard status == noErr else {
            throw HelperError.message(
                "Failed to read selected input device (AudioUnit status \(status))."
            )
        }
        return deviceID
    }

}
