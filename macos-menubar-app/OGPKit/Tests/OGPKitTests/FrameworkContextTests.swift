import XCTest
@testable import OGPKit

final class FrameworkContextTests: XCTestCase {
    func testDefaultFrameworkAddsNoForFlag() {
        let ctx = FrameworkContext(framework: nil, stateDir: "/Users/x/.ogp")
        XCTAssertEqual(ctx.forArgs(), [])
        XCTAssertEqual(ctx.peersPath, "/Users/x/.ogp/peers.json")
        XCTAssertEqual(ctx.configPath, "/Users/x/.ogp/config.json")
    }

    func testNamedFrameworkAddsForFlag() {
        let ctx = FrameworkContext(framework: "hermes", stateDir: "/Users/x/.ogp-hermes")
        XCTAssertEqual(ctx.forArgs(), ["--for", "hermes"])
        XCTAssertEqual(ctx.peersPath, "/Users/x/.ogp-hermes/peers.json")
    }
}
