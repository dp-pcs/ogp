import Foundation

// MARK: - OGP Status Models

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

struct OGPStatus {
    var daemonStatus: ServiceStatus
    var tunnelStatus: ServiceStatus
    var peerCount: Int
    var peers: [Peer]

    var overallStatus: ServiceStatus {
        if daemonStatus == .running && tunnelStatus == .running {
            return .running
        } else if daemonStatus == .running {
            return .unknown  // Yellow - partial service
        } else {
            return .stopped  // Red - daemon down
        }
    }

    static let empty = OGPStatus(
        daemonStatus: .unknown,
        tunnelStatus: .unknown,
        peerCount: 0,
        peers: []
    )
}

struct Peer: Identifiable, Codable {
    let id: String
    let displayName: String
    let email: String?
    let gatewayUrl: String
    let publicKey: String
    let status: String
    let alias: String?
    let grantedScopes: ScopeBundle?
    let receivedScopes: ScopeBundle?
    let lastSeen: String?

    var intentsGranted: [String] {
        grantedScopes?.scopes.map { $0.intent } ?? []
    }

    var displayAlias: String {
        alias ?? displayName
    }
}

struct ScopeBundle: Codable {
    let scopes: [ScopeGrant]
    let grantedAt: String
}

struct ScopeGrant: Codable {
    let intent: String
    let enabled: Bool
    let rateLimit: RateLimit?
    let topics: [String]?
}

struct RateLimit: Codable {
    let requests: Int
    let windowSeconds: Int
}

// MARK: - OGP Config

struct OGPConfig: Codable {
    let daemonPort: Int
    let openclawUrl: String
    let gatewayUrl: String?
    let displayName: String
    let email: String?

    static let `default` = OGPConfig(
        daemonPort: 18790,
        openclawUrl: "http://localhost:18789",
        gatewayUrl: nil,
        displayName: "Unknown",
        email: nil
    )
}
