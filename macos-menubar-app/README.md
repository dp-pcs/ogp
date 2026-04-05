# OGP Menu Bar Monitor

A lightweight macOS menu bar app for monitoring OGP (Open Gateway Protocol) status.

## Features

- **Status Indicator**: Color-coded dot in menu bar
  - 🟢 Green: Everything running normally (daemon + tunnel)
  - 🟡 Yellow: Partial service (daemon running, tunnel down)
  - 🔴 Red: Daemon not running

- **Smart Tunnel Detection**:
  - Detects any tunnel serving the OGP port (18790)
  - Supports Cloudflare named tunnels, free tunnels, and ngrok
  - Shows green even if tunnel method differs from original setup

- **Quick Info Panel**:
  - Daemon status (running/stopped) with start/stop button
  - Tunnel status (running/stopped) with start/stop button
  - Federation peer count
  - Expandable peer list showing:
    - Peer display name/alias
    - Granted intents
    - Last communication time
    - Gateway URL

- **Tunnel Selection**:
  - When starting a tunnel, shows available options:
    - Named Cloudflare tunnels (with hostname)
    - Free anonymous Cloudflare tunnel
    - ngrok (if installed)
  - Auto-detects which tunnels serve the OGP port

- **Quick Actions**:
  - Start/Stop OGP daemon
  - Start/Stop tunnel (with selection menu)
  - Open full OGP status in terminal

## How It Works

The app monitors OGP by:
- Checking if the daemon process is running (via PID file)
- Detecting ANY tunnel serving the OGP port:
  - Cloudflare named tunnels (via process check + config parsing)
  - Free Cloudflare tunnels (via process check)
  - ngrok tunnels (via process check)
- Reading `~/.ogp/peers.json` for federation peer information
- Parsing `~/.cloudflared/config.yml` to identify which tunnels serve port 18790

When starting a tunnel:
- Lists all available named Cloudflare tunnels (via `cloudflared tunnel list`)
- Parses configs to show which ones serve the OGP port
- Provides options for free Cloudflare and ngrok
- Starts the selected tunnel in the background

## Building

This is a native Swift/SwiftUI app for macOS 13.0+.

1. Open the Xcode project
2. Build and run (⌘+R)

## Installation

After building:
1. Copy the app to `/Applications`
2. Grant necessary permissions when prompted
3. The app will appear in your menu bar

## Requirements

- macOS 13.0 or later
- OGP installed (`npm install -g @dp-pcs/ogp`)
- OGP configured (`ogp setup`)
