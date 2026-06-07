import SwiftUI
import OGPKit

/// Isolated authorization step. Input: peer's advertised personas (read-only) +
/// the available intents. Output (binding): an AuthorizationPolicy. When the v2
/// per-agent primitive lands, only this view's internals change.
struct AuthorizationStepView: View {
    let personas: [AgentPersona]          // read-only display
    let availableIntents: [String]
    @Binding var policy: AuthorizationPolicy

    @State private var selectedIntents: Set<String> = ["message", "agent-comms"]

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Authorization").font(.headline)
            Text("Grant this peer these scopes (per-peer):")
                .font(.caption).foregroundColor(.secondary)
            ForEach(availableIntents, id: \.self) { intent in
                Toggle(intent, isOn: Binding(
                    get: { selectedIntents.contains(intent) },
                    set: { on in
                        if on { selectedIntents.insert(intent) } else { selectedIntents.remove(intent) }
                        syncPolicy()
                    }
                ))
            }
            if !personas.isEmpty {
                Divider()
                Text("This peer advertises agents (read-only — per-agent control coming in v2):")
                    .font(.caption2).foregroundColor(.secondary)
                ForEach(personas) { p in
                    HStack {
                        Text(p.role == "primary" ? "★" : "•")
                        Text(p.displayName).font(.caption)
                        if let d = p.description {
                            Text("— \(d)").font(.caption2).foregroundColor(.secondary)
                        }
                    }
                }
            }
        }
        .onAppear(perform: syncPolicy)
    }

    private func syncPolicy() {
        policy = AuthorizationPolicy(intents: Array(selectedIntents).sorted(), rate: nil, topics: [])
    }
}
