import XCTest
@testable import OGPKit

final class WellKnownTests: XCTestCase {
    /// Mirrors the REAL `/.well-known/ogp` payload: capabilities{intents,features},
    /// optional endpoints, and agents[] with id/displayName/role/hookAgentId.
    func testDecodesWellKnownWithPersonas() throws {
        let json = """
        {"version":"0.8.2","displayName":"David - Junior","email":"david@theproctors.cloud",
         "gatewayUrl":"https://ogp.sarcastek.com","publicKey":"302a3005abcd",
         "capabilities":{"intents":["message","agent-comms"],
                         "features":["scope-negotiation","multi-agent-personas"]},
         "endpoints":{"request":"https://ogp.sarcastek.com/federation/request"},
         "agents":[{"id":"junior","displayName":"Junior","role":"primary","hookAgentId":"main"},
                   {"id":"atlas","displayName":"Atlas","role":"specialist","hookAgentId":"atlas"}]}
        """.data(using: .utf8)!

        let wk = try JSONDecoder().decode(WellKnown.self, from: json)
        XCTAssertEqual(wk.displayName, "David - Junior")
        XCTAssertEqual(wk.capabilities.intents, ["message", "agent-comms"])
        XCTAssertTrue(wk.capabilities.features.contains("multi-agent-personas"))
        XCTAssertEqual(wk.agents?.count, 2)
        XCTAssertEqual(wk.agents?[0].role, "primary")
        XCTAssertEqual(wk.agents?[1].hookAgentId, "atlas")
    }

    /// A peer with no agents[] (single-persona) must still decode.
    func testDecodesWellKnownWithoutAgents() throws {
        let json = """
        {"version":"0.7.0","displayName":"Solo","email":"s@x.com",
         "gatewayUrl":"https://solo.example.com","publicKey":"deadbeef",
         "capabilities":{"intents":["message"],"features":[]}}
        """.data(using: .utf8)!

        let wk = try JSONDecoder().decode(WellKnown.self, from: json)
        XCTAssertNil(wk.agents)
        XCTAssertTrue(wk.capabilities.features.isEmpty)
    }
}
