import Foundation

struct TunnelOption: Identifiable, Hashable {
    let id = UUID()
    let name: String
    let type: TunnelType
    let config: String?  // Config details (e.g., tunnel name, hostname)

    enum TunnelType {
        case cloudflareNamed
        case cloudflareFree
        case ngrok
    }
}

class TunnelManager {
    private let fileManager = FileManager.default
    private let ogpPort: Int

    init(ogpPort: Int) {
        self.ogpPort = ogpPort
    }

    // MARK: - Detection

    func detectRunningTunnel() -> Bool {
        // Check if any cloudflared or ngrok process is serving our port
        return isCloudflaredRunning(forPort: ogpPort) || isNgrokRunning(forPort: ogpPort)
    }

    private func isCloudflaredRunning(forPort port: Int) -> Bool {
        // Check for cloudflared processes
        let output = runShellCommand("ps", arguments: ["aux"])
        let lines = output.components(separatedBy: "\n")

        for line in lines {
            if line.contains("cloudflared") && !line.contains("grep") {
                // Check if this cloudflared is serving our port
                // Either via --url flag or via config
                if line.contains("--url http://localhost:\(port)") {
                    return true
                }

                // Check if it's a named tunnel that serves our port
                if line.contains("tunnel run") {
                    // Parse config to see if this tunnel serves our port
                    if let config = parseCloudflaredConfig(),
                       tunnelServesPort(config: config, port: port) {
                        return true
                    }
                }
            }
        }

        return false
    }

    private func isNgrokRunning(forPort port: Int) -> Bool {
        let output = runShellCommand("ps", arguments: ["aux"])
        return output.contains("ngrok") && output.contains("http \(port)")
    }

    // MARK: - Available Options

    func getAvailableTunnels() -> [TunnelOption] {
        var options: [TunnelOption] = []

        // Cloudflare named tunnels
        if let namedTunnels = getCloudflareNamedTunnels() {
            options.append(contentsOf: namedTunnels)
        }

        // Free Cloudflare tunnel
        options.append(TunnelOption(
            name: "Free Cloudflare Tunnel",
            type: .cloudflareFree,
            config: nil
        ))

        // ngrok
        if isNgrokInstalled() {
            options.append(TunnelOption(
                name: "ngrok",
                type: .ngrok,
                config: nil
            ))
        }

        return options
    }

    private func getCloudflareNamedTunnels() -> [TunnelOption]? {
        // List available tunnels
        let output = runShellCommand("cloudflared", arguments: ["tunnel", "list"])

        guard !output.isEmpty && !output.contains("error") else {
            return nil
        }

        var tunnels: [TunnelOption] = []
        let lines = output.components(separatedBy: "\n")

        // Parse tunnel list (skip header lines)
        for line in lines {
            let parts = line.split(separator: " ", omittingEmptySubsequences: true)
            if parts.count >= 2 && !line.contains("ID") && !line.contains("obtain more") {
                let tunnelName = String(parts[1])

                // Check if this tunnel serves our port
                if let config = parseCloudflaredConfig(),
                   let hostname = getHostnameForPort(config: config, port: ogpPort) {
                    tunnels.append(TunnelOption(
                        name: "\(tunnelName) → \(hostname)",
                        type: .cloudflareNamed,
                        config: tunnelName
                    ))
                } else {
                    // Include it anyway, but note it doesn't serve OGP port
                    tunnels.append(TunnelOption(
                        name: "\(tunnelName) (not configured for port \(ogpPort))",
                        type: .cloudflareNamed,
                        config: tunnelName
                    ))
                }
            }
        }

        return tunnels.isEmpty ? nil : tunnels
    }

    // MARK: - Config Parsing

    private func parseCloudflaredConfig() -> String? {
        let configPath = "\(fileManager.homeDirectoryForCurrentUser.path)/.cloudflared/config.yml"
        return try? String(contentsOfFile: configPath, encoding: .utf8)
    }

    private func tunnelServesPort(config: String, port: Int) -> Bool {
        return config.contains("http://localhost:\(port)")
    }

    private func getHostnameForPort(config: String, port: Int) -> String? {
        let lines = config.components(separatedBy: "\n")

        for (index, line) in lines.enumerated() {
            if line.contains("http://localhost:\(port)") {
                // Look backwards for the hostname
                for i in (0..<index).reversed() {
                    if lines[i].contains("hostname:") {
                        return lines[i]
                            .replacingOccurrences(of: "hostname:", with: "")
                            .trimmingCharacters(in: .whitespaces)
                    }
                }
            }
        }

        return nil
    }

    private func isNgrokInstalled() -> Bool {
        let output = runShellCommand("which", arguments: ["ngrok"])
        return !output.isEmpty
    }

    // MARK: - Start/Stop

    func startTunnel(_ option: TunnelOption) {
        switch option.type {
        case .cloudflareNamed:
            if let tunnelName = option.config {
                startCloudflareNamedTunnel(tunnelName)
            }
        case .cloudflareFree:
            startCloudflareFree()
        case .ngrok:
            startNgrok()
        }
    }

    func stopTunnel() {
        // Kill all cloudflared and ngrok processes
        _ = runShellCommand("pkill", arguments: ["cloudflared"])
        _ = runShellCommand("pkill", arguments: ["ngrok"])
    }

    private func startCloudflareNamedTunnel(_ name: String) {
        // Check if there's a launchctl service
        let services = runShellCommand("launchctl", arguments: ["list"])
        if services.contains("cloudflare") {
            // Try to start via launchctl
            _ = runShellCommand("launchctl", arguments: ["start", "com.cloudflare.cloudflared"])
        } else {
            // Start manually in background
            runCommandInBackground("cloudflared", arguments: ["tunnel", "run", name])
        }
    }

    private func startCloudflareFree() {
        runCommandInBackground("cloudflared", arguments: ["tunnel", "--url", "http://localhost:\(ogpPort)"])
    }

    private func startNgrok() {
        runCommandInBackground("ngrok", arguments: ["http", "\(ogpPort)"])
    }

    // MARK: - Shell Helpers

    @discardableResult
    private func runShellCommand(_ command: String, arguments: [String]) -> String {
        let task = Process()
        task.launchPath = "/usr/bin/env"
        task.arguments = [command] + arguments

        let pipe = Pipe()
        task.standardOutput = pipe
        task.standardError = pipe

        do {
            try task.run()
            task.waitUntilExit()

            let data = pipe.fileHandleForReading.readDataToEndOfFile()
            return String(data: data, encoding: .utf8) ?? ""
        } catch {
            return ""
        }
    }

    private func runCommandInBackground(_ command: String, arguments: [String]) {
        let task = Process()
        task.launchPath = "/usr/bin/env"
        task.arguments = [command] + arguments

        do {
            try task.run()
        } catch {
            print("Failed to start \(command): \(error)")
        }
    }
}
