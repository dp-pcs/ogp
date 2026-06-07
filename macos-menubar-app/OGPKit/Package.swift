// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "OGPKit",
    platforms: [.macOS(.v13)],
    products: [
        .library(name: "OGPKit", targets: ["OGPKit"]),
    ],
    targets: [
        .target(name: "OGPKit"),
        .testTarget(name: "OGPKitTests", dependencies: ["OGPKit"]),
    ]
)
