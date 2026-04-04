# OGP Monitor - UI Design

## Menu Bar Icon

The app shows a simple colored emoji in the menu bar:

```
┌─────────────────────────────────────┐
│  🔋 🔊 📶 🟢  ⏰ 2:34 PM           │  ← Menu bar
└─────────────────────────────────────┘
              ↑
         OGP Monitor
```

**Status Colors:**
- 🟢 Green: Daemon + Tunnel running
- 🟡 Yellow: Daemon running, Tunnel down
- 🔴 Red: Daemon stopped

## Popup Menu

When you click the menu bar icon, a dropdown appears:

```
┌─────────────────────────────────────┐
│ OGP Monitor          [Refresh]      │
├─────────────────────────────────────┤
│ 🟢 Daemon    Running      [Stop]    │
│ 🟢 Tunnel    Running      [Stop]    │
├─────────────────────────────────────┤
│ Federated Peers               3     │
│                                     │
│ ▸ Alice                       2h ago│
│                                     │
│ ▾ Bob                         5m ago│
│   Intents: message, agent-comms     │
│   https://bob.example.com:18790     │
│                                     │
│ ▸ Charlie                  Just now │
├─────────────────────────────────────┤
│ [Terminal Status]           [Quit]  │
└─────────────────────────────────────┘
```

## Interactive Elements

### Status Rows

Each service shows:
- Status icon (🟢/🟡/🔴)
- Service name
- Current state text
- Action button (Start/Stop)

```
🟢 Daemon    Running      [Stop]
↑    ↑         ↑            ↑
│    │         │            └─ Toggle button
│    │         └────────────── Status text
│    └──────────────────────── Service name
└───────────────────────────── Status icon
```

### Peer List

Peers are collapsible rows:

**Collapsed:**
```
▸ Alice                       2h ago
↑    ↑                          ↑
│    │                          └─ Last communication
│    └────────────────────────── Display name/alias
└─────────────────────────────── Expand chevron
```

**Expanded:**
```
▾ Bob                         5m ago
  Intents: message, agent-comms
  https://bob.example.com:18790
↑
└─ Click chevron to collapse
```

**Features:**
- Click anywhere on row to expand/collapse
- Shows granted intents when expanded
- Shows gateway URL when expanded
- Scrollable if many peers (max height 300px)

### Action Buttons

Bottom row provides quick actions:

```
[Terminal Status]           [Quit]
       ↑                       ↑
       │                       └─ Quit the app
       └─────────────────────── Opens Terminal with `ogp status`
```

## Size & Layout

**Popup Window:**
- Width: 350px (fixed)
- Height: Dynamic (based on peer count)
- Max height: ~500px (scrollable peer list)
- Min height: ~200px (no peers)

**Spacing:**
- Padding: 12px around content
- Row spacing: 12px between sections
- Peer row spacing: 8px between peers

## Typography

- **Title**: Headline font, bold
- **Service names**: Subheadline
- **Status text**: Caption, secondary color
- **Peer names**: Subheadline, medium weight
- **Peer details**: Caption, secondary color
- **Last seen**: Caption2, secondary color

## Colors

**Status Indicators:**
- Green (running): System green
- Yellow (partial): System yellow
- Red (stopped): System red

**Text:**
- Primary: System label color
- Secondary: System secondary label color

**Backgrounds:**
- Expanded row: Secondary color at 10% opacity
- Default: Clear

## Interactions

**Hover States:**
- Buttons show hover effect (macOS standard)
- Peer rows show subtle highlight on hover

**Click Actions:**
- Buttons: Execute command, wait 1s, refresh status
- Peer rows: Toggle expand/collapse
- Refresh: Immediate status update

## Auto-Refresh

The app polls every 5 seconds:
1. Reads OGP state files
2. Checks process PIDs
3. Updates UI if changed
4. No visual indication of refresh (silent)

## Error States

**OGP Not Configured:**
```
┌─────────────────────────────────────┐
│ OGP Monitor          [Refresh]      │
├─────────────────────────────────────┤
│ ⚠️ OGP not configured                │
│                                     │
│ Run 'ogp setup' in Terminal to      │
│ configure OGP first.                │
├─────────────────────────────────────┤
│ [Terminal Status]           [Quit]  │
└─────────────────────────────────────┘
```

**No Peers:**
```
┌─────────────────────────────────────┐
│ OGP Monitor          [Refresh]      │
├─────────────────────────────────────┤
│ 🟢 Daemon    Running      [Stop]    │
│ 🔴 Tunnel    Stopped      [Start]   │
├─────────────────────────────────────┤
│ Federated Peers               0     │
│                                     │
│ No approved peers                   │
├─────────────────────────────────────┤
│ [Terminal Status]           [Quit]  │
└─────────────────────────────────────┘
```

## Design Principles

1. **Minimal**: Show only essential info at a glance
2. **Fast**: Lightweight polling, instant actions
3. **Native**: Uses macOS system fonts, colors, and controls
4. **Informative**: Enough detail without overwhelming
5. **Actionable**: Quick controls for common tasks

## Future UI Enhancements

Possible additions for a fuller companion app:

- **Notifications**: Toast for new federation requests
- **Peer Actions**: Right-click menu for peer management
- **Settings Panel**: Preferences for polling interval, etc.
- **Activity Indicator**: Show when refreshing
- **Search Bar**: Filter peer list
- **Tabs**: Separate tabs for Peers, Messages, Settings
- **Charts**: Visual graphs of activity over time
- **Keyboard Shortcuts**: Quick access to common actions
