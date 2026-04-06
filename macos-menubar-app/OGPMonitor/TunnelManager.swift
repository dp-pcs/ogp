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
        // Use pgrep instead of ps - more reliable for finding processes
        let pgrepOutput = runShellCommand("/usr/bin/pgrep", arguments: ["-lf", "cloudflared"])

        // Quick check: is cloudflared even running?
        guard !pgrepOutput.isEmpty && pgrepOutput.contains("cloudflared") else {
            print("⚠️ No cloudflared process found (pgrep)")
            return false
        }

        print("✓ Cloudflared process detected: \(pgrepOutput.trimmingCharacters(in: .whitespacesAndNewlines))")

        // Check if free tunnel with --url flag
        if pgrepOutput.contains("--url http://localhost:\(port)") {
            print("✓ Found cloudflared free tunnel on port \(port)")
            return true
        }

        // Check if named tunnel - if any cloudflared is running, check config
        if pgrepOutput.contains("tunnel run") {
            if let config = parseCloudflaredConfig() {
                let serves = tunnelServesPort(config: config, port: port)
                if serves {
                    print("✓ Found cloudflared named tunnel serving port \(port)")
                    return true
                }
            }
        }

        print("⚠️ Cloudflared running but not serving port \(port)")
        return false
    }

    private func isNgrokRunning(forPort port: Int) -> Bool {
        let output = runShellCommand("/usr/bin/pgrep", arguments: ["-lf", "ngrok"])
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
        // List available tunnels - find cloudflared first
        guard let cloudflaredPath = findCommand("cloudflared") else {
            return nil
        }

        let output = runShellCommand(cloudflaredPath, arguments: ["tunnel", "list"])

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
        guard let config = try? String(contentsOfFile: configPath, encoding: .utf8) else {
            print("⚠️ Could not read cloudflared config at \(configPath)")
            return nil
        }
        print("✓ Loaded cloudflared config (\(config.count) bytes)")
        return config
    }

    private func tunnelServesPort(config: String, port: Int) -> Bool {
        let searchString = "http://localhost:\(port)"
        let found = config.contains(searchString)
        print("Looking for '\(searchString)' in config: \(found ? "FOUND" : "NOT FOUND")")
        return found
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
        let services = runShellCommand("/bin/launchctl", arguments: ["list"])
        if services.contains("cloudflare") {
            // Try to start via launchctl
            _ = runShellCommand("/bin/launchctl", arguments: ["start", "com.cloudflare.cloudflared"])
        } else {
            // Start manually in background - find cloudflared in common locations
            let cloudflaredPath = findCommand("cloudflared") ?? "/usr/local/bin/cloudflared"
            runCommandInBackground(cloudflaredPath, arguments: ["tunnel", "run", name])
        }
    }

    private func startCloudflareFree() {
        let cloudflaredPath = findCommand("cloudflared") ?? "/usr/local/bin/cloudflared"
        runCommandInBackground(cloudflaredPath, arguments: ["tunnel", "--url", "http://localhost:\(ogpPort)"])
    }

    private func startNgrok() {
        let ngrokPath = findCommand("ngrok") ?? "/usr/local/bin/ngrok"
        runCommandInBackground(ngrokPath, arguments: ["http", "\(ogpPort)"])
    }

    private func findCommand(_ command: String) -> String? {
        let paths = [
            "/usr/local/bin/\(command)",
            "/opt/homebrew/bin/\(command)",
            "/usr/bin/\(command)"
        ]

        for path in paths {
            if FileManager.default.fileExists(atPath: path) {
                return path
            }
        }

        return nil
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

            // Add timeout to prevent hanging
            var hasExited = false

            DispatchQueue.global().async {
                task.waitUntilExit()
                hasExited = true
            }

            // Wait up to 2 seconds
            Thread.sleep(forTimeInterval: 0.1)
            var waited = 0.0
            while !hasExited && waited < 2.0 {
                Thread.sleep(forTimeInterval: 0.1)
                waited += 0.1
            }

            if !hasExited {
                task.terminate()
                return ""
            }

            let data = pipe.fileHandleForReading.readDataToEndOfFile()
            return String(data: data, encoding: .utf8) ?? ""
        } catch {
            print("⚠️ Shell command error: \(error)")
            return ""
        }
    }

    private func runCommandInBackground(_ command: String, arguments: [String]) {
        let task = Process()
        task.launchPath = command
        task.arguments = arguments

        do {
            try task.run()
            print("✓ Started \(command) with args: \(arguments.joined(separator: " "))")
        } catch {
            print("⚠️ Failed to start \(command): \(error)")
        }
    }
}
