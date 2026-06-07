import SwiftUI
import OGPKit

struct AddGatewayWindow: View {
    @ObservedObject var service: OGPService
    @Environment(\.dismiss) private var dismiss

    enum Step { case destination, name, authorization, connect }
    @State private var step: Step = .destination
    @State private var peerUrl = ""
    @State private var alias = ""
    @State private var pingOk: Bool? = nil
    @State private var personas: [AgentPersona] = []
    @State private var policy = AuthorizationPolicy(intents: ["message", "agent-comms"], rate: nil, topics: [])
    @State private var connecting = false
    @State private var result: String? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Add Gateway — \(stepTitle)").font(.title3).bold()
            Divider()
            content
            Spacer()
            navButtons
        }
        .padding(20)
        .frame(width: 520, height: 420)
    }

    private var stepTitle: String {
        switch step {
        case .destination: return "Destination"
        case .name: return "Name"
        case .authorization: return "Authorization"
        case .connect: return "Connect"
        }
    }

    @ViewBuilder
    private var content: some View {
        switch step {
        case .destination: destinationStep
        case .name: nameStep
        case .authorization:
            AuthorizationStepView(
                personas: personas,
                availableIntents: ["message", "agent-comms", "project.join", "project.contribute"],
                policy: $policy)
        case .connect: connectStep
        }
    }

    private var destinationStep: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Peer gateway URL").font(.caption).foregroundColor(.secondary)
            TextField("https://peer.example.com", text: $peerUrl)
                .textFieldStyle(.roundedBorder)
            Button("Test reachability") {
                let ctx = service.selectedFramework?.context
                    ?? FrameworkContext(framework: nil, stateDir: "")
                pingOk = (try? OGPClient(context: ctx).ping(peerUrl)) ?? false
                fetchPersonas()
            }
            .disabled(peerUrl.isEmpty)
            if let pingOk {
                Text(pingOk ? "✓ reachable" : "✗ unreachable")
                    .foregroundColor(pingOk ? .green : .red).font(.caption)
            }
        }
    }

    private var nameStep: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Local alias for this peer").font(.caption).foregroundColor(.secondary)
            TextField("e.g. cosmo", text: $alias)
                .textFieldStyle(.roundedBorder)
        }
    }

    private var connectStep: some View {
        VStack(alignment: .leading, spacing: 8) {
            if connecting {
                ProgressView("Sending federation request…")
            } else if let result {
                Text(result).font(.callout)
            } else {
                Text("Ready to connect to \(peerUrl)").font(.callout)
                Text("Scopes: \(policy.intents.joined(separator: ", "))")
                    .font(.caption).foregroundColor(.secondary)
            }
        }
    }

    private var navButtons: some View {
        HStack {
            if step != .destination { Button("Back") { back() } }
            Spacer()
            Button("Cancel") { dismiss() }
            Button(step == .connect ? "Connect" : "Next") { next() }
                .keyboardShortcut(.defaultAction)
                .disabled(step == .destination && (peerUrl.isEmpty || pingOk != true))
        }
    }

    private func fetchPersonas() {
        let base = peerUrl.hasSuffix("/") ? "\(peerUrl).well-known/ogp" : "\(peerUrl)/.well-known/ogp"
        guard let url = URL(string: base) else { return }
        URLSession.shared.dataTask(with: url) { data, _, _ in
            guard let data, let wk = try? JSONDecoder().decode(WellKnown.self, from: data) else { return }
            DispatchQueue.main.async { personas = wk.agents ?? [] }
        }.resume()
    }

    private func back() {
        switch step {
        case .name: step = .destination
        case .authorization: step = .name
        case .connect: step = .authorization
        case .destination: break
        }
    }

    private func next() {
        switch step {
        case .destination: step = .name
        case .name: step = .authorization
        case .authorization: step = .connect
        case .connect: connect()
        }
    }

    private func connect() {
        connecting = true
        Task { @MainActor in
            let ctx = service.selectedFramework?.context
                ?? FrameworkContext(framework: nil, stateDir: "")
            let ok = (try? OGPClient(context: ctx).request(
                peerUrl: peerUrl, alias: alias.isEmpty ? nil : alias)) ?? false
            connecting = false
            result = ok
                ? "✓ Federation request sent to \(peerUrl).\nWatch the status popover for approval."
                : "✗ Request failed. Check the URL and that your daemon is running."
            service.refresh()
        }
    }
}
