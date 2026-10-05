import Foundation
import Network
import Observation

/// Watches the network path so the shell can say "You're offline. Everything you made is saved. We'll sync when you're back." and resume uploads. It
/// only reports reachability; nothing in the app depends on it for correctness (every call still handles `FlowdAPIError.offline`).
@MainActor
@Observable
final class ConnectivityMonitor {
    /// False while the device has no usable network path.
    private(set) var isOnline: Bool = true
    /// True on a cellular or personal-hotspot path (large uploads can wait for Wi-Fi).
    private(set) var isExpensive: Bool = false

    @ObservationIgnored private var monitor: NWPathMonitor?
    private let queue: DispatchQueue = DispatchQueue(label: "app.flowd.creator.connectivity")

    init() {
    }

    /// Starts watching. Calling it again is harmless.
    func start() {
        if monitor != nil {
            return
        }
        let pathMonitor: NWPathMonitor = NWPathMonitor()
        pathMonitor.pathUpdateHandler = { [weak self] (path: NWPath) in
            let online: Bool = path.status == NWPath.Status.satisfied
            let expensive: Bool = path.isExpensive
            Task { @MainActor in
                self?.apply(online: online, expensive: expensive)
            }
        }
        pathMonitor.start(queue: queue)
        monitor = pathMonitor
    }

    func stop() {
        monitor?.cancel()
        monitor = nil
    }

    private func apply(online: Bool, expensive: Bool) {
        if isOnline != online {
            isOnline = online
        }
        if isExpensive != expensive {
            isExpensive = expensive
        }
    }
}
