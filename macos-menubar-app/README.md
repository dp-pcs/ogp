# OGP Menu Bar Monitor

A lightweight macOS menu bar app for monitoring OGP (Open Gateway Protocol) status.

## Features

- **Status Indicator**: Color-coded dot in menu bar
  - 🟢 Green: Everything running normally
  - 🟡 Yellow: Partial service (daemon running, tunnel down)
  - 🔴 Red: Daemon not running

- **Quick Info Panel**:
  - Daemon status (running/stopped)
  - Tunnel status (running/stopped) with restart button
  - Federation peer count
  - Expandable peer list showing:
    - Peer display name/alias
    - Granted intents
    - Last communication time

- **Quick Actions**:
  - Start/Stop OGP daemon
  - Start/Stop tunnel
  - Open full OGP status in terminal

## How It Works

The app monitors OGP by:
- Running `ogp status` to check daemon status
- Reading `~/.ogp/peers.json` for peer information
- Checking `~/.ogp/tunnel.pid` for tunnel status
- Executing `ogp` CLI commands for quick actions

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
