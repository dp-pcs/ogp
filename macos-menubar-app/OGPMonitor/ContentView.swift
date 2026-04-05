import SwiftUI

struct ContentView: View {
    @ObservedObject var service: OGPService
    @State private var expandedPeers: Set<String> = []

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            // Header
            HStack {
                Text("OGP Monitor")
                    .font(.headline)
                Spacer()
                Button("Refresh") {
                    service.refreshStatus()
                }
                .buttonStyle(.borderless)
            }
            .padding(.bottom, 4)

            Divider()

            // Daemon Status
            StatusRow(
                label: "Daemon",
                status: service.status.daemonStatus,
                action: daemonAction
            )

            // Tunnel Status
            StatusRow(
                label: "Tunnel",
                status: service.status.tunnelStatus,
                action: tunnelAction
            )

            // Tunnel selection (inline)
            if service.showTunnelSelection {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Select tunnel:")
                        .font(.caption)
                        .foregroundColor(.secondary)
                        .padding(.leading, 20)

                    ForEach(service.tunnelOptions) { option in
                        Button(action: {
                            service.startTunnel(option)
                        }) {
                            HStack(spacing: 6) {
                                Image(systemName: tunnelIcon(for: option))
                                    .font(.caption)
                                Text(option.name)
                                    .font(.caption)
                            }
                            .padding(.horizontal, 20)
                            .padding(.vertical, 4)
                        }
                        .buttonStyle(.plain)
                    }

                    Button("Cancel") {
                        service.showTunnelSelection = false
                    }
                    .buttonStyle(.borderless)
                    .font(.caption)
                    .padding(.leading, 20)
                }
                .padding(.vertical, 4)
            }

            Divider()

            // Peers Section
            HStack {
                Text("Federated Peers")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
                Spacer()
                Text("\(service.status.peerCount)")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
            }

            if service.status.peers.isEmpty {
                Text("No approved peers")
                    .font(.caption)
                    .foregroundColor(.secondary)
                    .padding(.leading, 8)
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: 8) {
                        ForEach(service.status.peers) { peer in
                            PeerRow(peer: peer, isExpanded: expandedPeers.contains(peer.id)) {
                                togglePeerExpansion(peer.id)
                            }
                        }
                    }
                }
                .frame(maxHeight: 300)
            }

            Divider()

            // Actions
            HStack {
                Button("Terminal Status") {
                    service.openTerminalStatus()
                }
                .buttonStyle(.borderless)

                Spacer()

                Button("Quit") {
                    NSApplication.shared.terminate(nil)
                }
                .buttonStyle(.borderless)
            }
        }
        .padding()
        .frame(width: 350)
    }

    // MARK: - Helpers

    private func togglePeerExpansion(_ peerId: String) {
        if expandedPeers.contains(peerId) {
            expandedPeers.remove(peerId)
        } else {
            expandedPeers.insert(peerId)
        }
    }

    private func daemonAction() {
        if service.status.daemonStatus == .running {
            service.stopDaemon()
        } else {
            service.startDaemon()
        }
    }

    private func tunnelAction() {
        if service.status.tunnelStatus == .running {
            service.stopTunnel()
        } else {
            service.promptTunnelSelection()
        }
    }

    private func tunnelIcon(for option: TunnelOption) -> String {
        switch option.type {
        case .cloudflareNamed:
            return "cloud.fill"
        case .cloudflareFree:
            return "cloud"
        case .ngrok:
            return "network"
        }
    }
}

// MARK: - Status Row

struct StatusRow: View {
    let label: String
    let status: ServiceStatus
    let action: () -> Void
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        HStack {
            Text(status.icon)
            Text(label)
                .font(.subheadline)
            Text(status.text)
                .font(.caption)
                .foregroundColor(.secondary)

            Spacer()

            Button(actionLabel) {
                // Don't dismiss menu when clicking these buttons
                action()
            }
            .buttonStyle(.plain)
            .font(.caption)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(Color.blue.opacity(0.1))
            .cornerRadius(4)
        }
    }

    private var actionLabel: String {
        switch status {
        case .running:
            return "Stop"
        case .stopped:
            return "Start"
        case .unknown:
            return "Start"
        }
    }
}

// MARK: - Peer Row

struct PeerRow: View {
    let peer: Peer
    let isExpanded: Bool
    let onTap: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Button(action: onTap) {
                HStack {
                    Image(systemName: isExpanded ? "chevron.down" : "chevron.right")
                        .font(.caption)
                    Text(peer.displayAlias)
                        .font(.subheadline)
                        .fontWeight(.medium)
                    Spacer()
                    if let lastSeen = peer.lastSeen {
                        Text(formatLastSeen(lastSeen))
                            .font(.caption2)
                            .foregroundColor(.secondary)
                    }
                }
            }
            .buttonStyle(.plain)

            if isExpanded {
                VStack(alignment: .leading, spacing: 4) {
                    if !peer.intentsGranted.isEmpty {
                        Text("Intents: \(peer.intentsGranted.joined(separator: ", "))")
                            .font(.caption)
                            .foregroundColor(.secondary)
                            .padding(.leading, 20)
                    }

                    Text(peer.gatewayUrl)
                        .font(.caption2)
                        .foregroundColor(.secondary)
                        .padding(.leading, 20)
                }
            }
        }
        .padding(.vertical, 4)
        .padding(.horizontal, 8)
        .background(isExpanded ? Color.secondary.opacity(0.1) : Color.clear)
        .cornerRadius(4)
    }

    private func formatLastSeen(_ isoDate: String) -> String {
        let formatter = ISO8601DateFormatter()
        guard let date = formatter.date(from: isoDate) else {
            return "Unknown"
        }

        let interval = Date().timeIntervalSince(date)

        if interval < 60 {
            return "Just now"
        } else if interval < 3600 {
            let minutes = Int(interval / 60)
            return "\(minutes)m ago"
        } else if interval < 86400 {
            let hours = Int(interval / 3600)
            return "\(hours)h ago"
        } else {
            let days = Int(interval / 86400)
            return "\(days)d ago"
        }
    }
}

// MARK: - Preview

struct ContentView_Previews: PreviewProvider {
    static var previews: some View {
        ContentView(service: OGPService())
    }
}
