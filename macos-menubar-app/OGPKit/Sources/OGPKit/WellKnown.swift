import Foundation

/// Codable for `/.well-known/ogp`. Fields optional where peers may omit them.

public struct AgentPersona: Codable, Identifiable, Hashable {
    public let id: String
    public let displayName: String
    public let role: String              // "primary" | "specialist"
    public let hookAgentId: String?
    public let displayIcon: String?
    public let description: String?
    public let skills: [String]?
}

public struct WellKnownCapabilities: Codable, Hashable {
    public let intents: [String]
    public let features: [String]
}

public struct WellKnown: Codable, Hashable {
    public let version: String
    public let displayName: String
    public let email: String
    public let gatewayUrl: String
    public let publicKey: String
    public let capabilities: WellKnownCapabilities
    public let endpoints: [String: String]?
    public let agents: [AgentPersona]?
}
