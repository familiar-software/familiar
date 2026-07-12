import Foundation

func writeDiagnostic(_ message: String) {
    let line = "[familiar-speech-helper] \(message)\n"
    FileHandle.standardError.write(Data(line.utf8))
}

struct HelperRequest: Decodable {
    let id: String
    let command: String
    let inputDeviceName: String?
}

struct EmptyPayload: Encodable {}

private struct HelperResponse<Payload: Encodable>: Encodable {
    let type = "response"
    let id: String
    let ok: Bool
    let payload: Payload?
    let error: String?
}

private struct HelperEvent<Payload: Encodable>: Encodable {
    let type = "event"
    let event: String
    let payload: Payload
}

actor OutputWriter {
    private let encoder = JSONEncoder()

    func response<Payload: Encodable>(id: String, payload: Payload) {
        write(HelperResponse(id: id, ok: true, payload: payload, error: nil))
    }

    func response(id: String) {
        response(id: id, payload: EmptyPayload())
    }

    func error(id: String, message: String) {
        let response = HelperResponse<EmptyPayload>(
            id: id,
            ok: false,
            payload: nil,
            error: message
        )
        write(response)
    }

    func event<Payload: Encodable>(_ event: String, payload: Payload) {
        write(HelperEvent(event: event, payload: payload))
    }

    private func write<Value: Encodable>(_ value: Value) {
        do {
            let data = try encoder.encode(value)
            FileHandle.standardOutput.write(data)
            FileHandle.standardOutput.write(Data("\n".utf8))
        } catch {
            let message = "Failed to write helper JSON: \(error)\n"
            FileHandle.standardError.write(Data(message.utf8))
        }
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
