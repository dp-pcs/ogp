import Foundation
import OGPKit

/// Shells out to the `ogp` CLI with `--json` and decodes typed results.
/// Locating the binary reuses a common-paths search (GUI apps lack shell PATH).
struct OGPClient {
    enum ClientError: Error { case binaryNotFound, nonZeroExit(Int32, String), decode(Error) }

    let context: FrameworkContext

    static func locateOGP() -> String? {
        let home = FileManager.default.homeDirectoryForCurrentUser.path
        let candidates = [
            "/opt/homebrew/bin/ogp",
            "/usr/local/bin/ogp",
            "\(home)/.npm-global/bin/ogp",
        ]
        if let direct = candidates.first(where: { FileManager.default.fileExists(atPath: $0) }) {
            return direct
        }
        // nvm glob fallback
        let nvmRoot = "\(home)/.nvm/versions/node"
        if let versions = try? FileManager.default.contentsOfDirectory(atPath: nvmRoot) {
            for v in versions.sorted().reversed() {
                let p = "\(nvmRoot)/\(v)/bin/ogp"
                if FileManager.default.fileExists(atPath: p) { return p }
            }
        }
        return nil
    }

    private func ogpPath() -> String? { OGPClient.locateOGP() }

    /// Run `ogp [--for fw] <args...>`, return stdout data.
    @discardableResult
    private func run(_ args: [String]) throws -> Data {
        guard let path = ogpPath() else { throw ClientError.binaryNotFound }
        let task = Process()
        task.executableURL = URL(fileURLWithPath: path)
        task.arguments = context.forArgs() + args
        let out = Pipe(); let err = Pipe()
        task.standardOutput = out; task.standardError = err
        try task.run()
        let data = out.fileHandleForReading.readDataToEndOfFile()
        let errData = err.fileHandleForReading.readDataToEndOfFile()
        task.waitUntilExit()
        if task.terminationStatus != 0 {
            let msg = String(data: errData, encoding: .utf8) ?? ""
            throw ClientError.nonZeroExit(task.terminationStatus, msg)
        }
        return data
    }

    func listPeers() throws -> [PeerJson] {
        let data = try run(["federation", "list", "--json"])
        do { return try JSONDecoder().decode([PeerJson].self, from: data) }
        catch { throw ClientError.decode(error) }
    }

    func ping(_ peerUrl: String) throws -> Bool {
        struct PingResult: Decodable { let ok: Bool }
        let data = try run(["federation", "ping", peerUrl, "--json"])
        return (try? JSONDecoder().decode(PingResult.self, from: data))?.ok ?? false
    }

    @discardableResult
    func request(peerUrl: String, alias: String?) throws -> Bool {
        struct ReqResult: Decodable { let ok: Bool }
        var args = ["federation", "request", peerUrl]
        if let alias { args += ["--alias", alias] }
        args.append("--json")
        let data = try run(args)
        return (try? JSONDecoder().decode(ReqResult.self, from: data))?.ok ?? false
    }

    func approve(peerId: String, policy: AuthorizationPolicy) throws {
        try run(["federation", "approve", peerId] + policy.approveArgs())
    }

    func reject(peerId: String) throws {
        try run(["federation", "reject", peerId])
    }

    func startDaemon() throws { try run(["start", "--background"]) }
    func stopDaemon() throws { try run(["stop"]) }
}
