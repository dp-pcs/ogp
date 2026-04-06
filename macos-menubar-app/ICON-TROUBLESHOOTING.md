# Icon Troubleshooting

## Issue: App Shows Generic Icon

If the OGP Monitor app shows a generic document icon instead of the OGP brand icon, this is usually due to macOS icon caching.

### Quick Fix

Run the build script which automatically clears the icon cache:

```bash
./build-and-install.sh
```

This script will:
1. Build the app with assets
2. Clear the old app from `/Applications`
3. Install the new version
4. Clear macOS icon cache
5. Restart the Dock

### Manual Fix

If you need to manually fix icon caching:

```bash
# Kill any running instances
pkill -f OGPMonitor

# Remove old app
rm -rf /Applications/OGPMonitor.app

# Copy new build (replace path with your actual build path)
cp -R ~/Library/Developer/Xcode/DerivedData/OGPMonitor-*/Build/Products/Release/OGPMonitor.app /Applications/

# Clear user icon cache
rm -rf ~/Library/Caches/com.apple.iconservices*

# Touch the app to update timestamp
touch /Applications/OGPMonitor.app

# Restart Dock to refresh icon cache
killall Dock

# Wait for Dock to restart
sleep 2

# Launch the app
open /Applications/OGPMonitor.app
```

### Advanced: Clear System Icon Cache (requires sudo)

If the user-level cache clearing doesn't work:

```bash
# Clear system-wide icon cache
sudo rm -rf /Library/Caches/com.apple.iconservices.store

# Restart Finder and Dock
killall Finder
killall Dock
```

## Verifying the Icon is Bundled

Check if the icon file exists in the app bundle:

```bash
ls -lh /Applications/OGPMonitor.app/Contents/Resources/

# You should see:
# AppIcon.icns    (~132KB)
# Assets.car      (~21MB)
```

If `AppIcon.icns` is missing, the app wasn't built with the Resources build phase. Rebuild using Xcode or the build script.

## Technical Background

### The Problem That Was Fixed

Initially, the Xcode project was missing a **Resources build phase**, so the asset catalog wasn't being copied into the app bundle. Even though the assets existed in the project, they weren't included in the compiled `.app`.

### The Fix

Added to `project.pbxproj`:
1. `PBXBuildFile` entry for `Assets.xcassets in Resources`
2. `PBXResourcesBuildPhase` section
3. Resources phase reference in `buildPhases` array

Result: `actool` now compiles the asset catalog and generates `AppIcon.icns` during build.

### Icon Cache Behavior

macOS caches app icons at multiple levels:
- **User cache**: `~/Library/Caches/com.apple.iconservices*`
- **System cache**: `/Library/Caches/com.apple.iconservices.store`
- **Launch Services database**: Updated when app is modified

Simply replacing the app file doesn't always clear these caches. The `touch` command updates the modification timestamp, triggering Launch Services to re-index the app, and killing the Dock forces it to reload icons from the refreshed caches.

## Common Mistakes

**Don't:**
- ❌ Just copy the new app without removing the old one
- ❌ Forget to restart the Dock after clearing caches
- ❌ Skip the `touch` command after installing

**Do:**
- ✅ Use the build script (handles everything correctly)
- ✅ Verify icon exists in app bundle before troubleshooting
- ✅ Close the app before reinstalling
