import XCTest
@testable import OGPKit

final class FederationModelsTests: XCTestCase {
    /// Shapes here mirror the REAL `ogp federation list --json` output:
    /// grantedScopes = { version, grantedAt, scopes:[{intent, enabled, rateLimit:{requests, windowSeconds}}] }
    func testDecodesPeerListJson() throws {
        let json = """
        [
          {"id":"p1","alias":"cosmo","displayName":"Cosmo","status":"approved",
           "gatewayUrl":"https://cosmo.example.com","publicKey":"abcd0011",
           "healthState":"established","healthy":true,
           "grantedScopes":{"version":"0.2.0","grantedAt":"2026-06-01T00:00:00Z",
             "scopes":[{"intent":"message","enabled":true,"rateLimit":{"requests":100,"windowSeconds":3600}}]},
           "offeredIntents":["message","agent-comms"],"lastSeenAt":"2026-06-02T00:00:00Z"},
          {"id":"p2","displayName":"Apollo","status":"pending",
           "gatewayUrl":"https://hermes.sarcastek.com","publicKey":"c4ac8320"}
        ]
        """.data(using: .utf8)!

        let peers = try JSONDecoder().decode([PeerJson].self, from: json)
        XCTAssertEqual(peers.count, 2)
        XCTAssertEqual(peers[0].alias, "cosmo")
        XCTAssertEqual(peers[0].status, "approved")
        XCTAssertEqual(peers[0].healthy, true)
        XCTAssertEqual(peers[0].grantedScopes?.scopes.first?.intent, "message")
        XCTAssertEqual(peers[0].grantedScopes?.scopes.first?.rateLimit?.requests, 100)
        XCTAssertEqual(peers[0].offeredIntents, ["message", "agent-comms"])
        XCTAssertNil(peers[1].alias)          // optional missing
        XCTAssertNil(peers[1].healthState)
        XCTAssertNil(peers[1].grantedScopes)
    }

    /// `federation status --json` = { total, approved[], pending[], rejected[] }
    func testDecodesStatusSummary() throws {
        let json = """
        {"total":2,
         "approved":[{"id":"p1","displayName":"Cosmo","status":"approved",
            "gatewayUrl":"https://cosmo.example.com","publicKey":"abcd0011"}],
         "pending":[{"id":"p2","displayName":"Apollo","status":"pending",
            "gatewayUrl":"https://hermes.sarcastek.com","publicKey":"c4ac8320"}],
         "rejected":[]}
        """.data(using: .utf8)!

        let summary = try JSONDecoder().decode(FederationStatusJson.self, from: json)
        XCTAssertEqual(summary.total, 2)
        XCTAssertEqual(summary.approved.count, 1)
        XCTAssertEqual(summary.pending.first?.displayName, "Apollo")
        XCTAssertTrue(summary.rejected.isEmpty)
    }
}
