# OGP Monitor - Development Guide

## Quick Start

### Option 1: Xcode (Recommended)

1. Open `OGPMonitor.xcodeproj` in Xcode
2. Press ⌘+R to build and run
3. The app will appear in your menu bar

### Option 2: Command Line

```bash
./build.sh
```

This builds a release version and tells you where to find the app.

## Project Structure

```
OGPMonitor/
├── OGPMonitorApp.swift    # Main app entry point with MenuBarExtra
├── ContentView.swift      # SwiftUI view for the popup menu
├── OGPService.swift       # Business logic: status checking, commands
└── Models.swift           # Data models for OGP status
```

## How It Works

### Status Monitoring

The app polls OGP status every 5 seconds by:

1. **Daemon Status**: Checks if `~/.ogp/daemon.pid` exists and if the process is running
2. **Tunnel Status**: Checks if `~/.ogp/tunnel.pid` exists and if the process is running
3. **Peer Info**: Reads and parses `~/.ogp/peers.json` to show approved peers

### Status Indicator

- 🟢 **Green**: Both daemon and tunnel running
- 🟡 **Yellow**: Daemon running, tunnel stopped (partial service)
- 🔴 **Red**: Daemon not running

### Actions

Quick actions execute OGP CLI commands:

- **Start/Stop Daemon**: `ogp start --background` / `ogp stop`
- **Start/Stop Tunnel**: `ogp expose --background` / `ogp expose stop`
- **Terminal Status**: Opens Terminal.app and runs `ogp status`

## Development Notes

### Requirements

- macOS 13.0+ (for MenuBarExtra API)
- Xcode 14.0+
- Swift 5.0+

### Key Technologies

- **SwiftUI**: Modern declarative UI framework
- **MenuBarExtra**: Native menu bar app support (macOS 13+)
- **Process**: Executing shell commands and checking PIDs
- **FileManager**: Reading OGP config and state files
- **Codable**: JSON parsing for config and peers

### File Paths

All OGP state is stored in `~/.ogp/`:
- `config.json` - OGP configuration
- `peers.json` - Federation peer list
- `daemon.pid` - Daemon process ID
- `tunnel.pid` - Tunnel process ID

### Polling Strategy

The app uses a 5-second polling interval to balance responsiveness with CPU usage. This could be optimized using:

- File system events (FSEvents) to watch for changes
- Longer polling intervals (10-15s) if battery life is a concern
- On-demand refresh only when menu is opened

## Future Enhancements

Potential improvements for a fuller companion app:

1. **Notifications**: macOS notifications for peer requests
2. **Peer Management**: Approve/reject requests from the UI
3. **Message History**: View recent federation messages
4. **Launch at Login**: Auto-start preference
5. **Settings Panel**: Configure refresh interval, notifications
6. **Tunnel Auto-Recovery**: Auto-restart tunnel if it crashes
7. **Network Monitoring**: Detect internet connectivity issues
8. **Activity Log**: Show recent OGP events
9. **Peer Search**: Filter/search peer list
10. **Quick Send**: Send messages to peers from menu

## Troubleshooting

### "ogp: command not found"

The app uses `/usr/bin/which` to find the `ogp` command in PATH. If OGP is installed via npm globally, it should be in `/usr/local/bin/ogp` or `~/.npm-global/bin/ogp`.

If commands don't work, ensure `ogp` is accessible:

```bash
which ogp
# Should output: /usr/local/bin/ogp or similar
```

### App doesn't appear in menu bar

1. Check that the app is actually running (Activity Monitor)
2. Verify macOS version is 13.0+ (MenuBarExtra requires this)
3. Try quitting and relaunching

### Status not updating

1. Check that OGP files exist in `~/.ogp/`
2. Verify file permissions allow reading
3. Check Console.app for any error messages from OGPMonitor

## Contributing

This is a lightweight reference implementation. Feel free to:

- Add features from the "Future Enhancements" list
- Improve the UI/UX
- Optimize performance
- Add error handling and edge cases
- Submit PRs to the main OGP repo
