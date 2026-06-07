import Foundation
import OGPKit

// MARK: - App display status

enum ServiceStatus {
    case running
    case stopped
    case unknown

    var icon: String {
        switch self {
        case .running: return "🟢"
        case .stopped: return "🔴"
        case .unknown: return "🟡"
        }
    }

    var text: String {
        switch self {
        case .running: return "Running"
        case .stopped: return "Stopped"
        case .unknown: return "Unknown"
        }
    }
}

// MARK: - Framework

/// One OGP framework (state dir + identity), discovered via `ogp whoami --json`.
struct FrameworkInfo: Identifiable, Hashable {
    let id: String          // framework id, e.g. "openclaw" / "hermes"
    let displayName: String
    let stateDir: String
    let gatewayUrl: String?
    let daemonPort: Int

    var context: FrameworkContext { FrameworkContext(framework: id, stateDir: stateDir) }
}

// MARK: - PeerJson display helpers

extension PeerJson {
    var displayAlias: String { alias ?? displayName }
    var intentsGranted: [String] { grantedScopes?.scopes.map { $0.intent } ?? [] }
    /// Green unless explicitly unhealthy.
    var isHealthy: Bool { healthy != false }
}

// Note: PeerJson, ScopeBundle, ScopeGrant, RateLimit, AgentPersona, WellKnown,
// AuthorizationPolicy, and FrameworkContext now live in the OGPKit package.
