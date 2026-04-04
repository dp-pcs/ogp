import Foundation

class OGPService: ObservableObject {
    @Published var status: OGPStatus = .empty
    @Published var config: OGPConfig = .default

    private var timer: Timer?
    private let fileManager = FileManager.default
    private let ogpConfigPath: String
    private let ogpPeersPath: String
    private let tunnelPidPath: String
    private let daemonPidPath: String

    init() {
        let homeDir = fileManager.homeDirectoryForCurrentUser.path
        let ogpDir = "\(homeDir)/.ogp"
        self.ogpConfigPath = "\(ogpDir)/config.json"
        self.ogpPeersPath = "\(ogpDir)/peers.json"
        self.tunnelPidPath = "\(ogpDir)/tunnel.pid"
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
        // Check if tunnel PID file exists
        guard fileManager.fileExists(atPath: tunnelPidPath),
              let pidString = try? String(contentsOfFile: tunnelPidPath, encoding: .utf8),
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

            return output.contains("\(pid)") ? .running : .stopped
        } catch {
            return .stopped
        }
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

    func startTunnel() {
        runCommand("ogp", arguments: ["expose", "--background"])

        DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
            self.refreshStatus()
        }
    }

    func stopTunnel() {
        runCommand("ogp", arguments: ["expose", "stop"])

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
        let task = Process()

        // Find ogp in PATH
        let whichTask = Process()
        whichTask.launchPath = "/usr/bin/which"
        whichTask.arguments = [command]

        let pipe = Pipe()
        whichTask.standardOutput = pipe

        do {
            try whichTask.run()
            whichTask.waitUntilExit()

            let data = pipe.fileHandleForReading.readDataToEndOfFile()
            if let commandPath = String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines),
               !commandPath.isEmpty {
                task.launchPath = commandPath
                task.arguments = arguments
                try task.run()
            }
        } catch {
            print("Failed to run command: \(error)")
        }
    }
}
