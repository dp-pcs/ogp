# OGP Monitor - Quick Start

A lightweight macOS menu bar app for monitoring your OGP federation status at a glance.

## What You Get

**Menu Bar Indicator:**
- 🟢 Green: Everything running smoothly
- 🟡 Yellow: Daemon running, tunnel down
- 🔴 Red: Daemon stopped

**Click to View:**
- Daemon status (running/stopped) with start/stop button
- Tunnel status (running/stopped) with start/stop button
- Number of federated peers
- Expandable peer list showing:
  - Peer display name
  - Granted intents
  - Last communication time
  - Gateway URL

**Quick Actions:**
- Start/Stop daemon
- Start/Stop tunnel
- Open full status in Terminal
- Quit app

## Prerequisites

1. **OGP installed and configured**:
   ```bash
   npm install -g @dp-pcs/ogp
   ogp setup
   ```

2. **macOS 13.0 or later** (for MenuBarExtra support)

3. **Xcode 14.0+** (to build the app)

## Build & Run

### From Xcode (Easiest)

1. Open the project:
   ```bash
   cd macos-menubar-app
   open OGPMonitor.xcodeproj
   ```

2. Press **⌘+R** to build and run

3. The app icon will appear in your menu bar!

### From Command Line

```bash
cd macos-menubar-app
./build.sh
```

Then copy to Applications:
```bash
cp -R build/Build/Products/Release/OGPMonitor.app /Applications/
```

Launch from Spotlight (⌘+Space, type "OGPMonitor") or Applications folder.

## First Run

When you first launch the app:

1. Look for a colored dot in your menu bar (far right)
2. Click it to see the status popup
3. If daemon isn't running, click "Start" next to Daemon
4. If you use tunnels, click "Start" next to Tunnel
5. Your federated peers will appear in the list

## Using the App

**View Status:**
- Click the menu bar icon anytime to see current status

**Start/Stop Services:**
- Click "Start" or "Stop" buttons next to Daemon/Tunnel
- Changes take effect immediately (app refreshes after 1 second)

**View Peer Details:**
- Click the chevron (▸) next to any peer name to expand
- Shows intents you've granted them and their gateway URL
- Click again to collapse

**Full Terminal Status:**
- Click "Terminal Status" to open Terminal.app
- Runs `ogp status` for complete information

**Refresh:**
- Click "Refresh" button to update immediately
- App auto-refreshes every 5 seconds

## Troubleshooting

### App doesn't show in menu bar

- Verify macOS version: `sw_vers -productVersion` (needs 13.0+)
- Check Activity Monitor to confirm app is running
- Restart the app

### Commands don't work

Ensure `ogp` is in your PATH:
```bash
which ogp
```

Should show something like `/usr/local/bin/ogp`.

If not found, OGP may need reinstalling:
```bash
npm install -g @dp-pcs/ogp
```

### No peers showing

- Check that you have approved peers: `ogp federation list --status approved`
- Verify `~/.ogp/peers.json` exists and is readable
- The app only shows **approved** peers, not pending ones

### Status shows "Unknown"

- Run `ogp status` in terminal to see full details
- Check that `~/.ogp/` directory exists with proper permissions
- Verify OGP is properly configured: `cat ~/.ogp/config.json`

## What This Doesn't Do (Yet)

This is a **status monitor**, not a full management UI. It doesn't (currently):

- Approve/reject federation requests (use `ogp federation approve/reject`)
- Send messages to peers (use `ogp federation send`)
- Show message history
- Display notifications for incoming requests
- Manage OGP configuration

For those features, use the `ogp` CLI or wait for the full companion app!

## Next Steps

Once you've got the app running:

1. **Keep it running**: Add to Login Items (System Settings → General → Login Items)
2. **Monitor federation**: Watch the peer count grow as you federate
3. **Quick health checks**: Glance at the menu bar icon for instant status
4. **Restart services**: Use the built-in buttons instead of terminal commands

Enjoy your OGP monitoring! 🎉
