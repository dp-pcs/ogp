import XCTest
@testable import OGPKit

final class AuthorizationPolicyTests: XCTestCase {
    func testEmptyPolicyProducesNoGrantArgs() {
        let p = AuthorizationPolicy(intents: [], rate: nil, topics: [])
        XCTAssertEqual(p.requestArgs(), [])
        XCTAssertEqual(p.approveArgs(), [])
    }

    func testIntentsBecomeCommaJoinedFlag() {
        let p = AuthorizationPolicy(intents: ["message", "agent-comms"], rate: nil, topics: [])
        XCTAssertEqual(p.approveArgs(), ["--intents", "message,agent-comms"])
    }

    func testRateAndTopicsIncluded() {
        let p = AuthorizationPolicy(intents: ["agent-comms"], rate: "100/3600", topics: ["memory", "tasks"])
        XCTAssertEqual(
            p.approveArgs(),
            ["--intents", "agent-comms", "--rate", "100/3600", "--topics", "memory,tasks"]
        )
    }

    func testRequestArgsAlwaysEmptyInV1() {
        let p = AuthorizationPolicy(intents: ["message"], rate: "10/60", topics: ["x"])
        XCTAssertEqual(p.requestArgs(), [])
    }
}
