# OGP Federation Companion App — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pivot `macos-menubar-app` into an OGP federation companion: a menu-bar popover for status (daemon/tunnel/federations, inbound approve/reject, framework switch) plus a windowed wizard to add a new gateway federation.

**Architecture:** Hybrid drive — the app reads `~/.ogp/<framework>/*.json` for status and shells out to `ogp … --json` for actions. New machine-readable `--json` output is added to the OGP TypeScript CLI first (it doesn't exist today). The app's pure logic (JSON decoders, authorization-policy mapping, framework/state-dir resolution) lives in a testable Swift Package `OGPKit`; SwiftUI views depend on it.

**Tech Stack:** TypeScript + commander + vitest (CLI side); Swift 5.9 + SwiftUI + Swift Package Manager / XCTest (app side); `xcodebuild` for the app target.

**Spec:** `docs/superpowers/specs/2026-06-02-federation-companion-app-design.md`

**Bead:** bd-cn9

---

## File Structure

### Phase A — CLI `--json` (TypeScript, repo root)
- Modify: `src/cli.ts` — add `--json` option to `federation list/status/request/approve/ping` and `tunnel list` subcommands; thread the flag into the action handlers.
- Modify: `src/cli/federation.ts` — `federationList`, `federationStatus`, `federationPing` gain a `json` parameter that short-circuits to `JSON.stringify` of typed data before human formatting.
- Modify: `src/cli/tunnel.ts` — `tunnelList` gains a `json` parameter; add a pure `buildTunnelJson(panes, reconcile)` shaping function.
- Create: `test/federation-json-output.test.ts` — asserts JSON shape + that omitting `--json` is unchanged.
- Create: `test/tunnel-json-output.test.ts` — asserts `buildTunnelJson` shape.
- Modify: `dist/**` — compiled outputs (via `npm run build`), committed (repo ships `dist/`).

### Phase B — App pure logic (Swift Package `OGPKit`)
- Create: `macos-menubar-app/OGPKit/Package.swift`
- Create: `macos-menubar-app/OGPKit/Sources/OGPKit/FederationModels.swift` — Codable types matching CLI `--json`.
- Create: `macos-menubar-app/OGPKit/Sources/OGPKit/WellKnown.swift` — Codable for `/.well-known/ogp` (personas).
- Create: `macos-menubar-app/OGPKit/Sources/OGPKit/AuthorizationPolicy.swift` — scopes → `ogp` CLI args.
- Create: `macos-menubar-app/OGPKit/Sources/OGPKit/FrameworkContext.swift` — framework → state-dir + `--for` args.
- Create: `macos-menubar-app/OGPKit/Tests/OGPKitTests/FederationModelsTests.swift`
- Create: `macos-menubar-app/OGPKit/Tests/OGPKitTests/AuthorizationPolicyTests.swift`
- Create: `macos-menubar-app/OGPKit/Tests/OGPKitTests/FrameworkContextTests.swift`

### Phase C — App integration (Swift / SwiftUI)
- Create: `macos-menubar-app/OGPMonitor/OGPClient.swift` — shells out to `ogp … --json`, decodes via OGPKit.
- Create: `macos-menubar-app/OGPMonitor/StateReader.swift` — reads per-framework `config.json` / `peers.json`.
- Modify: `macos-menubar-app/OGPMonitor/OGPService.swift` — coordinator: polling, framework selection, wizard state; delegates to StateReader + OGPClient.
- Modify: `macos-menubar-app/OGPMonitor/Models.swift` — keep app-display models; re-export OGPKit types.
- Modify: `macos-menubar-app/OGPMonitor/ContentView.swift` — status popover: framework switcher, federation rows, inline approve/reject, "Add Gateway" entry.
- Create: `macos-menubar-app/OGPMonitor/AddGatewayWindow.swift` — `Window` scene + 4-step wizard host.
- Create: `macos-menubar-app/OGPMonitor/AuthorizationStepView.swift` — isolated authorization component.
- Modify: `macos-menubar-app/OGPMonitor/OGPMonitorApp.swift` — add `Window` scene; open it from popover.
- Modify: `macos-menubar-app/OGPMonitor.xcodeproj/project.pbxproj` — add OGPKit local package dependency (done via Xcode UI in a manual step, see Task B1).

---

## Phase A — CLI `--json` output (prerequisite)

### Task A1: `buildTunnelJson` pure function + test

**Files:**
- Modify: `src/cli/tunnel.ts`
- Test: `test/tunnel-json-output.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// test/tunnel-json-output.test.ts
import { describe, it, expect } from 'vitest';
import { buildTunnelJson, type TunnelPane, type ReconcileResult } from '../src/cli/tunnel.js';

describe('buildTunnelJson', () => {
  it('shapes panes and reconcile into a stable JSON object', () => {
    const panes: TunnelPane[] = [
      { tool: 'cloudflared', installed: true, tunnels: [
        { tool: 'cloudflared', name: 'hermes', url: 'https://hermes.sarcastek.com', hostname: 'hermes.sarcastek.com' },
      ]},
      { tool: 'ngrok', installed: false, tunnels: [] },
    ];
    const reconcile: ReconcileResult = { gatewayUrl: 'https://hermes.sarcastek.com', matched: true, status: 'ok' };

    const out = buildTunnelJson(panes, reconcile);

    expect(out).toEqual({
      tools: [
        { tool: 'cloudflared', installed: true, tunnels: [
          { tool: 'cloudflared', name: 'hermes', url: 'https://hermes.sarcastek.com', hostname: 'hermes.sarcastek.com' },
        ]},
        { tool: 'ngrok', installed: false, tunnels: [] },
      ],
      reconcile: { gatewayUrl: 'https://hermes.sarcastek.com', matched: true, status: 'ok' },
    });
  });

  it('emits null reconcile when none provided', () => {
    expect(buildTunnelJson([], null).reconcile).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/tunnel-json-output.test.ts`
Expected: FAIL — `buildTunnelJson` is not exported.

> NOTE: Before writing the implementation, open `src/cli/tunnel.ts` and confirm the exact field names on `TunnelPane`, `TunnelInfo`, and `ReconcileResult` (lines ~109–161). If they differ from the test's assumed shape (`tool/installed/tunnels`, `name/url/hostname`, `gatewayUrl/matched/status`), update BOTH the test and the implementation to match the real types — do not invent fields. The test above is the intended shape; reconcile it with the actual interfaces.

- [ ] **Step 3: Write minimal implementation**

Add to `src/cli/tunnel.ts` (near the other pure functions, after `renderTunnels`):

```typescript
export interface TunnelJson {
  tools: TunnelPane[];
  reconcile: ReconcileResult | null;
}

/** Pure shaping for `ogp tunnel list --json`. */
export function buildTunnelJson(panes: TunnelPane[], reconcile: ReconcileResult | null): TunnelJson {
  return { tools: panes, reconcile };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/tunnel-json-output.test.ts`
Expected: PASS (both cases).

- [ ] **Step 5: Commit**

```bash
git add src/cli/tunnel.ts test/tunnel-json-output.test.ts
git commit -m "feat(cli): buildTunnelJson pure shaping for tunnel --json"
```

---

### Task A2: `tunnel list --json` wiring

**Files:**
- Modify: `src/cli/tunnel.ts` (`tunnelList` signature + body)
- Modify: `src/cli.ts` (tunnel `list` subcommand)

- [ ] **Step 1: Update `tunnelList` to accept a `json` flag**

In `src/cli/tunnel.ts`, find `export async function tunnelList(tool?: TunnelTool): Promise<void>` (~line 259). Change the signature and add an early JSON branch BEFORE the `console.log(renderTunnels(...))` call:

```typescript
export async function tunnelList(tool?: TunnelTool, json = false): Promise<void> {
  // ... existing code that builds `panes` and `reconcile` stays unchanged ...

  if (json) {
    console.log(JSON.stringify(buildTunnelJson(panes, reconcile), null, 2));
    return;
  }

  console.log(renderTunnels(panes, reconcile));
}
```

(If `panes`/`reconcile` are named differently in the function, use the real names — the JSON branch must come after they're computed and before human rendering.)

- [ ] **Step 2: Wire the `--json` option in `src/cli.ts`**

Find the tunnel `list` subcommand registration (in `tunnelCommand`, `src/cli/tunnel.ts` ~line 411, OR in `src/cli.ts` if tunnel is registered there). It currently is defined in `src/cli/tunnel.ts` as `.command('list')`. Add the option and pass it through:

```typescript
  .command('list')
  .alias('show')
  .argument('[tool]', 'cloudflared, ngrok, or both')
  .option('--json', 'Output machine-readable JSON')
  .action(async (tool: string | undefined, options: { json?: boolean }) => {
    await tunnelList(tool as TunnelTool | undefined, options.json ?? false);
  });
```

> Confirm the existing `.action` signature first; preserve any existing tool-validation logic, just add `options.json` passthrough.

- [ ] **Step 3: Build and smoke-test**

Run:
```bash
npm run build && node dist/cli.js tunnel list --json
```
Expected: valid JSON with `tools` and `reconcile` keys. Then:
```bash
node dist/cli.js tunnel list | head -3
```
Expected: unchanged human output (table/panes), proving the flag is opt-in.

- [ ] **Step 4: Commit**

```bash
git add src/cli/tunnel.ts src/cli.ts dist
git commit -m "feat(cli): ogp tunnel list --json"
```

---

### Task A3: `federation list --json`

**Files:**
- Modify: `src/cli/federation.ts` (`federationList`)
- Modify: `src/cli.ts` (federation `list` subcommand)
- Test: `test/federation-json-output.test.ts`

- [ ] **Step 1: Write the failing test (pure peer→json mapper)**

The list logic is entangled with `loadPeers()` (filesystem) and multi-framework env. To keep it testable, extract a pure mapper. Write:

```typescript
// test/federation-json-output.test.ts
import { describe, it, expect } from 'vitest';
import { peersToJson } from '../src/cli/federation.js';
import type { Peer } from '../src/daemon/peers.js';

const basePeer = (over: Partial<Peer>): Peer => ({
  id: 'p1', displayName: 'Cosmo', email: 'c@x.com',
  gatewayUrl: 'https://cosmo.example.com', publicKey: 'abcdef00',
  status: 'approved', requestedAt: '2026-06-01T00:00:00Z', ...over,
});

describe('peersToJson', () => {
  it('projects peers to a stable wire shape', () => {
    const peers: Peer[] = [
      basePeer({ id: 'p1', alias: 'cosmo', status: 'approved', healthState: 'established' }),
      basePeer({ id: 'p2', displayName: 'Apollo', status: 'pending' }),
    ];
    const out = peersToJson(peers);
    expect(out).toEqual([
      { id: 'p1', alias: 'cosmo', displayName: 'Cosmo', status: 'approved',
        gatewayUrl: 'https://cosmo.example.com', publicKey: 'abcdef00',
        healthState: 'established', healthy: undefined,
        grantedScopes: undefined, offeredIntents: undefined, lastSeenAt: undefined },
      { id: 'p2', alias: undefined, displayName: 'Apollo', status: 'pending',
        gatewayUrl: 'https://cosmo.example.com', publicKey: 'abcdef00',
        healthState: undefined, healthy: undefined,
        grantedScopes: undefined, offeredIntents: undefined, lastSeenAt: undefined },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/federation-json-output.test.ts`
Expected: FAIL — `peersToJson` not exported.

- [ ] **Step 3: Implement `peersToJson` + wire into `federationList`**

In `src/cli/federation.ts`, add the pure mapper near the top (after imports):

```typescript
import type { Peer } from '../daemon/peers.js';

export interface PeerJson {
  id: string;
  alias?: string;
  displayName: string;
  status: Peer['status'];
  gatewayUrl: string;
  publicKey: string;
  healthState?: Peer['healthState'];
  healthy?: boolean;
  grantedScopes?: Peer['grantedScopes'];
  offeredIntents?: string[];
  lastSeenAt?: string;
}

export function peersToJson(peers: Peer[]): PeerJson[] {
  return peers.map(p => ({
    id: p.id,
    alias: p.alias,
    displayName: p.displayName,
    status: p.status,
    gatewayUrl: p.gatewayUrl,
    publicKey: p.publicKey,
    healthState: p.healthState,
    healthy: p.healthy,
    grantedScopes: p.grantedScopes,
    offeredIntents: p.offeredIntents,
    lastSeenAt: p.lastSeenAt,
  }));
}
```

Then change `federationList` to accept `json` and short-circuit. Find `export async function federationList(status?: ..., filterTag?: string)` (~line 190). Update signature to `(status?, filterTag?, json = false)`. In the **single-framework** branch (after `const allPeers = loadPeers();` ~line 288 and the `peers` filter), add before the human formatting:

```typescript
  if (json) {
    console.log(JSON.stringify(peersToJson(peers), null, 2));
    return;
  }
```

For the `--for all` branch (env `OGP_FOR_ALL === 'true'`): collect `{ framework, peers }` per framework and, when `json`, emit `JSON.stringify(perFramework, null, 2)` where each entry is `{ framework: framework.id, peers: peersToJson(peers) }`. Add the JSON branch at the point where the loop has gathered per-framework peers; do not run the `console.log` table rows when `json` is true.

- [ ] **Step 4: Wire `--json` in `src/cli.ts`**

Update the federation `list` registration (~line 539):

```typescript
federation
  .command('list')
  .description('List all peers (use --for all to show all frameworks)')
  .option('-s, --status <status>', 'Filter by status (pending|approved|rejected)')
  .option('-t, --tag <tag>', 'Filter by tag')
  .option('--json', 'Output machine-readable JSON')
  .action(async (options) => {
    await federationList(options.status, options.tag, options.json ?? false);
  });
```

- [ ] **Step 5: Run tests + build + smoke**

Run:
```bash
npx vitest run test/federation-json-output.test.ts && npm run build
node dist/cli.js federation list --json
node dist/cli.js federation list | head -5
```
Expected: test PASS; `--json` prints a JSON array of peers; plain output unchanged.

- [ ] **Step 6: Commit**

```bash
git add src/cli/federation.ts src/cli.ts test/federation-json-output.test.ts dist
git commit -m "feat(cli): ogp federation list --json"
```

---

### Task A4: `federation status --json`

**Files:**
- Modify: `src/cli/federation.ts` (`federationStatus`)
- Modify: `src/cli.ts`

- [ ] **Step 1: Add `json` param to `federationStatus`**

`federationStatus()` takes no args today. Change to `federationStatus(json = false)`. It already computes approved/pending/rejected/removed groupings. When `json`, emit a summary object instead of the console tables:

```typescript
  if (json) {
    const allPeers = loadPeers();
    console.log(JSON.stringify({
      total: allPeers.length,
      approved: peersToJson(allPeers.filter(p => p.status === 'approved')),
      pending: peersToJson(allPeers.filter(p => p.status === 'pending')),
      rejected: peersToJson(allPeers.filter(p => p.status === 'rejected')),
    }, null, 2));
    return;
  }
```

Place this at the start of the single-framework path (after the `OGP_FOR_ALL` block, or guard both — for v1 the app calls per-framework so single-framework is the required path; if `OGP_FOR_ALL` is set with `--json`, emit a per-framework array mirroring Task A3's all-branch shape).

- [ ] **Step 2: Wire `--json` in `src/cli.ts`** (~line 548)

```typescript
federation
  .command('status')
  .description('Show federation status and alias → public key mappings (use --for all for all frameworks)')
  .option('--json', 'Output machine-readable JSON')
  .action(async (options) => {
    await federationStatus(options.json ?? false);
  });
```

- [ ] **Step 3: Build + smoke**

Run:
```bash
npm run build && node dist/cli.js federation status --json
node dist/cli.js federation status | head -5
```
Expected: JSON object with `total/approved/pending/rejected`; plain output unchanged.

- [ ] **Step 4: Commit**

```bash
git add src/cli/federation.ts src/cli.ts dist
git commit -m "feat(cli): ogp federation status --json"
```

---

### Task A5: `federation ping --json` and `federation request --json`

**Files:**
- Modify: `src/cli/federation.ts` (`federationPing` if present, `federationRequest`)
- Modify: `src/cli.ts`

- [ ] **Step 1: Locate ping + request return shapes**

Run:
```bash
grep -n "export async function federationPing\|export async function federationRequest" src/cli/federation.ts
```
Read both functions. `federationRequest` currently returns `boolean` (used by connect/accept). `federationPing` prints reachability. Do NOT change their return values — add an optional `json` param that, when true, prints a single JSON line summarizing the outcome and otherwise preserves current behavior.

- [ ] **Step 2: Add `json` to `federationPing`**

```typescript
export async function federationPing(peerUrl: string, json = false): Promise<void> {
  // ... existing reachability check producing e.g. `ok: boolean`, `status`, `latencyMs?` ...
  if (json) {
    console.log(JSON.stringify({ peerUrl, ok, status, latencyMs }, null, 2));
    return;
  }
  // existing human prints
}
```
Use the real local variable names from the function; if latency isn't measured, omit `latencyMs`. The wizard only needs `{ ok, status }` at minimum.

- [ ] **Step 3: Add `json` to `federationRequest`**

`federationRequest(peerUrl, peerId, alias)` → add trailing `json = false`. At each terminal outcome (success / failure), when `json`, print one JSON line and still return the existing boolean:

```typescript
  if (json) {
    console.log(JSON.stringify({ ok: success, peerId, peerUrl, status: success ? 'requested' : 'failed' }));
  }
  return success;
```
Find the existing success/return points and add the JSON print just before `return`. Keep human `console.log` lines gated behind `if (!json)` only where they'd corrupt JSON parsing — i.e. wrap the decorative `console.log` lines in the function body with `if (!json)` so stdout is pure JSON when the flag is set. (The well-known-resolution prints in `src/cli.ts` action also need this — see Step 4.)

- [ ] **Step 4: Wire `--json` in `src/cli.ts`**

For `ping` (find its registration; if absent, search `.command('ping')`):
```typescript
  .option('--json', 'Output machine-readable JSON')
  .action(async (peerUrl, options) => { await federationPing(peerUrl, options.json ?? false); });
```

For `request` (~line 555): add `.option('--json', ...)`. In the action, the well-known auto-resolve block does `console.log("Resolving…")`/`console.log("✓ Resolved…")` — wrap those in `if (!options.json)` so JSON mode emits only the final JSON. Pass `options.json` into `federationRequest(peerUrl, peerId, alias, options.json ?? false)`.

- [ ] **Step 5: Build + smoke**

Run:
```bash
npm run build
node dist/cli.js federation ping https://hermes.sarcastek.com --json
```
Expected: a single JSON object. (Use a reachable peer URL; `ok:false` JSON on unreachable is still valid output.)

- [ ] **Step 6: Commit**

```bash
git add src/cli/federation.ts src/cli.ts dist
git commit -m "feat(cli): ogp federation ping/request --json"
```

---

### Task A6: `whoami --json` for framework/state-dir discovery

**Files:**
- Modify: `src/cli/config.ts` (`whoami`)
- Modify: `src/cli.ts` (whoami registration)

Rationale: the app must resolve each framework's state directory rather than hardcoding `~/.ogp/<id>/`. `whoami` already knows the current framework + config dir.

- [ ] **Step 1: Inspect `whoami`**

Run: `grep -n "export function whoami" src/cli/config.ts` and read it (~line 334). Note the local vars holding identity, `config.stateDir`, framework id, gatewayUrl, daemonPort.

- [ ] **Step 2: Add `json` branch to `whoami`**

```typescript
export function whoami(json = false): void {
  // ... existing gathering of config, currentFramework ...
  if (json) {
    console.log(JSON.stringify({
      framework: currentFramework?.id ?? null,
      displayName: config.displayName,
      stateDir: config.stateDir,
      gatewayUrl: config.gatewayUrl ?? null,
      daemonPort: config.daemonPort,
      publicKey: /* existing pubkey var, or null */ null,
    }, null, 2));
    return;
  }
  // existing human prints
}
```
Use the real variable names. If pubkey isn't already loaded in `whoami`, leave it `null` (the app doesn't need it for v1).

- [ ] **Step 3: Wire `--json`**

Find `whoami` registration in `src/cli.ts` (`grep -n "whoami" src/cli.ts`). Add `.option('--json', ...)` and call `whoami(options.json ?? false)`.

- [ ] **Step 4: Build + smoke**

Run:
```bash
npm run build
node dist/cli.js whoami --json
ogp --for all whoami --json 2>/dev/null || true
```
Expected: JSON with `framework`, `stateDir`, `gatewayUrl`, `daemonPort`.

- [ ] **Step 5: Commit**

```bash
git add src/cli/config.ts src/cli.ts dist
git commit -m "feat(cli): ogp whoami --json (framework + stateDir discovery)"
```

---

### Task A7: Phase A integration check

- [ ] **Step 1: Full suite + lint of new outputs**

Run:
```bash
npx vitest run
npm run build
for c in "whoami --json" "federation list --json" "federation status --json" "tunnel list --json"; do
  echo "=== ogp $c ==="; node dist/cli.js $c | node -e 'let d="";process.stdin.on("data",x=>d+=x).on("end",()=>{JSON.parse(d);console.log("valid JSON")})'
done
```
Expected: all tests PASS; each command prints "valid JSON".

- [ ] **Step 2: Commit any dist drift**

```bash
git add dist && git commit -m "build(dist): compile --json CLI outputs" || echo "no drift"
```

---

## Phase B — App pure logic (OGPKit Swift Package)

### Task B1: Create OGPKit package + wire into the app target

**Files:**
- Create: `macos-menubar-app/OGPKit/Package.swift`
- Create: `macos-menubar-app/OGPKit/Sources/OGPKit/OGPKit.swift` (placeholder)
- Create: `macos-menubar-app/OGPKit/Tests/OGPKitTests/SmokeTests.swift`

- [ ] **Step 1: Create `Package.swift`**

```swift
// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "OGPKit",
    platforms: [.macOS(.v13)],
    products: [
        .library(name: "OGPKit", targets: ["OGPKit"]),
    ],
    targets: [
        .target(name: "OGPKit"),
        .testTarget(name: "OGPKitTests", dependencies: ["OGPKit"]),
    ]
)
```

- [ ] **Step 2: Placeholder source + smoke test**

`macos-menubar-app/OGPKit/Sources/OGPKit/OGPKit.swift`:
```swift
public enum OGPKit {
    public static let version = "0.1.0"
}
```

`macos-menubar-app/OGPKit/Tests/OGPKitTests/SmokeTests.swift`:
```swift
import XCTest
@testable import OGPKit

final class SmokeTests: XCTestCase {
    func testVersion() { XCTAssertEqual(OGPKit.version, "0.1.0") }
}
```

- [ ] **Step 3: Run package tests**

Run: `cd macos-menubar-app/OGPKit && swift test`
Expected: 1 test PASS.

- [ ] **Step 4: Commit**

```bash
git add macos-menubar-app/OGPKit
git commit -m "chore(app): scaffold OGPKit swift package for testable pure logic"
```

- [ ] **Step 5: MANUAL — add OGPKit as a local package dependency of the app target**

This requires Xcode (editing `project.pbxproj` by hand is error-prone). In Xcode:
1. Open `macos-menubar-app/OGPMonitor.xcodeproj`.
2. File ▸ Add Package Dependencies… ▸ Add Local… ▸ select `macos-menubar-app/OGPKit`.
3. Add the `OGPKit` library to the `OGPMonitor` target's "Frameworks, Libraries, and Embedded Content".
4. Build (⌘B) to confirm the app links OGPKit.
5. Commit the `project.pbxproj` change:
```bash
git add macos-menubar-app/OGPMonitor.xcodeproj/project.pbxproj
git commit -m "chore(app): link OGPKit local package into OGPMonitor target"
```

> If the executing agent cannot drive Xcode UI, STOP and hand this step to the user. Phase C depends on it.

---

### Task B2: FederationModels (Codable for `federation list --json`)

**Files:**
- Create: `macos-menubar-app/OGPKit/Sources/OGPKit/FederationModels.swift`
- Create: `macos-menubar-app/OGPKit/Tests/OGPKitTests/FederationModelsTests.swift`

- [ ] **Step 1: Write the failing test**

```swift
// FederationModelsTests.swift
import XCTest
@testable import OGPKit

final class FederationModelsTests: XCTestCase {
    func testDecodesPeerListJson() throws {
        let json = """
        [
          {"id":"p1","alias":"cosmo","displayName":"Cosmo","status":"approved",
           "gatewayUrl":"https://cosmo.example.com","publicKey":"abcd0011",
           "healthState":"established","healthy":true,
           "grantedScopes":{"scopes":[{"intent":"message","enabled":true,"topics":null,"rateLimit":null}],"grantedAt":"2026-06-01T00:00:00Z"},
           "offeredIntents":["message","agent-comms"],"lastSeenAt":"2026-06-02T00:00:00Z"},
          {"id":"p2","displayName":"Apollo","status":"pending",
           "gatewayUrl":"https://hermes.sarcastek.com","publicKey":"c4ac8320"}
        ]
        """.data(using: .utf8)!

        let peers = try JSONDecoder().decode([PeerJson].self, from: json)
        XCTAssertEqual(peers.count, 2)
        XCTAssertEqual(peers[0].alias, "cosmo")
        XCTAssertEqual(peers[0].status, "approved")
        XCTAssertEqual(peers[0].grantedScopes?.scopes.first?.intent, "message")
        XCTAssertEqual(peers[0].offeredIntents, ["message", "agent-comms"])
        XCTAssertNil(peers[1].alias)          // optional missing
        XCTAssertNil(peers[1].healthState)
    }
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd macos-menubar-app/OGPKit && swift test --filter FederationModelsTests`
Expected: FAIL — `PeerJson` undefined.

- [ ] **Step 3: Implement the models**

```swift
// FederationModels.swift
import Foundation

public struct RateLimit: Codable, Hashable {
    public let requests: Int
    public let windowSeconds: Int
}

public struct ScopeGrant: Codable, Hashable {
    public let intent: String
    public let enabled: Bool
    public let topics: [String]?
    public let rateLimit: RateLimit?
}

public struct ScopeBundle: Codable, Hashable {
    public let scopes: [ScopeGrant]
    public let grantedAt: String
}

public struct PeerJson: Codable, Identifiable, Hashable {
    public let id: String
    public let alias: String?
    public let displayName: String
    public let status: String
    public let gatewayUrl: String
    public let publicKey: String
    public let healthState: String?
    public let healthy: Bool?
    public let grantedScopes: ScopeBundle?
    public let offeredIntents: [String]?
    public let lastSeenAt: String?
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd macos-menubar-app/OGPKit && swift test --filter FederationModelsTests`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add macos-menubar-app/OGPKit/Sources/OGPKit/FederationModels.swift macos-menubar-app/OGPKit/Tests/OGPKitTests/FederationModelsTests.swift
git commit -m "feat(app): OGPKit PeerJson Codable models + tests"
```

---

### Task B3: WellKnown models (personas, read-only display)

**Files:**
- Create: `macos-menubar-app/OGPKit/Sources/OGPKit/WellKnown.swift`
- Modify: `macos-menubar-app/OGPKit/Tests/OGPKitTests/FederationModelsTests.swift` (add a test method) OR new `WellKnownTests.swift`

- [ ] **Step 1: Write the failing test**

```swift
// WellKnownTests.swift
import XCTest
@testable import OGPKit

final class WellKnownTests: XCTestCase {
    func testDecodesWellKnownWithPersonas() throws {
        let json = """
        {"version":"0.7.2","displayName":"Testy - Apollo","email":"a@x.com",
         "gatewayUrl":"https://hermes.sarcastek.com","publicKey":"c4ac8320",
         "capabilities":{"intents":["message","agent-comms"],"features":["multi-agent-personas"]},
         "agents":[{"id":"apollo","displayName":"Apollo","role":"primary"},
                   {"id":"atlas","displayName":"Atlas","role":"specialist","description":"cartographer"}]}
        """.data(using: .utf8)!

        let wk = try JSONDecoder().decode(WellKnown.self, from: json)
        XCTAssertEqual(wk.displayName, "Testy - Apollo")
        XCTAssertEqual(wk.capabilities.intents, ["message", "agent-comms"])
        XCTAssertEqual(wk.agents?.count, 2)
        XCTAssertEqual(wk.agents?[0].role, "primary")
        XCTAssertEqual(wk.agents?[1].description, "cartographer")
    }
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd macos-menubar-app/OGPKit && swift test --filter WellKnownTests`
Expected: FAIL — `WellKnown` undefined.

- [ ] **Step 3: Implement**

```swift
// WellKnown.swift
import Foundation

public struct AgentPersona: Codable, Identifiable, Hashable {
    public let id: String
    public let displayName: String
    public let role: String            // "primary" | "specialist"
    public let displayIcon: String?
    public let description: String?
    public let skills: [String]?
}

public struct WellKnownCapabilities: Codable, Hashable {
    public let intents: [String]
    public let features: [String]
}

public struct WellKnown: Codable, Hashable {
    public let version: String
    public let displayName: String
    public let email: String
    public let gatewayUrl: String
    public let publicKey: String
    public let capabilities: WellKnownCapabilities
    public let agents: [AgentPersona]?
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd macos-menubar-app/OGPKit && swift test --filter WellKnownTests`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add macos-menubar-app/OGPKit/Sources/OGPKit/WellKnown.swift macos-menubar-app/OGPKit/Tests/OGPKitTests/WellKnownTests.swift
git commit -m "feat(app): OGPKit WellKnown + AgentPersona models + tests"
```

---

### Task B4: AuthorizationPolicy (scopes → CLI args)

**Files:**
- Create: `macos-menubar-app/OGPKit/Sources/OGPKit/AuthorizationPolicy.swift`
- Create: `macos-menubar-app/OGPKit/Tests/OGPKitTests/AuthorizationPolicyTests.swift`

This is the isolated seam the v2 per-agent primitive will swap behind.

- [ ] **Step 1: Write the failing test**

```swift
// AuthorizationPolicyTests.swift
import XCTest
@testable import OGPKit

final class AuthorizationPolicyTests: XCTestCase {
    func testEmptyPolicyProducesNoGrantArgs() {
        let p = AuthorizationPolicy(intents: [], rate: nil, topics: [])
        XCTAssertEqual(p.requestArgs(), [])
    }

    func testIntentsBecomeCommaJoinedFlag() {
        let p = AuthorizationPolicy(intents: ["message", "agent-comms"], rate: nil, topics: [])
        XCTAssertEqual(p.approveArgs(), ["--intents", "message,agent-comms"])
    }

    func testRateAndTopicsIncluded() {
        let p = AuthorizationPolicy(intents: ["agent-comms"], rate: "100/3600", topics: ["memory", "tasks"])
        XCTAssertEqual(
            p.approveArgs(),
            ["--intents", "agent-comms", "--rate", "100/3600", "--topics", "memory,tasks"]
        )
    }
}
```

> Note: `ogp federation approve` accepts `--intents/--rate/--topics` (verified in src/cli.ts ~line 645). `ogp federation request` does NOT accept grant flags — only `--alias`. So `requestArgs()` returns scope-independent args (empty for grants); grants are applied at approve time. The wizard's outbound flow records the intended policy and applies it when the peer is later approved, OR (for symmetric setups) via `federation grant` post-approval. Keep `requestArgs()` returning `[]` for v1.

- [ ] **Step 2: Run to verify it fails**

Run: `cd macos-menubar-app/OGPKit && swift test --filter AuthorizationPolicyTests`
Expected: FAIL — `AuthorizationPolicy` undefined.

- [ ] **Step 3: Implement**

```swift
// AuthorizationPolicy.swift
import Foundation

/// Maps a chosen authorization policy to `ogp federation` CLI arguments.
/// v1 grants are per-peer (intents/rate/topics). The per-agent allow-list is a
/// future primitive; when it lands, this type's internals change but its
/// interface (init + *Args) stays stable so the wizard flow is untouched.
public struct AuthorizationPolicy: Equatable {
    public let intents: [String]
    public let rate: String?
    public let topics: [String]

    public init(intents: [String], rate: String?, topics: [String]) {
        self.intents = intents
        self.rate = rate
        self.topics = topics
    }

    /// Args for `ogp federation request` — v1 has no grant flags there.
    public func requestArgs() -> [String] { [] }

    /// Args for `ogp federation approve <peer-id>`.
    public func approveArgs() -> [String] {
        var args: [String] = []
        if !intents.isEmpty { args += ["--intents", intents.joined(separator: ",")] }
        if let rate { args += ["--rate", rate] }
        if !topics.isEmpty { args += ["--topics", topics.joined(separator: ",")] }
        return args
    }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd macos-menubar-app/OGPKit && swift test --filter AuthorizationPolicyTests`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add macos-menubar-app/OGPKit/Sources/OGPKit/AuthorizationPolicy.swift macos-menubar-app/OGPKit/Tests/OGPKitTests/AuthorizationPolicyTests.swift
git commit -m "feat(app): OGPKit AuthorizationPolicy scope→CLI mapping + tests"
```

---

### Task B5: FrameworkContext (framework → state dir + `--for` args)

**Files:**
- Create: `macos-menubar-app/OGPKit/Sources/OGPKit/FrameworkContext.swift`
- Create: `macos-menubar-app/OGPKit/Tests/OGPKitTests/FrameworkContextTests.swift`

- [ ] **Step 1: Write the failing test**

```swift
// FrameworkContextTests.swift
import XCTest
@testable import OGPKit

final class FrameworkContextTests: XCTestCase {
    func testDefaultFrameworkAddsNoForFlag() {
        let ctx = FrameworkContext(framework: nil, stateDir: "/Users/x/.ogp")
        XCTAssertEqual(ctx.forArgs(), [])
        XCTAssertEqual(ctx.peersPath, "/Users/x/.ogp/peers.json")
        XCTAssertEqual(ctx.configPath, "/Users/x/.ogp/config.json")
    }

    func testNamedFrameworkAddsForFlag() {
        let ctx = FrameworkContext(framework: "hermes", stateDir: "/Users/x/.ogp-hermes")
        XCTAssertEqual(ctx.forArgs(), ["--for", "hermes"])
        XCTAssertEqual(ctx.peersPath, "/Users/x/.ogp-hermes/peers.json")
    }
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd macos-menubar-app/OGPKit && swift test --filter FrameworkContextTests`
Expected: FAIL — `FrameworkContext` undefined.

- [ ] **Step 3: Implement**

```swift
// FrameworkContext.swift
import Foundation

/// Resolves per-framework state paths and the `--for <framework>` CLI prefix.
/// `stateDir` is sourced from `ogp [--for <fw>] whoami --json`.
public struct FrameworkContext: Equatable {
    public let framework: String?   // nil = default framework
    public let stateDir: String

    public init(framework: String?, stateDir: String) {
        self.framework = framework
        self.stateDir = stateDir
    }

    public func forArgs() -> [String] {
        guard let framework else { return [] }
        return ["--for", framework]
    }

    public var configPath: String { (stateDir as NSString).appendingPathComponent("config.json") }
    public var peersPath: String { (stateDir as NSString).appendingPathComponent("peers.json") }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd macos-menubar-app/OGPKit && swift test --filter FrameworkContextTests`
Expected: PASS.

- [ ] **Step 5: Run the FULL package suite + commit**

Run: `cd macos-menubar-app/OGPKit && swift test`
Expected: all tests PASS (smoke + models + wellknown + policy + framework).

```bash
git add macos-menubar-app/OGPKit/Sources/OGPKit/FrameworkContext.swift macos-menubar-app/OGPKit/Tests/OGPKitTests/FrameworkContextTests.swift
git commit -m "feat(app): OGPKit FrameworkContext path/for-flag resolution + tests"
```

---

## Phase C — App integration (Swift / SwiftUI)

> These tasks modify the SwiftUI app. SwiftUI views are not unit-tested here; each task ends with a `xcodebuild` build check and, where behavior is observable, a manual smoke step. Pure logic was already covered in Phase B.

### Task C1: OGPClient — shell out to `ogp … --json`

**Files:**
- Create: `macos-menubar-app/OGPMonitor/OGPClient.swift`

- [ ] **Step 1: Implement OGPClient**

```swift
// OGPClient.swift
import Foundation
import OGPKit

/// Shells out to the `ogp` CLI with `--json` and decodes typed results.
/// Locating the binary reuses the common-paths search (GUI apps lack shell PATH).
struct OGPClient {
    enum ClientError: Error { case binaryNotFound, nonZeroExit(Int32, String), decode(Error) }

    let context: FrameworkContext

    private func ogpPath() -> String? {
        let home = FileManager.default.homeDirectoryForCurrentUser.path
        let candidates = [
            "/opt/homebrew/bin/ogp", "/usr/local/bin/ogp",
            "\(home)/.npm-global/bin/ogp",
        ]
        return candidates.first { FileManager.default.fileExists(atPath: $0) }
    }

    /// Run `ogp [--for fw] <args...> --json`, return stdout data.
    private func run(_ args: [String]) throws -> Data {
        guard let path = ogpPath() else { throw ClientError.binaryNotFound }
        let task = Process()
        task.executableURL = URL(fileURLWithPath: path)
        task.arguments = context.forArgs() + args
        let out = Pipe(); let err = Pipe()
        task.standardOutput = out; task.standardError = err
        try task.run()
        task.waitUntilExit()
        let data = out.fileHandleForReading.readDataToEndOfFile()
        if task.terminationStatus != 0 {
            let msg = String(data: err.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
            throw ClientError.nonZeroExit(task.terminationStatus, msg)
        }
        return data
    }

    func listPeers() throws -> [PeerJson] {
        let data = try run(["federation", "list", "--json"])
        do { return try JSONDecoder().decode([PeerJson].self, from: data) }
        catch { throw ClientError.decode(error) }
    }

    func ping(_ peerUrl: String) throws -> Bool {
        struct PingResult: Decodable { let ok: Bool }
        let data = try run(["federation", "ping", peerUrl, "--json"])
        return (try? JSONDecoder().decode(PingResult.self, from: data))?.ok ?? false
    }

    @discardableResult
    func request(peerUrl: String, alias: String?) throws -> Bool {
        struct ReqResult: Decodable { let ok: Bool }
        var args = ["federation", "request", peerUrl]
        if let alias { args += ["--alias", alias] }
        args.append("--json")
        let data = try run(args)
        return (try? JSONDecoder().decode(ReqResult.self, from: data))?.ok ?? false
    }

    func approve(peerId: String, policy: AuthorizationPolicy) throws {
        _ = try run(["federation", "approve", peerId] + policy.approveArgs())
    }

    func reject(peerId: String) throws {
        _ = try run(["federation", "reject", peerId])
    }
}
```

- [ ] **Step 2: Build check**

Run: `cd macos-menubar-app && xcodebuild -project OGPMonitor.xcodeproj -scheme OGPMonitor -configuration Debug -derivedDataPath build build 2>&1 | tail -5`
Expected: `** BUILD SUCCEEDED **`.

> If build fails because OGPKit isn't linked, Task B1 Step 5 (manual Xcode link) was not completed — do that first.

- [ ] **Step 3: Commit**

```bash
git add macos-menubar-app/OGPMonitor/OGPClient.swift
git commit -m "feat(app): OGPClient shells out to ogp --json via OGPKit"
```

---

### Task C2: StateReader — per-framework file reads

**Files:**
- Create: `macos-menubar-app/OGPMonitor/StateReader.swift`

- [ ] **Step 1: Implement StateReader**

```swift
// StateReader.swift
import Foundation
import OGPKit

/// Reads per-framework state files. No subprocesses, no side effects.
struct StateReader {
    let context: FrameworkContext

    struct LocalConfig: Decodable {
        let daemonPort: Int
        let gatewayUrl: String?
        let displayName: String?
    }

    func loadConfig() -> LocalConfig? {
        guard let data = FileManager.default.contents(atPath: context.configPath) else { return nil }
        return try? JSONDecoder().decode(LocalConfig.self, from: data)
    }

    /// Reads peers.json directly (decodes the subset the app needs).
    func loadPeers() -> [PeerJson] {
        guard let data = FileManager.default.contents(atPath: context.peersPath) else { return [] }
        return (try? JSONDecoder().decode([PeerJson].self, from: data)) ?? []
    }

    func daemonRunning() -> Bool {
        let pidPath = (context.stateDir as NSString).appendingPathComponent("daemon.pid")
        guard let s = try? String(contentsOfFile: pidPath, encoding: .utf8),
              let pid = Int32(s.trimmingCharacters(in: .whitespacesAndNewlines)) else { return false }
        return kill(pid, 0) == 0   // signal 0 = liveness probe
    }
}
```

> NOTE on `loadPeers()` decoding: `peers.json` on disk has MORE fields than `PeerJson` and uses the daemon's `Peer` shape. `PeerJson` is the `--json` projection, which is a subset with compatible field names (`id/alias/displayName/status/gatewayUrl/publicKey/healthState/healthy/grantedScopes/offeredIntents/lastSeenAt`). Decoding the on-disk file with `PeerJson` works because Swift's `Decodable` ignores unknown keys. If a required key is absent on disk for some peer, prefer `OGPClient.listPeers()` (the `--json` path) as the source of truth and treat StateReader.loadPeers() as a fast-path cache. The coordinator (C3) uses OGPClient for correctness and StateReader for the cheap liveness/config bits.

- [ ] **Step 2: Build check**

Run: `cd macos-menubar-app && xcodebuild -project OGPMonitor.xcodeproj -scheme OGPMonitor -configuration Debug -derivedDataPath build build 2>&1 | tail -5`
Expected: `** BUILD SUCCEEDED **`.

- [ ] **Step 3: Commit**

```bash
git add macos-menubar-app/OGPMonitor/StateReader.swift
git commit -m "feat(app): StateReader per-framework config/peers/daemon reads"
```

---

### Task C3: Refactor OGPService into the coordinator

**Files:**
- Modify: `macos-menubar-app/OGPMonitor/OGPService.swift`
- Modify: `macos-menubar-app/OGPMonitor/Models.swift`

- [ ] **Step 1: Add framework discovery + published state**

Rewrite `OGPService` to:
- Hold `@Published var frameworks: [FrameworkInfo]`, `@Published var selectedFramework: FrameworkInfo?`, `@Published var peers: [PeerJson]`, `@Published var daemonStatus: ServiceStatus`, `@Published var tunnelStatus: ServiceStatus`.
- On init, discover frameworks by running `ogp --for all whoami --json` (fallback to single `ogp whoami --json`); parse into `FrameworkInfo { id, displayName, stateDir, gatewayUrl, daemonPort }`.
- Build a `FrameworkContext` from the selected framework; construct `StateReader` and `OGPClient` from it.
- `refresh()`: `daemonStatus` from `StateReader.daemonRunning()`; `peers` from `OGPClient.listPeers()` (fall back to `StateReader.loadPeers()` on client error); `tunnelStatus` from existing `TunnelManager` (unchanged).
- Keep the 5s polling timer.

Add to `Models.swift`:
```swift
import OGPKit

struct FrameworkInfo: Identifiable, Hashable {
    let id: String          // framework id, e.g. "openclaw" / "hermes"
    let displayName: String
    let stateDir: String
    let gatewayUrl: String?
    let daemonPort: Int

    var context: FrameworkContext { FrameworkContext(framework: id, stateDir: stateDir) }
}
```

Concrete `OGPService` skeleton (replace the file's body, preserving the `ServiceStatus` usage and `TunnelManager` wiring):

```swift
import Foundation
import Combine
import OGPKit

@MainActor
final class OGPService: ObservableObject {
    @Published var frameworks: [FrameworkInfo] = []
    @Published var selectedFramework: FrameworkInfo?
    @Published var peers: [PeerJson] = []
    @Published var daemonStatus: ServiceStatus = .unknown
    @Published var tunnelStatus: ServiceStatus = .unknown
    @Published var showAddGateway: Bool = false

    private var timer: Timer?
    private var tunnelManager: TunnelManager?

    init() {
        discoverFrameworks()
        startPolling()
    }
    deinit { timer?.invalidate() }

    private var context: FrameworkContext? { selectedFramework?.context }
    private var reader: StateReader? { context.map { StateReader(context: $0) } }
    private var client: OGPClient? { context.map { OGPClient(context: $0) } }

    func discoverFrameworks() {
        // Run `ogp --for all whoami --json`; parse array; fallback to single.
        // (Implementation: use a tiny Process call here OR reuse OGPClient with a
        //  nil-framework context. Parse into [FrameworkInfo]; pick the first as
        //  selectedFramework if none selected.)
        // Set self.frameworks and self.selectedFramework, then init tunnelManager
        // with selectedFramework.daemonPort.
    }

    func selectFramework(_ fw: FrameworkInfo) {
        selectedFramework = fw
        tunnelManager = TunnelManager(ogpPort: fw.daemonPort)
        refresh()
    }

    private func startPolling() {
        timer = Timer.scheduledTimer(withTimeInterval: 5, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.refresh() }
        }
    }

    func refresh() {
        guard let reader, let client else { return }
        daemonStatus = reader.daemonRunning() ? .running : .stopped
        tunnelStatus = (tunnelManager?.detectRunningTunnel() ?? false) ? .running : .stopped
        if let live = try? client.listPeers() { peers = live }
        else { peers = reader.loadPeers() }
    }

    func approve(_ peer: PeerJson, policy: AuthorizationPolicy) {
        try? client?.approve(peerId: peer.id, policy: policy); refresh()
    }
    func reject(_ peer: PeerJson) {
        try? client?.reject(peerId: peer.id); refresh()
    }

    var approvedPeers: [PeerJson] { peers.filter { $0.status == "approved" } }
    var pendingPeers: [PeerJson] { peers.filter { $0.status == "pending" } }
}
```

> The `discoverFrameworks()` body is left as an explicit sub-implementation: run `ogp --for all whoami --json` with a `Process` (mirror `OGPClient.run`), decode an array of `{framework, displayName, stateDir, gatewayUrl, daemonPort}` into `[FrameworkInfo]` (note: key `framework` → property `id`, via a `CodingKeys` map). If `--for all` returns a single object rather than an array, wrap it. This is the one place that must tolerate both shapes; add a `decodeFrameworks(_ data: Data) -> [FrameworkInfo]` helper and a Phase-B-style OGPKit test for it if you want coverage (optional, recommended).

- [ ] **Step 2: Build check**

Run: `cd macos-menubar-app && xcodebuild -project OGPMonitor.xcodeproj -scheme OGPMonitor -configuration Debug -derivedDataPath build build 2>&1 | tail -8`
Expected: `** BUILD SUCCEEDED **`. Fix compile errors (the old `OGPService` API consumed by `ContentView` will break — that's expected; C4 updates the view).

- [ ] **Step 3: Commit**

```bash
git add macos-menubar-app/OGPMonitor/OGPService.swift macos-menubar-app/OGPMonitor/Models.swift
git commit -m "feat(app): OGPService coordinator — frameworks, peers via OGPClient, polling"
```

---

### Task C4: Status popover — framework switcher, federation rows, approve/reject

**Files:**
- Modify: `macos-menubar-app/OGPMonitor/ContentView.swift`

- [ ] **Step 1: Rewrite ContentView for the new service API**

Implement:
- Header: title + framework `Picker` bound to `service.selectedFramework` (calls `service.selectFramework`), shown only if `frameworks.count > 1`.
- Daemon + Tunnel `StatusRow`s (reuse existing `StatusRow`; daemon start/stop can remain via existing `ogp start/stop` shell-out — keep those methods or port them into OGPClient as `startDaemon`/`stopDaemon` plain runs).
- Pending section: for each `service.pendingPeers`, a row with `[Approve]` and `[Reject]`. Approve uses a default policy `AuthorizationPolicy(intents: ["message","agent-comms"], rate: nil, topics: [])` for v1 (a richer approve sheet is optional; default is acceptable since approve grants can be edited later via `federation grant`).
- Approved section: list `service.approvedPeers` with display alias, health dot (green if `healthy != false`), and granted intents from `peer.grantedScopes`.
- Footer: `＋ Add Gateway…` button sets `service.showAddGateway = true` and opens the window (via `openWindow`, see C6); `Quit`.

Keep `StatusRow` and the relative-time helper. Remove the old tunnel-selection inline UI (superseded; tunnel start is out of v1 wizard scope, status only).

- [ ] **Step 2: Build check**

Run: `cd macos-menubar-app && xcodebuild -project OGPMonitor.xcodeproj -scheme OGPMonitor -configuration Debug -derivedDataPath build build 2>&1 | tail -8`
Expected: `** BUILD SUCCEEDED **`.

- [ ] **Step 3: Commit**

```bash
git add macos-menubar-app/OGPMonitor/ContentView.swift
git commit -m "feat(app): status popover with framework switch + approve/reject"
```

---

### Task C5: AuthorizationStepView (isolated component)

**Files:**
- Create: `macos-menubar-app/OGPMonitor/AuthorizationStepView.swift`

- [ ] **Step 1: Implement the component**

```swift
// AuthorizationStepView.swift
import SwiftUI
import OGPKit

/// Isolated authorization step. Input: peer's advertised personas (read-only) +
/// the available intents. Output (binding): an AuthorizationPolicy. When the v2
/// per-agent primitive lands, only this view's internals change.
struct AuthorizationStepView: View {
    let personas: [AgentPersona]          // read-only display
    let availableIntents: [String]
    @Binding var policy: AuthorizationPolicy

    @State private var selectedIntents: Set<String> = ["message", "agent-comms"]

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Authorization").font(.headline)
            Text("Grant this peer these scopes (per-peer):")
                .font(.caption).foregroundColor(.secondary)
            ForEach(availableIntents, id: \.self) { intent in
                Toggle(intent, isOn: Binding(
                    get: { selectedIntents.contains(intent) },
                    set: { on in
                        if on { selectedIntents.insert(intent) } else { selectedIntents.remove(intent) }
                        syncPolicy()
                    }
                ))
            }
            if !personas.isEmpty {
                Divider()
                Text("This peer advertises agents (read-only — per-agent control coming in v2):")
                    .font(.caption2).foregroundColor(.secondary)
                ForEach(personas) { p in
                    HStack {
                        Text(p.role == "primary" ? "★" : "•")
                        Text(p.displayName).font(.caption)
                        if let d = p.description { Text("— \(d)").font(.caption2).foregroundColor(.secondary) }
                    }
                }
            }
        }
        .onAppear(perform: syncPolicy)
    }

    private func syncPolicy() {
        policy = AuthorizationPolicy(intents: Array(selectedIntents).sorted(), rate: nil, topics: [])
    }
}
```

- [ ] **Step 2: Build check**

Run: `cd macos-menubar-app && xcodebuild -project OGPMonitor.xcodeproj -scheme OGPMonitor -configuration Debug -derivedDataPath build build 2>&1 | tail -5`
Expected: `** BUILD SUCCEEDED **`.

- [ ] **Step 3: Commit**

```bash
git add macos-menubar-app/OGPMonitor/AuthorizationStepView.swift
git commit -m "feat(app): isolated AuthorizationStepView (v2 swap seam)"
```

---

### Task C6: AddGatewayWindow — 4-step wizard + Window scene

**Files:**
- Create: `macos-menubar-app/OGPMonitor/AddGatewayWindow.swift`
- Modify: `macos-menubar-app/OGPMonitor/OGPMonitorApp.swift`

- [ ] **Step 1: Implement the wizard**

```swift
// AddGatewayWindow.swift
import SwiftUI
import OGPKit

struct AddGatewayWindow: View {
    @ObservedObject var service: OGPService
    @Environment(\.dismiss) private var dismiss

    enum Step { case destination, name, authorization, connect }
    @State private var step: Step = .destination
    @State private var peerUrl = ""
    @State private var alias = ""
    @State private var pingOk: Bool? = nil
    @State private var personas: [AgentPersona] = []
    @State private var policy = AuthorizationPolicy(intents: ["message","agent-comms"], rate: nil, topics: [])
    @State private var connecting = false
    @State private var result: String? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            stepHeader
            Divider()
            switch step {
            case .destination: destinationStep
            case .name: nameStep
            case .authorization:
                AuthorizationStepView(personas: personas,
                                      availableIntents: ["message","agent-comms","project.join","project.contribute"],
                                      policy: $policy)
            case .connect: connectStep
            }
            Spacer()
            navButtons
        }
        .padding(20)
        .frame(width: 520, height: 420)
    }

    private var stepHeader: some View {
        Text("Add Gateway — \(stepTitle)").font(.title3).bold()
    }
    private var stepTitle: String {
        switch step { case .destination: "Destination"; case .name: "Name"
        case .authorization: "Authorization"; case .connect: "Connect" }
    }

    private var destinationStep: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Peer gateway URL").font(.caption).foregroundColor(.secondary)
            TextField("https://peer.example.com", text: $peerUrl)
            Button("Test reachability") {
                let client = OGPClient(context: service.selectedFramework?.context
                                       ?? FrameworkContext(framework: nil, stateDir: ""))
                pingOk = (try? client.ping(peerUrl)) ?? false
                fetchPersonas()
            }
            if let pingOk { Text(pingOk ? "✓ reachable" : "✗ unreachable")
                .foregroundColor(pingOk ? .green : .red).font(.caption) }
        }
    }

    private var nameStep: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Local alias for this peer").font(.caption).foregroundColor(.secondary)
            TextField("e.g. cosmo", text: $alias)
        }
    }

    private var connectStep: some View {
        VStack(alignment: .leading, spacing: 8) {
            if connecting { ProgressView("Sending federation request…") }
            else if let result { Text(result).font(.callout) }
            else {
                Text("Ready to connect to \(peerUrl)").font(.callout)
                Text("Scopes: \(policy.intents.joined(separator: ", "))")
                    .font(.caption).foregroundColor(.secondary)
            }
        }
    }

    private var navButtons: some View {
        HStack {
            if step != .destination { Button("Back") { back() } }
            Spacer()
            Button("Cancel") { dismiss() }
            Button(step == .connect ? "Connect" : "Next") { next() }
                .keyboardShortcut(.defaultAction)
                .disabled(step == .destination && (peerUrl.isEmpty || pingOk != true))
        }
    }

    private func fetchPersonas() {
        guard let url = URL(string: peerUrl.hasSuffix("/") ? "\(peerUrl).well-known/ogp" : "\(peerUrl)/.well-known/ogp") else { return }
        URLSession.shared.dataTask(with: url) { data, _, _ in
            guard let data, let wk = try? JSONDecoder().decode(WellKnown.self, from: data) else { return }
            DispatchQueue.main.async { personas = wk.agents ?? [] }
        }.resume()
    }

    private func back() {
        switch step { case .name: step = .destination; case .authorization: step = .name
        case .connect: step = .authorization; case .destination: break }
    }
    private func next() {
        switch step {
        case .destination: step = .name
        case .name: step = .authorization
        case .authorization: step = .connect
        case .connect: connect()
        }
    }
    private func connect() {
        connecting = true
        Task { @MainActor in
            let client = OGPClient(context: service.selectedFramework?.context
                                   ?? FrameworkContext(framework: nil, stateDir: ""))
            let ok = (try? client.request(peerUrl: peerUrl, alias: alias.isEmpty ? nil : alias)) ?? false
            connecting = false
            result = ok ? "✓ Federation request sent to \(peerUrl).\nWatch the status popover for approval."
                        : "✗ Request failed. Check the URL and that your daemon is running."
            service.refresh()
        }
    }
}
```

> v1 note: the wizard sends the outbound `federation request` with `--alias`. The chosen `policy` governs how YOU would grant scopes when approving an INBOUND request from this peer; for a purely outbound add it is informational in v1 (recorded, shown on the Connect step). This matches the spec: per-peer scopes are applied at approve time. Do not fabricate a `request --grant` flag — it does not exist.

- [ ] **Step 2: Add the Window scene + opener in `OGPMonitorApp.swift`**

```swift
import SwiftUI

