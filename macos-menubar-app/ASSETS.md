# OGP Monitor - Asset Integration Guide

This document describes the asset requirements for the OGP Monitor macOS app.

## Asset Catalog Structure

The app uses `Assets.xcassets` with the following image sets:

### Required Assets

#### 1. App Icon (`AppIcon.appiconset`)

macOS app icon at multiple sizes:
- `icon-16.png` (16x16px)
- `icon-32.png` (32x32px)
- `icon-64.png` (64x64px)
- `icon-128.png` (128x128px)
- `icon-256.png` (256x256px)
- `icon-512.png` (512x512px)
- `icon-1024.png` (1024x1024px)

**Purpose**: Dock icon and Finder representation of the app.

#### 2. Status Glyph (`OGPStatusGlyph.imageset`)

Menu bar status indicator (monochrome, template rendering):
- `ogp-status-glyph.png` (@1x)
- `ogp-status-glyph@2x.png` (@2x)
- `ogp-status-glyph@3x.png` (@3x)

**Purpose**: Shown in macOS menu bar. The glyph is rendered as a template image and automatically tinted based on OGP status:
- 🟢 Green: Daemon + Tunnel running
- 🟡 Yellow: Daemon running, Tunnel down
- 🔴 Red: Daemon stopped

**Rendering Mode**: Template (monochrome, system-tinted)
**Recommended Size**: 18x18px (@1x) for menu bar clarity

#### 3. Symbol Logos (`OGPSymbolBlack.imageset`, `OGPSymbolWhite.imageset`)

Square symbol variants for light/dark mode:
- `ogp-symbol-black.png` (black symbol, @1x/2x/3x)
- `ogp-symbol-white.png` (white symbol, @1x/2x/3x)

**Purpose**: In-app branding, about screens, settings views.
**Rendering Mode**: Default (preserves colors)

#### 4. Horizontal Logos (`OGPLogoHorizontalBlack.imageset`, `OGPLogoHorizontalWhite.imageset`)

Full horizontal logo with text:
- `ogp-logo-horizontal-black.png` (@1x/2x/3x)
- `ogp-logo-horizontal-white.png` (@1x/2x/3x)

**Purpose**: About screen, settings header, splash screens.
**Rendering Mode**: Default (preserves colors)

## Current Status

**✅ Asset catalog structure created**
**❌ Image files not yet added**

The asset catalog directories and `Contents.json` files have been created with proper configuration. To complete the integration:

1. Add the PNG files listed above to their respective `.imageset` directories
2. Ensure file names match exactly what's specified in `Contents.json`
3. Build and run the app - the status glyph will appear in the menu bar

## Code Integration

The app code has been updated to use the asset catalog:

### Menu Bar Icon (OGPMonitorApp.swift:12-14)

```swift
Image("OGPStatusGlyph")
    .renderingMode(.template)
    .foregroundColor(statusColor)
```

The status glyph is rendered as a template and tinted programmatically based on daemon/tunnel status.

### Future Integration Points

When building additional UI (About screen, settings, etc.), use:

```swift
// Symbol for square branding
Image("OGPSymbolBlack")  // or OGPSymbolWhite based on appearance

// Horizontal logo for headers
Image("OGPLogoHorizontalBlack")  // or White variant
```

## Fallback Behavior

Until the actual image files are added:
- The app will build successfully
- The menu bar will show a missing image placeholder or blank space
- All functionality remains intact - only the visual branding is pending

## Testing Checklist

Once assets are added:

- [ ] Menu bar shows OGP status glyph
- [ ] Glyph tints green when daemon+tunnel running
- [ ] Glyph tints yellow when only daemon running
- [ ] Glyph tints red when daemon stopped
- [ ] Glyph is clearly visible in both light and dark mode
- [ ] Glyph size is appropriate for menu bar (not too large/small)
- [ ] App icon appears correctly in Dock
- [ ] App icon appears correctly in Finder
- [ ] All icon sizes look sharp on Retina displays

## Design Specifications

**Status Glyph Requirements:**
- Must be recognizable at 18x18px
- Should work as monochrome silhouette (template rendering)
- Clean, simple design that reads clearly in menu bar
- Sufficient detail to be identifiable as OGP brand

**App Icon Requirements:**
- Follows macOS Big Sur icon design guidelines
- Rounded square with appropriate padding
- Works at both small (16px) and large (1024px) sizes
- Maintains brand recognition across all sizes

## Asset Sources

The OGP brand assets should be sourced from the official OGP design system. Contact the design team or refer to the brand guidelines for the authoritative asset files.
