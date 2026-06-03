import Darwin
import Dispatch
import Foundation

final class TerminationSignalHandlers {
    private let service: SpeechService
    private let queue = DispatchQueue(label: "software.familiar.speech-helper.signals")
    private let lock = NSLock()
    private var sources: [DispatchSourceSignal] = []
    private var isShuttingDown = false

    init(service: SpeechService) {
        self.service = service
        install(signalNumber: SIGTERM)
        install(signalNumber: SIGINT)
    }

    func cancel() {
        for source in sources {
            source.cancel()
        }
        sources = []
    }

    private func install(signalNumber: Int32) {
        signal(signalNumber, SIG_IGN)
        let source = DispatchSource.makeSignalSource(signal: signalNumber, queue: queue)
        source.setEventHandler { [weak self] in
            self?.handle(signalNumber: signalNumber)
        }
        source.resume()
        sources.append(source)
    }

    private func handle(signalNumber: Int32) {
        lock.lock()
        if isShuttingDown {
            lock.unlock()
            return
        }
        isShuttingDown = true
        lock.unlock()

        DispatchQueue.global().asyncAfter(deadline: .now() + 3) {
            Darwin.exit(128 + signalNumber)
        }
        Task {
            await service.shutdown()
            Darwin.exit(0)
        }
    }
}
