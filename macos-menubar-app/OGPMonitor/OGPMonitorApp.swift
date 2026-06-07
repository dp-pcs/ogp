import SwiftUI

@main
struct OGPMonitorApp: App {
    @StateObject private var service = OGPService()

    var body: some Scene {
        MenuBarExtra {
            ContentView(service: service)
        } label: {
            Image("OGPStatusGlyph")
                .renderingMode(.template)
                .foregroundColor(statusColor)
        }

        Window("Add Gateway", id: "add-gateway") {
            AddGatewayWindow(service: service)
        }
        .windowResizability(.contentSize)
    }

    private var statusColor: Color {
        switch service.daemonStatus {
        case .running:
            return service.tunnelStatus == .running ? .green : .yellow
        case .stopped:
            return .red
        case .unknown:
            return .yellow
        }
    }
}
