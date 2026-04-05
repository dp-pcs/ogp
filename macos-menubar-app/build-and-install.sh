#!/bin/bash
set -euo pipefail

echo "🔨 Building OGP Monitor (Release)..."

cd "$(dirname "$0")"

# Build Release configuration
xcodebuild -project OGPMonitor.xcodeproj \
           -scheme OGPMonitor \
           -configuration Release \
           clean build \
           2>&1 | grep -E "BUILD (SUCCEEDED|FAILED)|error:|warning:" || true

# Find the built app
APP_PATH=$(find ~/Library/Developer/Xcode/DerivedData/OGPMonitor-*/Build/Products/Release -name "OGPMonitor.app" -type d 2>/dev/null | head -1)

if [ -z "$APP_PATH" ]; then
    echo "❌ Build failed or app not found"
    exit 1
fi

echo ""
echo "✓ Build successful: $APP_PATH"
echo ""

# Ask before installing
read -p "Install to /Applications? (y/n) " -n 1 -r
echo

if [[ $REPLY =~ ^[Yy]$ ]]; then
    # Kill any running instances
    pkill -f OGPMonitor 2>/dev/null || true

    # Copy to Applications
    cp -R "$APP_PATH" /Applications/
    echo "✓ Installed to /Applications/OGPMonitor.app"
    echo ""

    # Ask to launch
    read -p "Launch now? (y/n) " -n 1 -r
    echo

    if [[ $REPLY =~ ^[Yy]$ ]]; then
        open /Applications/OGPMonitor.app
        echo "✓ Launched OGP Monitor"
        echo "  Look for the OGP icon in your menu bar"
    fi
else
    echo "App built but not installed. You can find it at:"
    echo "$APP_PATH"
fi
