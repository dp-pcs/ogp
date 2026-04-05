# Building OGP Monitor for Distribution

## Method 1: Xcode Archive (Recommended)

This creates a properly signed, optimized release build.

### Steps in Xcode:

1. **Select Target Device**
   - At the top of Xcode, click the device selector
   - Choose "Any Mac" (not a specific simulator)

2. **Create Archive**
   - Menu: **Product → Archive**
   - Wait for build to complete
   - Xcode Organizer window will open

3. **Distribute App**
   - Click "Distribute App"
   - Select "Copy App"
   - Choose destination folder (e.g., Desktop)
   - Click "Export"

4. **Install**
   - Copy `OGPMonitor.app` to `/Applications`
   - Launch from Applications folder or Spotlight

## Method 2: Command Line Build

Build from terminal:

```bash
cd macos-menubar-app

# Build Release version
xcodebuild -project OGPMonitor.xcodeproj \
           -scheme OGPMonitor \
           -configuration Release \
           clean build

# Find the built app
open ~/Library/Developer/Xcode/DerivedData/OGPMonitor-*/Build/Products/Release/
```

The `OGPMonitor.app` will be in that directory. Copy it to `/Applications`.

## Method 3: Quick Script

```bash
#!/bin/bash
cd macos-menubar-app

# Build Release
xcodebuild -project OGPMonitor.xcodeproj \
           -scheme OGPMonitor \
           -configuration Release \
           clean build

# Find and copy to Applications
APP_PATH=$(find ~/Library/Developer/Xcode/DerivedData/OGPMonitor-*/Build/Products/Release -name "OGPMonitor.app" -type d | head -1)

if [ -n "$APP_PATH" ]; then
    echo "Built app found at: $APP_PATH"
    cp -R "$APP_PATH" /Applications/
    echo "✓ Installed to /Applications/OGPMonitor.app"
    open /Applications/OGPMonitor.app
else
    echo "❌ Build failed or app not found"
fi
```

## Signing Notes

The app is currently configured with:
- **Code Sign Style**: Automatic
- **Development Team**: "" (empty - local signing only)

For distribution outside your Mac:
1. You'll need an Apple Developer account
2. Update DEVELOPMENT_TEAM in project settings
3. Configure proper signing certificates

For local use only, the current "Sign to Run Locally" is sufficient.

## Running the Built App

After copying to `/Applications`:

```bash
# Launch the app
open /Applications/OGPMonitor.app

# Or from Spotlight: Press ⌘+Space, type "OGP Monitor"
```

The app will:
- Appear in your menu bar (look for the OGP glyph)
- Run in the background (no dock icon due to `LSUIElement = YES`)
- Auto-refresh OGP status every 5 seconds

## Uninstalling

```bash
# Remove the app
rm -rf /Applications/OGPMonitor.app

# Kill any running instances
pkill -f OGPMonitor
```

## Troubleshooting

**"OGPMonitor.app is damaged and can't be opened"**
- This happens with unsigned apps on some macOS versions
- Right-click the app → Open (first time only)
- Or disable Gatekeeper temporarily:
  ```bash
  sudo spctl --master-disable
  # Install app, then re-enable:
  sudo spctl --master-enable
  ```

**App doesn't appear in menu bar**
- Check System Settings → Desktop & Dock → "Automatically hide and show the menu bar"
- Ensure OGP is configured (`ogp setup`)
- Check Console.app for error messages

**Multiple instances running**
- The app doesn't prevent multiple instances currently
- To kill all: `pkill -f OGPMonitor`
