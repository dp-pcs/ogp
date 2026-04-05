import SwiftUI

@main
struct OGPMonitorApp: App {
    @StateObject private var service = OGPService()

    var body: some Scene {
        MenuBarExtra {
            ContentView(service: service)
        } label: {
            // Show OGP status glyph with color based on status
            Image("OGPStatusGlyph")
                .renderingMode(.template)
                .foregroundColor(statusColor)
        }
    }

    private var statusColor: Color {
        switch service.status.overallStatus {
        case .running:
            return .green
        case .stopped:
            return .red
        case .unknown:
            return .yellow
        }
    }
}
