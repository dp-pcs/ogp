import Foundation

/// Maps a chosen authorization policy to `ogp federation` CLI arguments.
/// v1 grants are per-peer (intents/rate/topics). The per-agent allow-list is a
/// future primitive; when it lands, this type's internals change but its
/// interface (init + *Args) stays stable so the wizard flow is untouched.
public struct AuthorizationPolicy: Equatable {
    public let intents: [String]
    public let rate: String?
    public let topics: [String]

    public init(intents: [String], rate: String?, topics: [String]) {
        self.intents = intents
        self.rate = rate
        self.topics = topics
    }

    /// Args for `ogp federation request` — v1 has no grant flags there.
    public func requestArgs() -> [String] { [] }

    /// Args for `ogp federation approve <peer-id>` (and `federation grant`).
    public func approveArgs() -> [String] {
        var args: [String] = []
        if !intents.isEmpty { args += ["--intents", intents.joined(separator: ",")] }
        if let rate { args += ["--rate", rate] }
        if !topics.isEmpty { args += ["--topics", topics.joined(separator: ",")] }
        return args
    }
}
