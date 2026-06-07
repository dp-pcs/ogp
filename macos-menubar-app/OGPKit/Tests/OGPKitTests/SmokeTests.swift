import XCTest
@testable import OGPKit

final class SmokeTests: XCTestCase {
    func testVersion() { XCTAssertEqual(OGPKit.version, "0.1.0") }
}
