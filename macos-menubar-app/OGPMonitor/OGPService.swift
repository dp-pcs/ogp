import Foundation
import Combine
import OGPKit

@MainActor
final class OGPService: ObservableObject {
    @Published var frameworks: [FrameworkInfo] = []
    @Published var selectedFramework: FrameworkInfo?
    @Published var peers: [PeerJson] = []
    @Published var daemonStatus: ServiceStatus = .unknown
    @Published var tunnelStatus: ServiceStatus = .unknown

    private var timer: Timer?
    private var tunnelManager: TunnelManager?

    init() {
        discoverFrameworks()
        startPolling()
    }

    deinit { timer?.invalidate() }

    private var context: FrameworkContext? { selectedFramework?.context }
    private var reader: StateReader? { context.map { StateReader(context: $0) } }
    private var client: OGPClient? { context.map { OGPClient(context: $0) } }

    // MARK: - Discovery

    /// Decoded `ogp whoami --json` row.
    private struct WhoamiJson: Decodable {
        let framework: String?
        let displayName: String?
        let stateDir: String?
        let gatewayUrl: String?
        let daemonPort: Int?
    }

    func discoverFrameworks() {
        guard let path = OGPClient.locateOGP() else {
            print("⚠️ ogp binary not found; cannot discover frameworks")
            return
        }

        var discovered: [FrameworkInfo] = []

        // Try multi-framework first: `ogp --for all whoami --json` → array of rows.
        if let data = Self.runRaw(path, ["--for", "all", "whoami", "--json"]),
           let rows = try? JSONDecoder().decode([WhoamiJson].self, from: data) {
            discovered = rows.compactMap(Self.toFramework)
        }

        // Fallback: single framework `ogp whoami --json` → one object.
        if discovered.isEmpty,
           let data = Self.runRaw(path, ["whoami", "--json"]),
           let row = try? JSONDecoder().decode(WhoamiJson.self, from: data),
           let fw = Self.toFramework(row) {
            discovered = [fw]
        }

        frameworks = discovered
        if selectedFramework == nil, let first = discovered.first {
            selectFramework(first)
        }
    }

    private static func toFramework(_ r: WhoamiJson) -> FrameworkInfo? {
        guard let id = r.framework, let stateDir = r.stateDir else { return nil }
        return FrameworkInfo(
            id: id,
            displayName: r.displayName ?? id,
            stateDir: stateDir,
            gatewayUrl: r.gatewayUrl,
            daemonPort: r.daemonPort ?? 18790
        )
    }

    /// One-shot process runner for discovery (no FrameworkContext yet).
    private static func runRaw(_ path: String, _ args: [String]) -> Data? {
        let task = Process()
        task.executableURL = URL(fileURLWithPath: path)
        task.arguments = args
        let out = Pipe(); let err = Pipe()
        task.standardOutput = out; task.standardError = err
        do {
            try task.run()
            let data = out.fileHandleForReading.readDataToEndOfFile()
            _ = err.fileHandleForReading.readDataToEndOfFile()
            task.waitUntilExit()
            return task.terminationStatus == 0 ? data : nil
        } catch {
            return nil
        }
    }

    // MARK: - Selection

    func selectFramework(_ fw: FrameworkInfo) {
        selectedFramework = fw
        tunnelManager = TunnelManager(ogpPort: fw.daemonPort)
        refresh()
    }

    // MARK: - Polling

    private func startPolling() {
        timer = Timer.scheduledTimer(withTimeInterval: 5, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.refresh() }
        }
    }

    func refresh() {
        guard let reader, let client else { return }
        daemonStatus = reader.daemonRunning() ? .running : .stopped
        tunnelStatus = (tunnelManager?.detectRunningTunnel() ?? false) ? .running : .stopped
        if let live = try? client.listPeers() {
            peers = live
        } else {
            peers = reader.loadPeers()
        }
    }

    // MARK: - Peer actions

    func approve(_ peer: PeerJson, policy: AuthorizationPolicy) {
        try? client?.approve(peerId: peer.id, policy: policy)
        refresh()
    }

    func reject(_ peer: PeerJson) {
        try? client?.reject(peerId: peer.id)
        refresh()
    }

    var approvedPeers: [PeerJson] { peers.filter { $0.status == "approved" } }
    var pendingPeers: [PeerJson] { peers.filter { $0.status == "pending" } }

    // MARK: - Daemon actions

    func startDaemon() {
        try? client?.startDaemon()
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) { [weak self] in
            Task { @MainActor in self?.refresh() }
        }
    }

    func stopDaemon() {
        try? client?.stopDaemon()
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) { [weak self] in
            Task { @MainActor in self?.refresh() }
        }
    }
}
