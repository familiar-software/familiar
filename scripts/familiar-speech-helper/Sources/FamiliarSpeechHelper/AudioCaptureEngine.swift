import AudioToolbox
import AVFoundation
import CoreAudio
import Foundation

struct CapturedAudioBuffer: @unchecked Sendable {
    let buffer: AVAudioPCMBuffer
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

        let format = inputNode.outputFormat(forBus: 0)
        guard format.sampleRate > 0, format.channelCount > 0 else {
            throw HelperError.message("The selected audio input has no usable format.")
        }

        let (buffers, continuation) = AsyncThrowingStream.makeStream(
            of: CapturedAudioBuffer.self,
            throwing: Error.self,
            bufferingPolicy: .bufferingNewest(8)
        )
        inputNode.installTap(onBus: 0, bufferSize: 4096, format: format) { buffer, _ in
            guard let copiedBuffer = Self.copy(buffer) else {
                continuation.finish(
                    throwing: HelperError.message("Failed to copy captured audio.")
                )
                return
            }
            if case .dropped = continuation.yield(CapturedAudioBuffer(buffer: copiedBuffer)) {
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
    }

    private static func copy(_ source: AVAudioPCMBuffer) -> AVAudioPCMBuffer? {
        guard let destination = AVAudioPCMBuffer(
            pcmFormat: source.format,
            frameCapacity: source.frameLength
        ) else {
            return nil
        }
        destination.frameLength = source.frameLength

        let sourceBuffers = UnsafeMutableAudioBufferListPointer(source.mutableAudioBufferList)
        let destinationBuffers = UnsafeMutableAudioBufferListPointer(
            destination.mutableAudioBufferList
        )
        guard sourceBuffers.count == destinationBuffers.count else {
            return nil
        }
        for index in sourceBuffers.indices {
            let sourceBuffer = sourceBuffers[index]
            guard let sourceData = sourceBuffer.mData,
                  let destinationData = destinationBuffers[index].mData else {
                return nil
            }
            let byteCount = Int(sourceBuffer.mDataByteSize)
            memcpy(destinationData, sourceData, byteCount)
            destinationBuffers[index].mDataByteSize = sourceBuffer.mDataByteSize
        }
        return destination
    }
}
