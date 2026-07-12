import CoreAudio
import Foundation

struct InputAudioDevice: Equatable, Sendable {
    let id: AudioDeviceID
    let name: String

    var payload: InputAudioDevicePayload {
        InputAudioDevicePayload(id: id, name: name)
    }
}

enum CoreAudioInputDevices {
    static func all() throws -> [InputAudioDevice] {
        let deviceIDs = try loadDeviceIDs()
        var devices: [InputAudioDevice] = []
        for deviceID in deviceIDs where try inputChannelCount(for: deviceID) > 0 {
            devices.append(InputAudioDevice(id: deviceID, name: try name(for: deviceID)))
        }
        return devices.sorted {
            $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending
        }
    }

    static func payloads() throws -> [InputAudioDevicePayload] {
        try all().map(\.payload)
    }

    static func resolveID(named requestedName: String?) throws -> AudioDeviceID? {
        guard let requestedName else {
            return nil
        }
        let trimmedName = requestedName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedName.isEmpty else {
            return nil
        }

        let devices = try all()
        if let exact = devices.first(where: { $0.name == trimmedName }) {
            return exact.id
        }
        if let partial = devices.first(where: {
            $0.name.localizedCaseInsensitiveContains(trimmedName)
        }) {
            return partial.id
        }
        throw HelperError.message("Input audio device not found: \(trimmedName)")
    }

    private static func loadDeviceIDs() throws -> [AudioDeviceID] {
        var address = AudioObjectPropertyAddress(
            mSelector: kAudioHardwarePropertyDevices,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain
        )
        var byteCount: UInt32 = 0
        try check(
            AudioObjectGetPropertyDataSize(
                AudioObjectID(kAudioObjectSystemObject),
                &address,
                0,
                nil,
                &byteCount
            ),
            operation: "read audio device count"
        )

        let count = Int(byteCount) / MemoryLayout<AudioDeviceID>.size
        var deviceIDs = [AudioDeviceID](repeating: 0, count: count)
        try check(
            AudioObjectGetPropertyData(
                AudioObjectID(kAudioObjectSystemObject),
                &address,
                0,
                nil,
                &byteCount,
                &deviceIDs
            ),
            operation: "read audio devices"
        )
        return deviceIDs
    }

    private static func name(for deviceID: AudioDeviceID) throws -> String {
        var address = AudioObjectPropertyAddress(
            mSelector: kAudioDevicePropertyDeviceNameCFString,
            mScope: kAudioObjectPropertyScopeGlobal,
            mElement: kAudioObjectPropertyElementMain
        )
        var value: Unmanaged<CFString>?
        var byteCount = UInt32(MemoryLayout<Unmanaged<CFString>?>.size)
        try check(
            AudioObjectGetPropertyData(
                deviceID,
                &address,
                0,
                nil,
                &byteCount,
                &value
            ),
            operation: "read audio device name"
        )
        guard let value else {
            throw HelperError.message("Audio device \(deviceID) has no name.")
        }
        return value.takeRetainedValue() as String
    }

    private static func inputChannelCount(for deviceID: AudioDeviceID) throws -> Int {
        var address = AudioObjectPropertyAddress(
            mSelector: kAudioDevicePropertyStreamConfiguration,
            mScope: kAudioDevicePropertyScopeInput,
            mElement: kAudioObjectPropertyElementMain
        )
        var byteCount: UInt32 = 0
        try check(
            AudioObjectGetPropertyDataSize(
                deviceID,
                &address,
                0,
                nil,
                &byteCount
            ),
            operation: "read input channel buffer size"
        )

        let rawBuffer = UnsafeMutableRawPointer.allocate(
            byteCount: Int(byteCount),
            alignment: MemoryLayout<AudioBufferList>.alignment
        )
        defer { rawBuffer.deallocate() }
        let bufferList = rawBuffer.assumingMemoryBound(to: AudioBufferList.self)
        try check(
            AudioObjectGetPropertyData(
                deviceID,
                &address,
                0,
                nil,
                &byteCount,
                bufferList
            ),
            operation: "read input channel configuration"
        )
        return UnsafeMutableAudioBufferListPointer(bufferList).reduce(0) {
            $0 + Int($1.mNumberChannels)
        }
    }

    private static func check(_ status: OSStatus, operation: String) throws {
        guard status == noErr else {
            throw HelperError.message("Failed to \(operation) (CoreAudio status \(status)).")
        }
    }
}
