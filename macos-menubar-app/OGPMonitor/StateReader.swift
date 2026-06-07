import Foundation
import OGPKit

/// Reads per-framework state files. No subprocesses, no side effects.
struct StateReader {
    let context: FrameworkContext

    struct LocalConfig: Decodable {
        let daemonPort: Int?
        let gatewayUrl: String?
        let displayName: String?
    }

    func loadConfig() -> LocalConfig? {
        guard let data = FileManager.default.contents(atPath: context.configPath) else { return nil }
        return try? JSONDecoder().decode(LocalConfig.self, from: data)
    }

    /// Reads peers.json directly (decodes the subset the app needs). Unknown keys
    /// on the daemon's richer Peer shape are ignored by Decodable. Treated as a
    /// fast-path cache; OGPClient.listPeers() is the source of truth.
    func loadPeers() -> [PeerJson] {
        guard let data = FileManager.default.contents(atPath: context.peersPath) else { return [] }
        return (try? JSONDecoder().decode([PeerJson].self, from: data)) ?? []
    }

    func daemonRunning() -> Bool {
        let pidPath = (context.stateDir as NSString).appendingPathComponent("daemon.pid")
        guard let s = try? String(contentsOfFile: pidPath, encoding: .utf8),
              let pid = Int32(s.trimmingCharacters(in: .whitespacesAndNewlines)) else { return false }
        return kill(pid, 0) == 0   // signal 0 = liveness probe
    }
}
