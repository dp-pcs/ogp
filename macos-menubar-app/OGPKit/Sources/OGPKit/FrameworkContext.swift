import Foundation

/// Resolves per-framework state paths and the `--for <framework>` CLI prefix.
/// `stateDir` is sourced from `ogp [--for <fw>] whoami --json`.
public struct FrameworkContext: Equatable {
    public let framework: String?   // nil = default framework
    public let stateDir: String

    public init(framework: String?, stateDir: String) {
        self.framework = framework
        self.stateDir = stateDir
    }

    public func forArgs() -> [String] {
        guard let framework else { return [] }
        return ["--for", framework]
    }

    public var configPath: String { (stateDir as NSString).appendingPathComponent("config.json") }
    public var peersPath: String { (stateDir as NSString).appendingPathComponent("peers.json") }
}
