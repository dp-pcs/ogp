#!/bin/bash

# Build script for OGP Monitor macOS app

set -e

echo "🔨 Building OGP Monitor..."

# Build the app using xcodebuild
xcodebuild -project OGPMonitor.xcodeproj \
    -scheme OGPMonitor \
    -configuration Release \
    -derivedDataPath build \
    clean build

echo "✅ Build complete!"
echo ""
echo "Built app location:"
echo "  build/Build/Products/Release/OGPMonitor.app"
echo ""
echo "To install:"
echo "  cp -R build/Build/Products/Release/OGPMonitor.app /Applications/"
echo ""
echo "Then run from Applications folder or Spotlight."
