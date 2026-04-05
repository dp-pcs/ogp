import Foundation

class OGPService: ObservableObject {
    @Published var status: OGPStatus = .empty
    @Published var config: OGPConfig = .default
    @Published var showTunnelSelection: Bool = false
    @Published var tunnelOptions: [TunnelOption] = []

    private var timer: Timer?
    private let fileManager = FileManager.default
    private let ogpConfigPath: String
    private let ogpPeersPath: String
    private let daemonPidPath: String
    private var tunnelManager: TunnelManager?

    init() {
        let homeDir = fileManager.homeDirectoryForCurrentUser.path
        let ogpDir = "\(homeDir)/.ogp"
        self.ogpConfigPath = "\(ogpDir)/config.json"
        self.ogpPeersPath = "\(ogpDir)/peers.json"
        self.daemonPidPath = "\(ogpDir)/daemon.pid"

        loadConfig()
        refreshStatus()
        startPolling()
    }

    deinit {
        timer?.invalidate()
    }

    // MARK: - Polling

    private func startPolling() {
        // Refresh every 5 seconds
        timer = Timer.scheduledTimer(withTimeInterval: 5.0, repeats: true) { [weak self] _ in
            self?.refreshStatus()
        }
    }

    func refreshStatus() {
        let daemon = checkDaemonStatus()
        let tunnel = checkTunnelStatus()
        let peers = loadPeers()

        DispatchQueue.main.async {
            self.status = OGPStatus(
                daemonStatus: daemon,
                tunnelStatus: tunnel,
                peerCount: peers.count,
                peers: peers
            )
        }
    }

    // MARK: - Config

    private func loadConfig() {
        guard let data = try? Data(contentsOf: URL(fileURLWithPath: ogpConfigPath)),
              let config = try? JSONDecoder().decode(OGPConfig.self, from: data) else {
            return
        }

        DispatchQueue.main.async {
            self.config = config
            // Initialize tunnel manager with the OGP port
            self.tunnelManager = TunnelManager(ogpPort: config.daemonPort)
        }
    }

    // MARK: - Status Checking

    private func checkDaemonStatus() -> ServiceStatus {
        // Check if daemon PID file exists
        guard fileManager.fileExists(atPath: daemonPidPath),
              let pidString = try? String(contentsOfFile: daemonPidPath, encoding: .utf8),
              let pid = Int(pidString.trimmingCharacters(in: .whitespacesAndNewlines)) else {
            return .stopped
        }

        // Check if process is running
        let task = Process()
        task.launchPath = "/bin/ps"
        task.arguments = ["-p", "\(pid)"]

        let pipe = Pipe()
        task.standardOutput = pipe
        task.standardError = pipe

        do {
            try task.run()
            task.waitUntilExit()

            let data = pipe.fileHandleForReading.readDataToEndOfFile()
            let output = String(data: data, encoding: .utf8) ?? ""

            // If output contains the PID, process is running
            return output.contains("\(pid)") ? .running : .stopped
        } catch {
            return .stopped
        }
    }

    private func checkTunnelStatus() -> ServiceStatus {
        // Use TunnelManager to detect any tunnel serving the OGP port
        guard let manager = tunnelManager else {
            return .stopped
        }

        return manager.detectRunningTunnel() ? .running : .stopped
    }

    private func loadPeers() -> [Peer] {
        guard fileManager.fileExists(atPath: ogpPeersPath),
              let data = try? Data(contentsOf: URL(fileURLWithPath: ogpPeersPath)),
              let peers = try? JSONDecoder().decode([Peer].self, from: data) else {
            return []
        }

        // Only return approved peers
        return peers.filter { $0.status == "approved" }
    }

    // MARK: - Actions

    func startDaemon() {
        runCommand("ogp", arguments: ["start", "--background"])

        // Wait a moment then refresh
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
            self.refreshStatus()
        }
    }

    func stopDaemon() {
        runCommand("ogp", arguments: ["stop"])

        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
            self.refreshStatus()
        }
    }

    func promptTunnelSelection() {
        guard let manager = tunnelManager else { return }

        let options = manager.getAvailableTunnels()

        DispatchQueue.main.async {
            self.tunnelOptions = options
            self.showTunnelSelection = true
        }
    }

    func startTunnel(_ option: TunnelOption) {
        guard let manager = tunnelManager else { return }

        manager.startTunnel(option)

        DispatchQueue.main.async {
            self.showTunnelSelection = false
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) {
            self.refreshStatus()
        }
    }

    func stopTunnel() {
        guard let manager = tunnelManager else { return }

        manager.stopTunnel()

        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
            self.refreshStatus()
        }
    }

    func openTerminalStatus() {
        // Open terminal and run ogp status
        let script = """
        tell application "Terminal"
            activate
            do script "ogp status"
        end tell
        """

        if let appleScript = NSAppleScript(source: script) {
            appleScript.executeAndReturnError(nil)
        }
    }

    // MARK: - Helpers

    private func runCommand(_ command: String, arguments: [String]) {
        // Find ogp in common locations (GUI apps don't inherit shell PATH)
        let commonPaths = [
            "/opt/homebrew/bin/ogp",
            "/usr/local/bin/ogp",
            "\(fileManager.homeDirectoryForCurrentUser.path)/.npm-global/bin/ogp",
            "\(fileManager.homeDirectoryForCurrentUser.path)/.nvm/versions/node/*/bin/ogp"
        ]

        var ogpPath: String?
        for path in commonPaths {
            if path.contains("*") {
                // Handle glob pattern for nvm
                if let matches = try? fileManager.contentsOfDirectory(atPath: path.replacingOccurrences(of: "/*/bin/ogp", with: "")),
                   let nodeVersion = matches.first(where: { $0.hasPrefix("v") }) {
                    let expandedPath = path.replacingOccurrences(of: "*", with: nodeVersion)
                    if fileManager.fileExists(atPath: expandedPath) {
                        ogpPath = expandedPath
                        break
                    }
                }
            } else if fileManager.fileExists(atPath: path) {
                ogpPath = path
                break
            }
        }

        guard let commandPath = ogpPath else {
            print("Failed to find ogp command in common locations")
            print("Tried: \(commonPaths)")
            return
        }

        let task = Process()
        task.launchPath = commandPath
        task.arguments = arguments

        // Capture output for debugging
        let pipe = Pipe()
        task.standardOutput = pipe
        task.standardError = pipe

        do {
            try task.run()

            // Don't wait for completion since --background commands detach
            if !arguments.contains("--background") {
                task.waitUntilExit()

                let data = pipe.fileHandleForReading.readDataToEndOfFile()
                if let output = String(data: data, encoding: .utf8), !output.isEmpty {
                    print("Command output: \(output)")
                }
            }
        } catch {
            print("Failed to run command: \(error)")
        }
    }
}
