import Foundation

/// Codable models matching the real `ogp federation … --json` output.
/// See src/cli/federation.ts `peersToJson` / `federationStatus` for the source shapes.

public struct RateLimit: Codable, Hashable {
    public let requests: Int
    public let windowSeconds: Int
}

public struct ScopeGrant: Codable, Hashable {
    public let intent: String
    public let enabled: Bool
    public let topics: [String]?
    public let rateLimit: RateLimit?
}

public struct ScopeBundle: Codable, Hashable {
    public let version: String?
    public let grantedAt: String?
    public let scopes: [ScopeGrant]
}

public struct PeerJson: Codable, Identifiable, Hashable {
    public let id: String
    public let alias: String?
    public let displayName: String
    public let status: String
    public let gatewayUrl: String
    public let publicKey: String
    public let healthState: String?
    public let healthy: Bool?
    public let grantedScopes: ScopeBundle?
    public let offeredIntents: [String]?
    public let lastSeenAt: String?
    public let tags: [String]?
}

/// `ogp federation status --json` (single framework).
public struct FederationStatusJson: Codable, Hashable {
    public let total: Int
    public let approved: [PeerJson]
    public let pending: [PeerJson]
    public let rejected: [PeerJson]
}
