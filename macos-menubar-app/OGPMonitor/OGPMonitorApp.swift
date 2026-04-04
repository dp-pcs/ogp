import SwiftUI

@main
struct OGPMonitorApp: App {
    @StateObject private var service = OGPService()

    var body: some Scene {
        MenuBarExtra {
            ContentView(service: service)
        } label: {
            // Show colored indicator based on overall status
            Text(service.status.overallStatus.icon)
        }
    }
}
