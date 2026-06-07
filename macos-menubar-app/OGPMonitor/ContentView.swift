import SwiftUI
import OGPKit

struct ContentView: View {
    @ObservedObject var service: OGPService
    @Environment(\.openWindow) private var openWindow

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            // Header
            HStack {
                Text("OGP Federation")
                    .font(.headline)
                Spacer()
                Button("Refresh") { service.refresh() }
                    .buttonStyle(.borderless)
            }

            // Framework switcher (only when >1)
            if service.frameworks.count > 1 {
                Picker("Framework", selection: Binding(
                    get: { service.selectedFramework },
                    set: { if let fw = $0 { service.selectFramework(fw) } }
                )) {
                    ForEach(service.frameworks) { fw in
                        Text(fw.displayName).tag(Optional(fw))
                    }
                }
                .pickerStyle(.menu)
            } else if let fw = service.selectedFramework {
                Text(fw.displayName)
                    .font(.caption)
                    .foregroundColor(.secondary)
            }

            Divider()

            // Daemon + Tunnel status
            StatusRow(label: "Daemon", status: service.daemonStatus, action: daemonAction)
            StatusRow(label: "Tunnel", status: service.tunnelStatus, action: nil)

            Divider()

            // Pending requests
            if !service.pendingPeers.isEmpty {
                Text("Pending Requests")
                    .font(.subheadline).foregroundColor(.secondary)
                ForEach(service.pendingPeers) { peer in
                    PendingPeerRow(
                        peer: peer,
                        onApprove: {
                            service.approve(peer, policy: AuthorizationPolicy(
                                intents: ["message", "agent-comms"], rate: nil, topics: []))
                        },
                        onReject: { service.reject(peer) }
                    )
                }
                Divider()
            }

            // Approved peers
            HStack {
                Text("Federated Peers")
                    .font(.subheadline).foregroundColor(.secondary)
                Spacer()
                Text("\(service.approvedPeers.count)")
                    .font(.subheadline).foregroundColor(.secondary)
            }

            if service.approvedPeers.isEmpty {
                Text("No approved peers")
                    .font(.caption).foregroundColor(.secondary)
                    .padding(.leading, 8)
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: 6) {
                        ForEach(service.approvedPeers) { peer in
                            ApprovedPeerRow(peer: peer)
                        }
                    }
                }
                .frame(maxHeight: 260)
            }

            Divider()

            // Footer
            HStack {
                Button("＋ Add Gateway…") { openWindow(id: "add-gateway") }
                    .buttonStyle(.borderless)
                Spacer()
                Button("Quit") { NSApplication.shared.terminate(nil) }
                    .buttonStyle(.borderless)
            }
        }
        .padding()
        .frame(width: 360)
    }

    private func daemonAction() {
        if service.daemonStatus == .running { service.stopDaemon() }
        else { service.startDaemon() }
    }
}

// MARK: - Status Row

struct StatusRow: View {
    let label: String
    let status: ServiceStatus
    let action: (() -> Void)?

    var body: some View {
        HStack {
            Text(status.icon)
            Text(label).font(.subheadline)
            Text(status.text).font(.caption).foregroundColor(.secondary)
            Spacer()
            if let action {
                Button(actionLabel) { action() }
                    .buttonStyle(.plain)
                    .font(.caption)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(Color.blue.opacity(0.1))
                    .cornerRadius(4)
            }
        }
    }

    private var actionLabel: String {
        status == .running ? "Stop" : "Start"
    }
}

// MARK: - Pending Peer Row

struct PendingPeerRow: View {
    let peer: PeerJson
    let onApprove: () -> Void
    let onReject: () -> Void

    var body: some View {
        HStack {
            Text("?")
            VStack(alignment: .leading, spacing: 2) {
                Text(peer.displayAlias).font(.subheadline).fontWeight(.medium)
                Text(peer.gatewayUrl).font(.caption2).foregroundColor(.secondary)
            }
            Spacer()
            Button("Approve", action: onApprove)
                .buttonStyle(.plain).font(.caption)
                .padding(.horizontal, 8).padding(.vertical, 4)
                .background(Color.green.opacity(0.15)).cornerRadius(4)
            Button("Reject", action: onReject)
                .buttonStyle(.plain).font(.caption)
                .padding(.horizontal, 8).padding(.vertical, 4)
                .background(Color.red.opacity(0.15)).cornerRadius(4)
        }
        .padding(.vertical, 2)
    }
}

// MARK: - Approved Peer Row

struct ApprovedPeerRow: View {
    let peer: PeerJson

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack {
                Circle()
                    .fill(peer.isHealthy ? Color.green : Color.red)
                    .frame(width: 8, height: 8)
                Text(peer.displayAlias).font(.subheadline).fontWeight(.medium)
                Spacer()
                if let last = peer.lastSeenAt {
                    Text(formatRelative(last)).font(.caption2).foregroundColor(.secondary)
                }
            }
            if !peer.intentsGranted.isEmpty {
                Text(peer.intentsGranted.joined(separator: ", "))
                    .font(.caption2).foregroundColor(.secondary)
                    .padding(.leading, 16)
            }
        }
        .padding(.vertical, 3).padding(.horizontal, 6)
        .background(Color.secondary.opacity(0.06)).cornerRadius(4)
    }

    private func formatRelative(_ iso: String) -> String {
        let f = ISO8601DateFormatter()
        guard let date = f.date(from: iso) else { return "" }
        let interval = Date().timeIntervalSince(date)
        if interval < 60 { return "just now" }
        if interval < 3600 { return "\(Int(interval / 60))m ago" }
        if interval < 86400 { return "\(Int(interval / 3600))h ago" }
        return "\(Int(interval / 86400))d ago"
    }
}
