import SwiftUI

struct TunnelSelectionView: View {
    let options: [TunnelOption]
    let onSelect: (TunnelOption) -> Void
    let onCancel: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Select Tunnel")
                .font(.headline)

            Text("Choose which tunnel to start for port 18790:")
                .font(.caption)
                .foregroundColor(.secondary)

            Divider()

            ScrollView {
                VStack(alignment: .leading, spacing: 8) {
                    ForEach(options) { option in
                        TunnelOptionRow(option: option) {
                            onSelect(option)
                        }
                    }
                }
            }
            .frame(maxHeight: 200)

            Divider()

            HStack {
                Spacer()
                Button("Cancel") {
                    onCancel()
                }
                .buttonStyle(.borderless)
            }
        }
        .padding()
        .frame(width: 350)
    }
}

struct TunnelOptionRow: View {
    let option: TunnelOption
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack {
                Image(systemName: iconName)
                    .foregroundColor(iconColor)

                VStack(alignment: .leading, spacing: 2) {
                    Text(option.name)
                        .font(.subheadline)

                    Text(typeDescription)
                        .font(.caption2)
                        .foregroundColor(.secondary)
                }

                Spacer()
            }
            .padding(.vertical, 6)
            .padding(.horizontal, 8)
            .background(Color.secondary.opacity(0.05))
            .cornerRadius(6)
        }
        .buttonStyle(.plain)
    }

    private var iconName: String {
        switch option.type {
        case .cloudflareNamed:
            return "cloud.fill"
        case .cloudflareFree:
            return "cloud"
        case .ngrok:
            return "network"
        }
    }

    private var iconColor: Color {
        switch option.type {
        case .cloudflareNamed:
            return .orange
        case .cloudflareFree:
            return .blue
        case .ngrok:
            return .purple
        }
    }

    private var typeDescription: String {
        switch option.type {
        case .cloudflareNamed:
            return "Named Cloudflare Tunnel"
        case .cloudflareFree:
            return "Anonymous Cloudflare Tunnel"
        case .ngrok:
            return "ngrok Tunnel"
        }
    }
}
