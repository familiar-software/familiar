import Darwin
import Foundation

struct FamiliarSpeechHelper {
    static func run() async {
        writeDiagnostic("helper started pid=\(getpid())")
        let writer = OutputWriter()
        let service = SpeechService(writer: writer)
        let decoder = JSONDecoder()
        let signalHandlers = TerminationSignalHandlers(service: service)
        defer { signalHandlers.cancel() }

        while let line = readLine() {
            guard let data = line.data(using: .utf8) else {
                continue
            }
            do {
                let request = try decoder.decode(HelperRequest.self, from: data)
                writeDiagnostic("received command=\(request.command) id=\(request.id)")
                await handle(request: request, service: service, writer: writer)
            } catch {
                writeDiagnostic("Invalid helper request: \(error)")
            }
        }
        await service.shutdown()
    }

    private static func handle(
        request: HelperRequest,
        service: SpeechService,
        writer: OutputWriter
    ) async {
        do {
            switch request.command {
            case "get_status":
                await writer.response(id: request.id, payload: await service.statusPayload())
            case "list_input_devices":
                await writer.response(
                    id: request.id,
                    payload: try await service.inputDevicesPayload()
                )
            case "prewarm_model":
                await writer.response(
                    id: request.id,
                    payload: try await service.prewarmModel()
                )
            case "start_capture":
                try await service.startCapture(
                    inputDeviceName: request.inputDeviceName
                )
                await writer.response(id: request.id)
            case "stop_capture":
                try await service.stopCapture()
                await writer.response(id: request.id)
            default:
                throw HelperError.message(
                    "Unsupported speech helper command: \(request.command)"
                )
            }
        } catch {
            await writer.error(id: request.id, message: String(describing: error))
        }
    }
}

await FamiliarSpeechHelper.run()
