import AVFoundation
import Foundation

func copyAudioPCMBuffer(_ source: AVAudioPCMBuffer) -> AVAudioPCMBuffer? {
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

func audioBufferContainsSignal(_ source: AVAudioPCMBuffer) -> Bool {
    let sourceBuffers = UnsafeMutableAudioBufferListPointer(source.mutableAudioBufferList)
    for sourceBuffer in sourceBuffers {
        guard let sourceData = sourceBuffer.mData else {
            continue
        }
        let bytes = UnsafeRawBufferPointer(
            start: sourceData,
            count: Int(sourceBuffer.mDataByteSize)
        )
        if bytes.contains(where: { $0 != 0 }) {
            return true
        }
    }
    return false
}