@main
struct OGPMonitorApp: App {
    @StateObject private var service = OGPService()

    var body: some Scene {
        MenuBarExtra {
            ContentView(service: service)
        } label: {
            Image("OGPStatusGlyph").renderingMode(.template).foregroundColor(statusColor)
        }

        Window("Add Gateway", id: "add-gateway") {
            AddGatewayWindow(service: service)
        }
        .windowResizability(.contentSize)
    }

    private var statusColor: Color {
        switch service.daemonStatus {
        case .running: return service.tunnelStatus == .running ? .green : .yellow
        case .stopped: return .red
        case .unknown: return .yellow
        }
    }
}
```

In `ContentView`, the `＋ Add Gateway…` button opens it:
```swift
@Environment(\.openWindow) private var openWindow
// ...
Button("＋ Add Gateway…") { openWindow(id: "add-gateway") }
```

- [ ] **Step 3: Build check**

Run: `cd macos-menubar-app && xcodebuild -project OGPMonitor.xcodeproj -scheme OGPMonitor -configuration Debug -derivedDataPath build build 2>&1 | tail -8`
Expected: `** BUILD SUCCEEDED **`.

- [ ] **Step 4: Commit**

```bash
git add macos-menubar-app/OGPMonitor/AddGatewayWindow.swift macos-menubar-app/OGPMonitor/OGPMonitorApp.swift macos-menubar-app/OGPMonitor/ContentView.swift
git commit -m "feat(app): Add Gateway wizard window + status-color from daemon/tunnel"
```

---

### Task C7: End-to-end manual smoke + cleanup

**Files:** none (validation) — optionally Modify docs.

- [ ] **Step 1: Build the Release app**

Run: `cd macos-menubar-app && ./build.sh 2>&1 | tail -5`
Expected: `✅ Build complete!`.

- [ ] **Step 2: Run and verify (manual)**

Launch `build/Build/Products/Release/OGPMonitor.app`. Verify:
1. Menu-bar glyph appears; color reflects daemon/tunnel state.
2. Popover lists current framework's approved peers (compare to `ogp federation list`).
3. Framework switcher toggles between OpenClaw and Hermes; peer list changes.
4. A pending inbound request (if any) shows Approve/Reject; approving it grants the default scopes (verify with `ogp federation scopes <peer-id>`).
5. `＋ Add Gateway…` opens the window; entering a reachable peer URL → "Test reachability" shows ✓ and loads personas; stepping to Connect sends the request (verify the peer received it / `ogp federation list` shows it pending-outbound).

Record results in the bead.

- [ ] **Step 3: Remove dead code**

Delete `TunnelSelectionView.swift` if no longer referenced (the inline tunnel picker was removed in C4):
```bash
grep -rn "TunnelSelectionView\|TunnelOptionRow" macos-menubar-app/OGPMonitor || git rm macos-menubar-app/OGPMonitor/TunnelSelectionView.swift
```
(Only remove if grep shows no references. `TunnelManager` stays — it powers tunnel status.)

- [ ] **Step 4: Update app README + commit**

Briefly update `macos-menubar-app/README.md` to describe the companion (status + add-gateway), then:
```bash
git add macos-menubar-app
git commit -m "docs(app): companion app README; remove dead tunnel-selection view"
```

---

## Self-Review

**Spec coverage:**
- Form factor A (popover + window) → Tasks C4 (popover), C6 (window). ✓
- Hybrid drive (files for status, CLI for actions) → C2 (StateReader), C1 (OGPClient). ✓
- `--json` prerequisite on federation list/status/request/approve/ping + tunnel list + whoami → A2–A6. ✓ (approve has no `--json` because it has no machine output to parse — it's a fire-and-forget mutation; the app calls it and re-reads state. Confirmed acceptable: spec lists approve among `--json` verbs for "verbs the wizard uses", but approve returns no data the wizard parses. Documented here as an intentional deviation — approve is invoked without `--json`.)
- Per-peer scopes in v1, personas read-only, v2 seam → B4 (AuthorizationPolicy), C5 (AuthorizationStepView). ✓
- Multi-framework switcher → A6 (whoami --json), B5 (FrameworkContext), C3/C4. ✓
- Inbound approve/reject → C4 + OGPClient.approve/reject (C1). ✓
- Tunnel health display (no start in v1) → TunnelManager retained, shown in C4; wizard does not start tunnels. ✓
- Error handling (binary not found, command failure, daemon down) → OGPClient.ClientError, wizard result messages, daemon status row. ✓
- Testing strategy (vitest for CLI, swift test for pure logic, build+manual for UI) → Phases A/B tests, C build checks + C7 manual. ✓
- v2 backlog beads → filed in handoff (per-agent primitive, invite/accept, tunnel-start-from-wizard). ✓

**Placeholder scan:** `discoverFrameworks()` body and the `--for all` JSON branch are described as sub-implementations with explicit shape-handling guidance rather than full code, because both depend on the exact runtime shape of `ogp --for all whoami --json` which must be observed during A6. This is flagged, not hidden — the executor verifies the shape in A6 Step 4 and implements against it. All other steps contain complete code.

**Type consistency:** `PeerJson` (A3 TS / B2 Swift) fields match: `id, alias, displayName, status, gatewayUrl, publicKey, healthState, healthy, grantedScopes, offeredIntents, lastSeenAt`. `AuthorizationPolicy.approveArgs()` (B4) → consumed by `OGPClient.approve` (C1) and produced by `AuthorizationStepView` (C5): consistent `intents/rate/topics`. `FrameworkContext` (B5) `forArgs/configPath/peersPath` → used by `OGPClient` (C1) and `StateReader` (C2): consistent.

**Deviation noted:** `federation approve --json` is NOT implemented (A-phase) because approve produces no parseable result the app needs; the app fires approve and re-reads peer state. This narrows A5/spec slightly and is the only intentional scope trim.

---

## v2 backlog (file as beads during handoff)
- **Per-agent outbound allow-list** — new daemon authorization primitive + wire-format advertisement + CLI verbs; then replace `AuthorizationStepView` internals + `AuthorizationPolicy`.
- **Invite/accept rendezvous flow** in the wizard (`ogp federation invite` / `accept <token>`).
- **Start-tunnel-from-wizard** when the gateway isn't publicly reachable (`ogp tunnel start`).
