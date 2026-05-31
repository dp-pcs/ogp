# `ogp tunnel` Command Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an `ogp tunnel` command namespace that lists running cloudflared/ngrok tunnels (by wrapping each tool's native CLI), starts/stops them, and reconciles their public URL against config `gatewayUrl`.

**Architecture:** A new `src/cli/tunnel.ts` module. Pure parse/reconcile/render functions (unit-tested with canned strings — no live tunnels) are separated from I/O orchestration (shelling out to `cloudflared tunnel list --output json`, fetching the ngrok agent API at `127.0.0.1:4040`, spawning tunnels). `expose.ts` is reduced to thin deprecated shims. Commands are registered in `cli.ts` mirroring the existing `configCommand` pattern.

**Tech Stack:** TypeScript (ESM, `.js` import specifiers), Commander, Node `child_process` (`execFile`/`spawn`), global `fetch`, Vitest.

**Spec:** `docs/superpowers/specs/2026-05-31-ogp-tunnel-command-design.md`

**Git note:** This repo runs in **stealth mode (no git ops)** per the `.agent` ledger. Each task ends in a **Checkpoint** (run tests / build) instead of a commit. Do NOT run `git add`/`git commit`/`git push` unless David explicitly asks.

---

## File Structure

- **Create** `src/cli/tunnel.ts` — types, pure parsers/reconcile/render, I/O orchestration, spawn/stop helpers, and the `tunnelCommand` is wired separately in `cli.ts`.
- **Create** `test/tunnel-parse.test.ts` — unit tests for the pure functions.
- **Modify** `src/cli/expose.ts` — reduce to deprecated shims that forward to `tunnel.ts`.
- **Modify** `src/cli.ts` — register `tunnelCommand`; mark `expose`/`expose-stop` hidden; keep `shutdown` working.

Reference patterns:
- Subcommand registration: `src/cli/config.ts:533-557` (`new Command('config').command('show')…`).
- `execFile` + `promisify`: `src/cli/install.ts:4-7`.
- `commandExists` via `which`/`where`: `src/shared/framework-detection.ts:21-28`.
- Existing spawn logic to move: `src/cli/expose.ts:61-125`.
- Test style: `test/openclaw-bridge-config.test.ts:1-3`.

---

## Task 0: Track the work in beads

**This project mandates a beads issue before writing code (project CLAUDE.md).**

- [ ] **Step 1: Create the issue**

Run:
```bash
bd create --title="Add 'ogp tunnel' command (list/start/stop over native cloudflared+ngrok CLIs)" \
  --description="Add ogp tunnel list [tool] wrapping 'cloudflared tunnel list --output json' and the ngrok :4040 agent API, plus idempotent start/stop. Replace expose/expose-stop with hidden deprecated aliases. Reconcile public URL vs gatewayUrl. Spec: docs/superpowers/specs/2026-05-31-ogp-tunnel-command-design.md" \
  --type=feature --priority=2
```
Expected: prints a new issue id (e.g. `ogp-NNN`). Note it for the close step.

- [ ] **Step 2: Claim it**

Run: `bd update <id> --claim`
Expected: status → in_progress.

---

## Task 1: Module skeleton + cloudflared parser

**Files:**
- Create: `src/cli/tunnel.ts`
- Test: `test/tunnel-parse.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/tunnel-parse.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { parseCloudflaredTunnels } from '../src/cli/tunnel.js';

describe('parseCloudflaredTunnels', () => {
  const sample = JSON.stringify([
    {
      id: '1aa71419-e610-4870-b6d3-dbe25be309e1',
      name: 'sarcastek-backend',
      created_at: '2025-12-17T20:53:16Z',
      deleted_at: '0001-01-01T00:00:00Z',
      connections: [
        { colo_name: 'den01', opened_at: '2026-05-30T14:31:03Z' },
        { colo_name: 'dfw08', opened_at: '2026-05-30T14:31:03Z' },
        { colo_name: 'den01', opened_at: '2026-05-30T14:31:03Z' }
      ]
    },
    {
      id: '38588f09-ca59-4629-9fa3-4286e9bca3e6',
      name: 'idle-tunnel',
      created_at: '2025-01-01T00:00:00Z',
      deleted_at: '0001-01-01T00:00:00Z',
      connections: []
    },
    {
      id: 'deleted-one',
      name: 'gone',
      deleted_at: '2025-06-01T00:00:00Z',
      connections: []
    }
  ]);

  it('parses named tunnels and classifies live vs idle', () => {
    const infos = parseCloudflaredTunnels(sample);
    expect(infos).toHaveLength(2); // deleted tunnel filtered out
    const live = infos.find((t) => t.name === 'sarcastek-backend')!;
    expect(live.tool).toBe('cloudflared');
    expect(live.live).toBe(true);
    expect(live.id).toBe('1aa71419-e610-4870-b6d3-dbe25be309e1');
    expect(live.detail).toContain('den01');
    expect(live.detail).toContain('dfw08');
    // datacenters deduped
    expect(live.detail!.match(/den01/g)).toHaveLength(1);
    const idle = infos.find((t) => t.name === 'idle-tunnel')!;
    expect(idle.live).toBe(false);
  });

  it('returns [] on invalid JSON', () => {
    expect(parseCloudflaredTunnels('not json')).toEqual([]);
    expect(parseCloudflaredTunnels('{"not":"an array"}')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/tunnel-parse.test.ts`
Expected: FAIL — cannot resolve `../src/cli/tunnel.js` / `parseCloudflaredTunnels is not a function`.

- [ ] **Step 3: Write minimal implementation**

Create `src/cli/tunnel.ts`:

```typescript
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const execFileAsync = promisify(execFile);

export type TunnelTool = 'cloudflared' | 'ngrok';

export interface TunnelInfo {
  tool: TunnelTool;
  name?: string;       // cloudflared tunnel name / ngrok tunnel name
  id?: string;         // cloudflared tunnel id
  publicUrl?: string;  // resolvable public URL (ngrok agent, or cloudflared ingress)
  target?: string;     // local address being forwarded (ngrok)
  live: boolean;       // has active connections / is running
  detail?: string;     // datacenters / proto / misc
  source: string;      // human label for where this came from
}

/**
 * Parse the JSON array emitted by `cloudflared tunnel list --output json`.
 * Filters out deleted tunnels and classifies live = has active connections.
 * Returns [] on any parse failure (caller surfaces the raw error separately).
 */
export function parseCloudflaredTunnels(jsonText: string): TunnelInfo[] {
  let arr: unknown;
  try {
    arr = JSON.parse(jsonText);
  } catch {
    return [];
  }
  if (!Array.isArray(arr)) return [];

  return arr
    .filter((t: any) => !t?.deleted_at || String(t.deleted_at).startsWith('0001-01-01'))
    .map((t: any) => {
      const conns = Array.isArray(t.connections) ? t.connections : [];
      const colos = Array.from(
        new Set(conns.map((c: any) => c?.colo_name).filter(Boolean))
      ) as string[];
      return {
        tool: 'cloudflared' as const,
        name: typeof t.name === 'string' ? t.name : undefined,
        id: typeof t.id === 'string' ? t.id : undefined,
        live: conns.length > 0,
        detail: colos.length ? `via ${colos.join(', ')}` : undefined,
        source: 'cloudflared tunnel list'
      };
    });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/tunnel-parse.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Checkpoint**

Run: `npx vitest run test/tunnel-parse.test.ts` — confirm green. (No commit — stealth mode.)

---

## Task 2: ngrok agent parser

**Files:**
- Modify: `src/cli/tunnel.ts`
- Test: `test/tunnel-parse.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `test/tunnel-parse.test.ts`:

```typescript
import { parseNgrokAgentTunnels } from '../src/cli/tunnel.js';

describe('parseNgrokAgentTunnels', () => {
  const sample = JSON.stringify({
    tunnels: [
      {
        name: 'command_line',
        public_url: 'https://abc123.ngrok-free.app',
        proto: 'https',
        config: { addr: 'http://localhost:18790' }
      },
      {
        name: 'command_line (http)',
        public_url: 'http://abc123.ngrok-free.app',
        proto: 'http',
        config: { addr: 'http://localhost:18790' }
      }
    ]
  });

  it('parses running agent tunnels, prefers https, dedupes by host', () => {
    const infos = parseNgrokAgentTunnels(sample);
    expect(infos).toHaveLength(1);
    expect(infos[0].tool).toBe('ngrok');
    expect(infos[0].publicUrl).toBe('https://abc123.ngrok-free.app');
    expect(infos[0].target).toBe('http://localhost:18790');
    expect(infos[0].live).toBe(true);
  });

  it('returns [] when no tunnels or invalid JSON', () => {
    expect(parseNgrokAgentTunnels('{"tunnels":[]}')).toEqual([]);
    expect(parseNgrokAgentTunnels('garbage')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/tunnel-parse.test.ts`
Expected: FAIL — `parseNgrokAgentTunnels is not a function`.

- [ ] **Step 3: Write minimal implementation**

Append to `src/cli/tunnel.ts`:

```typescript
/**
 * Parse the JSON from the ngrok local agent API (http://127.0.0.1:4040/api/tunnels).
 * ngrok historically returns one entry per proto (http + https) for the same
 * forward; we dedupe by public-URL host, preferring https. Returns [] on failure.
 */
export function parseNgrokAgentTunnels(jsonText: string): TunnelInfo[] {
  let obj: any;
  try {
    obj = JSON.parse(jsonText);
  } catch {
    return [];
  }
  const tunnels = Array.isArray(obj?.tunnels) ? obj.tunnels : [];

  const byHost = new Map<string, TunnelInfo>();
  for (const t of tunnels) {
    const publicUrl: string | undefined = typeof t?.public_url === 'string' ? t.public_url : undefined;
    if (!publicUrl) continue;
    let host: string;
    try {
      host = new URL(publicUrl).host;
    } catch {
      continue;
    }
    const isHttps = publicUrl.startsWith('https://');
    const existing = byHost.get(host);
    if (existing && !isHttps) continue; // keep https over http for same host
    byHost.set(host, {
      tool: 'ngrok',
      name: typeof t.name === 'string' ? t.name : undefined,
      publicUrl,
      target: typeof t?.config?.addr === 'string' ? t.config.addr : undefined,
      live: true,
      detail: typeof t?.proto === 'string' ? t.proto : undefined,
      source: 'ngrok agent (:4040)'
    });
  }
  return Array.from(byHost.values());
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/tunnel-parse.test.ts`
Expected: PASS (4 tests total).

- [ ] **Step 5: Checkpoint**

Run: `npx vitest run test/tunnel-parse.test.ts` — confirm green.

---

## Task 3: cloudflared ingress host parser + gatewayUrl reconcile

**Files:**
- Modify: `src/cli/tunnel.ts`
- Test: `test/tunnel-parse.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `test/tunnel-parse.test.ts`:

```typescript
import { parseCloudflaredIngressHosts, reconcileGatewayUrl } from '../src/cli/tunnel.js';

describe('parseCloudflaredIngressHosts', () => {
  it('extracts hostnames from a cloudflared config.yml ingress block', () => {
    const yaml = `
tunnel: abc-123
credentials-file: ~/.cloudflared/abc-123.json

ingress:
  - hostname: ogp.example.com
    service: http://localhost:18790
  - hostname: hermes.example.com
    service: http://localhost:18793
  - service: http_status:404
`;
    expect(parseCloudflaredIngressHosts(yaml)).toEqual(['ogp.example.com', 'hermes.example.com']);
  });

  it('returns [] when no ingress hostnames present', () => {
    expect(parseCloudflaredIngressHosts('tunnel: x\n')).toEqual([]);
  });
});

describe('reconcileGatewayUrl', () => {
  it('returns null when gatewayUrl missing or unparseable', () => {
    expect(reconcileGatewayUrl(['ogp.example.com'], undefined)).toBeNull();
    expect(reconcileGatewayUrl(['ogp.example.com'], 'not a url')).toBeNull();
  });

  it('match verdict when a live host equals the gateway host', () => {
    const r = reconcileGatewayUrl(['ogp.example.com'], 'https://ogp.example.com')!;
    expect(r.verdict).toBe('match');
    expect(r.message).toContain('✓');
  });

  it('mismatch verdict when live hosts differ from gateway host', () => {
    const r = reconcileGatewayUrl(['abc123.ngrok-free.app'], 'https://ogp.example.com')!;
    expect(r.verdict).toBe('mismatch');
    expect(r.message).toContain('✗');
  });

  it('none verdict when no live hosts at all', () => {
    const r = reconcileGatewayUrl([], 'https://ogp.example.com')!;
    expect(r.verdict).toBe('none');
    expect(r.message).toContain('⚠');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/tunnel-parse.test.ts`
Expected: FAIL — `parseCloudflaredIngressHosts is not a function`.

- [ ] **Step 3: Write minimal implementation**

Append to `src/cli/tunnel.ts`:

```typescript
/**
 * Best-effort extraction of ingress hostnames from a cloudflared config.yml.
 * Used to resolve a public hostname for named tunnels during reconcile.
 */
export function parseCloudflaredIngressHosts(yamlText: string): string[] {
  const hosts: string[] = [];
  for (const line of yamlText.split('\n')) {
    const m = line.match(/^\s*-?\s*hostname:\s*["']?([^"'#\s]+)/);
    if (m) hosts.push(m[1]);
  }
  return hosts;
}

export interface ReconcileResult {
  verdict: 'match' | 'mismatch' | 'none';
  message: string;
}

/**
 * Compare resolvable live public hosts against config gatewayUrl.
 * `liveHosts` is the precomputed set of hosts (ngrok public_url hosts + cloudflared
 * ingress hosts when a cloudflared tunnel is live). Pure; returns null when there is
 * nothing meaningful to report.
 */
export function reconcileGatewayUrl(
  liveHosts: string[],
  gatewayUrl: string | undefined
): ReconcileResult | null {
  if (!gatewayUrl) return null;
  let gwHost: string;
  try {
    gwHost = new URL(gatewayUrl).host;
  } catch {
    return null;
  }
  if (liveHosts.length === 0) {
    return {
      verdict: 'none',
      message: `⚠ gatewayUrl ${gwHost} is set but no live tunnel with a resolvable public URL serves it`
    };
  }
  if (liveHosts.includes(gwHost)) {
    return { verdict: 'match', message: `✓ gatewayUrl ${gwHost} is served by a live tunnel` };
  }
  return {
    verdict: 'mismatch',
    message: `✗ gatewayUrl ${gwHost} does not match any live tunnel (live: ${liveHosts.join(', ')})`
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/tunnel-parse.test.ts`
Expected: PASS (10 tests total).

- [ ] **Step 5: Checkpoint**

Run: `npx vitest run test/tunnel-parse.test.ts` — confirm green.

---

## Task 4: Render function

**Files:**
- Modify: `src/cli/tunnel.ts`
- Test: `test/tunnel-parse.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `test/tunnel-parse.test.ts`:

```typescript
import { renderTunnels, type TunnelPane } from '../src/cli/tunnel.js';

describe('renderTunnels', () => {
  it('renders both panes with labels and a reconcile line', () => {
    const cf: TunnelPane = {
      tool: 'cloudflared',
      infos: [
        { tool: 'cloudflared', name: 'sarcastek-backend', id: '1aa71419xxxx', live: true, detail: 'via den01, dfw08', source: 'cloudflared tunnel list' }
      ]
    };
    const ng: TunnelPane = {
      tool: 'ngrok',
      infos: [
        { tool: 'ngrok', publicUrl: 'https://abc123.ngrok-free.app', target: 'http://localhost:18790', live: true, detail: 'https', source: 'ngrok agent (:4040)' }
      ]
    };
    const out = renderTunnels([cf, ng], { verdict: 'match', message: '✓ gatewayUrl ogp.example.com is served by a live tunnel' });
    expect(out).toContain('cloudflared');
    expect(out).toContain('sarcastek-backend');
    expect(out).toContain('LIVE');
    expect(out).toContain('ngrok');
    expect(out).toContain('https://abc123.ngrok-free.app');
    expect(out).toContain('✓ gatewayUrl');
  });

  it('renders an error pane without throwing', () => {
    const cf: TunnelPane = { tool: 'cloudflared', infos: [], error: 'cloudflared not installed' };
    const out = renderTunnels([cf], null);
    expect(out).toContain('cloudflared not installed');
  });

  it('shows an empty-state message when a pane has no tunnels', () => {
    const ng: TunnelPane = { tool: 'ngrok', infos: [] };
    const out = renderTunnels([ng], null);
    expect(out.toLowerCase()).toContain('no ');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/tunnel-parse.test.ts`
Expected: FAIL — `renderTunnels is not a function`.

- [ ] **Step 3: Write minimal implementation**

Append to `src/cli/tunnel.ts`:

```typescript
export interface TunnelPane {
  tool: TunnelTool;
  infos: TunnelInfo[];
  error?: string;       // top-level failure (not installed, not logged in, etc.)
  note?: string;        // extra context line (e.g. account-section omitted)
}

const PANE_LABEL: Record<TunnelTool, string> = {
  cloudflared: 'cloudflared — named tunnels registered to your Cloudflare account',
  ngrok: 'ngrok — tunnels running on this machine'
};

/**
 * Format tunnel panes for the terminal. Pure: takes resolved data, returns a string.
 */
export function renderTunnels(panes: TunnelPane[], reconcile: ReconcileResult | null): string {
  const lines: string[] = [];
  for (const pane of panes) {
    lines.push('');
    lines.push(`▸ ${PANE_LABEL[pane.tool]}`);
    if (pane.error) {
      lines.push(`  ⚠ ${pane.error}`);
      if (pane.note) lines.push(`    ${pane.note}`);
      continue;
    }
    if (pane.infos.length === 0) {
      lines.push(`  (no ${pane.tool} tunnels found)`);
      if (pane.note) lines.push(`    ${pane.note}`);
      continue;
    }
    for (const t of pane.infos) {
      const status = t.live ? 'LIVE' : 'idle';
      const label = t.name ?? t.publicUrl ?? t.id ?? '(unnamed)';
      const bits = [
        `  [${status}] ${label}`,
        t.publicUrl && t.publicUrl !== label ? `→ ${t.publicUrl}` : '',
        t.target ? `(${t.target})` : '',
        t.id && t.id !== label ? `id=${t.id.slice(0, 8)}` : '',
        t.detail ? t.detail : ''
      ].filter(Boolean);
      lines.push(bits.join(' '));
    }
    if (pane.note) lines.push(`    ${pane.note}`);
  }
  if (reconcile) {
    lines.push('');
    lines.push(reconcile.message);
  }
  return lines.join('\n');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/tunnel-parse.test.ts`
Expected: PASS (13 tests total).

- [ ] **Step 5: Checkpoint**

Run: `npx vitest run test/tunnel-parse.test.ts` — confirm green.

---

## Task 5: I/O orchestration — list cloudflared & ngrok, then `tunnelList`

**Files:**
- Modify: `src/cli/tunnel.ts`

No new unit tests here (these functions do real I/O — exercised in the Task 8 smoke test). Keep them thin so all logic lives in the already-tested pure functions.

- [ ] **Step 1: Add a binary-presence helper**

Append to `src/cli/tunnel.ts`:

```typescript
/** Check if a command exists in PATH (mirrors framework-detection.ts). */
function commandExists(command: string): boolean {
  try {
    const which = process.platform === 'win32' ? 'where' : 'which';
    execFileSync(which, [command], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}
```

- [ ] **Step 2: Add the cloudflared list orchestrator**

Append to `src/cli/tunnel.ts`:

```typescript
export async function listCloudflaredTunnels(): Promise<TunnelPane> {
  if (!commandExists('cloudflared')) {
    return { tool: 'cloudflared', infos: [], error: 'cloudflared not installed — `brew install cloudflared`' };
  }
  try {
    const { stdout } = await execFileAsync('cloudflared', ['tunnel', 'list', '--output', 'json'], {
      timeout: 15000
    });
    return { tool: 'cloudflared', infos: parseCloudflaredTunnels(stdout) };
  } catch (err: any) {
    const stderr = (err?.stderr || err?.message || '').toString().trim();
    const note = /login|cert|origincert|not.*authenticat/i.test(stderr)
      ? 'Run `cloudflared tunnel login` to authenticate.'
      : undefined;
    return {
      tool: 'cloudflared',
      infos: [],
      error: `cloudflared tunnel list failed: ${stderr.split('\n')[0] || 'unknown error'}`,
      note
    };
  }
}
```

- [ ] **Step 3: Add the ngrok list orchestrator**

Append to `src/cli/tunnel.ts`:

```typescript
async function fetchNgrokAgent(): Promise<TunnelInfo[] | null> {
  // Probe the default agent port and the next two (multiple agents bump the port).
  for (const port of [4040, 4041, 4042]) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/tunnels`, {
        signal: AbortSignal.timeout(2000)
      });
      if (!res.ok) continue;
      const infos = parseNgrokAgentTunnels(await res.text());
      if (infos.length > 0) return infos;
    } catch {
      // try next port
    }
  }
  return null;
}

export async function listNgrokTunnels(): Promise<TunnelPane> {
  if (!commandExists('ngrok')) {
    return { tool: 'ngrok', infos: [], error: 'ngrok not installed — `brew install ngrok`' };
  }
  const agent = await fetchNgrokAgent();
  if (agent && agent.length > 0) {
    return { tool: 'ngrok', infos: agent };
  }
  return { tool: 'ngrok', infos: [], note: 'No local ngrok agent running on :4040.' };
}
```

> Account-API (`ngrok api tunnels list`) is intentionally deferred: the spec's
> "local agent, then account" choice makes the account section optional, and it
> only renders when an API key is configured. Adding it later is isolated to this
> function — out of scope for the first cut to keep the agent path zero-config.

- [ ] **Step 4: Add `tunnelList` (loads config, resolves reconcile, prints)**

Append to `src/cli/tunnel.ts` (note the `loadConfig`/`getConfigDir` imports added at the top in Step 5):

```typescript
export async function tunnelList(tool?: TunnelTool): Promise<void> {
  const panes: TunnelPane[] = [];
  if (!tool || tool === 'cloudflared') panes.push(await listCloudflaredTunnels());
  if (!tool || tool === 'ngrok') panes.push(await listNgrokTunnels());

  // Build the set of resolvable live public hosts for reconcile.
  const liveHosts: string[] = [];
  for (const pane of panes) {
    for (const info of pane.infos) {
      if (info.live && info.publicUrl) {
        try {
          liveHosts.push(new URL(info.publicUrl).host);
        } catch {
          /* skip */
        }
      }
    }
  }
  // cloudflared named tunnels: if any is live, treat config.yml ingress hosts as live.
  const cfPane = panes.find((p) => p.tool === 'cloudflared');
  if (cfPane && cfPane.infos.some((i) => i.live)) {
    const cfgPath = path.join(os.homedir(), '.cloudflared', 'config.yml');
    if (fs.existsSync(cfgPath)) {
      liveHosts.push(...parseCloudflaredIngressHosts(fs.readFileSync(cfgPath, 'utf-8')));
    }
  }

  const config = loadConfig();
  const reconcile = config ? reconcileGatewayUrl(liveHosts, config.gatewayUrl) : null;

  console.log(renderTunnels(panes, reconcile));
}
```

- [ ] **Step 5: Add the config imports**

At the top of `src/cli/tunnel.ts`, add to the imports:

```typescript
import { loadConfig, requireConfig, getConfigDir } from '../shared/config.js';
```

(`requireConfig` and `getConfigDir` are used by the start/stop helpers in Task 6.)

- [ ] **Step 6: Verify it compiles**

Run: `npm run build`
Expected: tsc completes with no errors. (If `loadConfig` returns a different nullable shape, adjust the `config ?` guard accordingly — confirm against `src/shared/config.ts`.)

- [ ] **Step 7: Checkpoint**

Run: `npx vitest run test/tunnel-parse.test.ts && npm run build` — both green.

---

## Task 6: Move spawn helpers; `tunnelStart` (idempotent), `tunnelStop`; deprecate `expose.ts`

**Files:**
- Modify: `src/cli/tunnel.ts`
- Modify: `src/cli/expose.ts`

- [ ] **Step 1: Add PID/log paths + spawn helpers + start/stop to `tunnel.ts`**

Append to `src/cli/tunnel.ts` (this is the logic moved from `expose.ts:6-125`, plus an idempotency guard):

```typescript
function getTunnelPidFile(): string {
  return path.join(getConfigDir(), 'tunnel.pid');
}

function getTunnelLogFile(): string {
  return path.join(getConfigDir(), 'tunnel.log');
}

/** True if the ogp-managed tunnel PID file points at a live process. */
function isManagedTunnelAlive(): boolean {
  const pidFile = getTunnelPidFile();
  if (!fs.existsSync(pidFile)) return false;
  const pid = parseInt(fs.readFileSync(pidFile, 'utf-8').trim(), 10);
  if (Number.isNaN(pid)) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function spawnTunnel(tool: TunnelTool, port: number, background: boolean): void {
  const args = tool === 'cloudflared'
    ? ['tunnel', '--url', `http://localhost:${port}`]
    : ['http', port.toString()];

  if (background) {
    const logStream = fs.openSync(getTunnelLogFile(), 'a');
    const proc = spawn(tool, args, { detached: true, stdio: ['ignore', logStream, logStream] });
    proc.unref();
    fs.writeFileSync(getTunnelPidFile(), proc.pid!.toString(), 'utf-8');
    console.log(`${tool} tunnel started (PID: ${proc.pid})`);
    console.log(`Logs: ${getTunnelLogFile()}`);
    console.log('Run "ogp tunnel stop" to stop the tunnel');
  } else {
    const proc = spawn(tool, args, { stdio: 'inherit' });
    proc.on('error', (error) => {
      console.error(`Failed to start ${tool}:`, error);
      console.log(`Make sure ${tool} is installed and in your PATH`);
    });
    proc.on('close', (code) => console.log(`${tool} exited with code ${code}`));
  }
}

/**
 * Start a quick tunnel for the given tool. Idempotent: if an ogp-managed tunnel is
 * already alive (or, for ngrok, a local agent is already serving), prints current
 * status instead of starting a duplicate.
 */
export async function tunnelStart(tool: TunnelTool, background = false): Promise<void> {
  const config = requireConfig();

  if (isManagedTunnelAlive()) {
    console.log('An ogp-managed tunnel is already running. Current tunnels:');
    await tunnelList(tool);
    return;
  }
  if (tool === 'ngrok') {
    const agent = await fetchNgrokAgent();
    if (agent && agent.length > 0) {
      console.log('A local ngrok agent is already running. Current tunnels:');
      await tunnelList('ngrok');
      return;
    }
  }

  console.log(`Exposing OGP daemon on port ${config.daemonPort} via ${tool}...`);
  if (tool === 'cloudflared') {
    console.log('Install cloudflared: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/');
  } else {
    console.log('Install ngrok: https://ngrok.com/download');
  }
  spawnTunnel(tool, config.daemonPort, background);
}

/** Stop the ogp-managed tunnel (PID file). Does not affect externally-started tunnels. */
export function tunnelStop(): void {
  const pidFile = getTunnelPidFile();
  if (!fs.existsSync(pidFile)) {
    console.log('No ogp-managed tunnel is running.');
    console.log('(Tunnels started outside ogp are not tracked here — stop them with their own CLI.)');
    return;
  }
  try {
    const pid = parseInt(fs.readFileSync(pidFile, 'utf-8').trim(), 10);
    if (Number.isNaN(pid)) {
      console.error('Invalid PID in tunnel.pid file');
      fs.unlinkSync(pidFile);
      return;
    }
    try {
      process.kill(pid, 0);
    } catch {
      console.log('Tunnel is not running (stale PID file)');
      fs.unlinkSync(pidFile);
      return;
    }
    process.kill(pid, 'SIGTERM');
    fs.unlinkSync(pidFile);
    console.log('Tunnel stopped');
  } catch (error) {
    console.error('Failed to stop tunnel:', error);
  }
}
```

- [ ] **Step 2: Reduce `expose.ts` to deprecated shims**

Replace the entire contents of `src/cli/expose.ts` with:

```typescript
import { tunnelStart, tunnelStop, type TunnelTool } from './tunnel.js';

/** @deprecated Use `ogp tunnel start`. Retained as a hidden alias. */
export async function expose(method: TunnelTool = 'cloudflared', background = false): Promise<void> {
  console.log("[deprecated] 'ogp expose' is now 'ogp tunnel start'. Forwarding…");
  await tunnelStart(method, background);
}

/** @deprecated Use `ogp tunnel stop`. Retained as a hidden alias. */
export function stopExpose(): void {
  console.log("[deprecated] 'ogp expose-stop' is now 'ogp tunnel stop'. Forwarding…");
  tunnelStop();
}
```

- [ ] **Step 3: Verify it compiles**

Run: `npm run build`
Expected: tsc completes with no errors. The existing `import { expose, stopExpose } from './cli/expose.js'` in `cli.ts` still resolves.

- [ ] **Step 4: Checkpoint**

Run: `npx vitest run test/tunnel-parse.test.ts && npm run build` — both green.

---

## Task 7: Register the `tunnel` command; hide the `expose` aliases

**Files:**
- Modify: `src/cli/tunnel.ts` (export `tunnelCommand`)
- Modify: `src/cli.ts:782-806` (register command, hide aliases)

- [ ] **Step 1: Export a `tunnelCommand` from `tunnel.ts`**

Append to `src/cli/tunnel.ts`:

```typescript
import { Command } from 'commander';

export const tunnelCommand = new Command('tunnel')
  .description('Inspect and manage cloudflared / ngrok tunnels');

tunnelCommand
  .command('list')
  .alias('show')
  .description('List running tunnels (cloudflared, ngrok, or both)')
  .argument('[tool]', 'Limit to one tool: cloudflared | ngrok')
  .action(async (tool?: string) => {
    if (tool && tool !== 'cloudflared' && tool !== 'ngrok') {
      console.error(`Unknown tool '${tool}'. Use 'cloudflared' or 'ngrok'.`);
      process.exitCode = 1;
      return;
    }
    await tunnelList(tool as TunnelTool | undefined);
  });

tunnelCommand
  .command('start')
  .description('Start a quick tunnel (idempotent — no-op if one is already running)')
  .argument('<tool>', 'cloudflared | ngrok')
  .option('-b, --background', 'Run in background')
  .action(async (tool: string, options: { background?: boolean }) => {
    if (tool !== 'cloudflared' && tool !== 'ngrok') {
      console.error(`Unknown tool '${tool}'. Use 'cloudflared' or 'ngrok'.`);
      process.exitCode = 1;
      return;
    }
    await tunnelStart(tool as TunnelTool, options.background ?? false);
  });

tunnelCommand
  .command('stop')
  .description('Stop the ogp-managed tunnel')
  .action(() => {
    tunnelStop();
  });
```

Add `Command` to the import at the top if not already present (it is a new import for this file).

- [ ] **Step 2: Register the command and hide the deprecated aliases in `cli.ts`**

In `src/cli.ts`, add the import near the existing expose import (line 31):

```typescript
import { tunnelCommand } from './cli/tunnel.js';
```

Then replace the `expose` and `expose-stop` command blocks (`src/cli.ts:782-796`) with hidden versions, and register the new command. The block becomes:

```typescript
program.addCommand(tunnelCommand);

program
  .command('expose', { hidden: true })
  .description('[deprecated] Use "ogp tunnel start"')
  .option('-m, --method <method>', 'Tunnel method (cloudflared|ngrok)', 'cloudflared')
  .option('-b, --background', 'Run in background')
  .action(async (options) => {
    await expose(options.method, options.background);
  });

program
  .command('expose-stop', { hidden: true })
  .description('[deprecated] Use "ogp tunnel stop"')
  .action(() => {
    stopExpose();
  });
```

Leave the existing `shutdown` command (`src/cli.ts:798-806`) unchanged — it already calls `stopExpose()`, which now forwards to `tunnelStop()`.

- [ ] **Step 3: Verify it compiles**

Run: `npm run build`
Expected: tsc completes with no errors.

- [ ] **Step 4: Checkpoint**

Run: `npx vitest run test/tunnel-parse.test.ts && npm run build` — both green.

---

## Task 8: Full verification — build, test suite, manual smoke

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npx vitest run`
Expected: all tests pass, including the 13 in `test/tunnel-parse.test.ts`. No regressions in existing suites.

- [ ] **Step 2: Build and smoke-test `tunnel list`**

Run:
```bash
npm run build
node dist/cli.js tunnel list
```
Expected: a cloudflared pane listing named tunnels (e.g. `sarcastek-backend` LIVE with datacenters) and an ngrok pane saying "No local ngrok agent running on :4040." No crash. A reconcile line appears if `gatewayUrl` is set in the active config.

- [ ] **Step 3: Smoke-test single-tool + help**

Run:
```bash
node dist/cli.js tunnel list cloudflared
node dist/cli.js tunnel list ngrok
node dist/cli.js tunnel --help
node dist/cli.js tunnel list badtool   # expect: "Unknown tool 'badtool'" + exit code 1
```
Expected: each behaves as described; `--help` shows `list`, `start`, `stop`.

- [ ] **Step 4: Smoke-test deprecated alias forwarding**

Run:
```bash
node dist/cli.js expose-stop   # expect deprecation line + "No ogp-managed tunnel is running."
node dist/cli.js --help        # expect: NO 'expose' / 'expose-stop' in the visible command list (hidden)
```
Expected: alias prints the `[deprecated]` pointer then forwards; hidden commands absent from top-level help but still runnable.

- [ ] **Step 5: Close the beads issue**

Run: `bd close <id> --reason="Implemented ogp tunnel list/start/stop over native cloudflared+ngrok CLIs; expose/expose-stop now hidden aliases"`
Expected: issue closed.

- [ ] **Step 6: Report to David**

Summarize: what was added, the test count, smoke results, and note that nothing was committed (stealth mode) — ask whether he wants it committed/pushed.

---

## Self-Review (completed during authoring)

- **Spec coverage:** `tunnel list` (native cloudflared JSON + ngrok :4040) → Tasks 1,2,5; honest per-pane labels → Task 4 (`PANE_LABEL`); gatewayUrl reconcile ✓/✗/⚠ → Tasks 3,5; idempotent `start` + `stop` → Task 6; `expose`/`expose-stop` hidden aliases → Tasks 6,7; `--for` inheritance → free via existing `preAction` hook (no task needed); YAGNI items (named-tunnel creation, Windows, auto-edit gatewayUrl, account API) → explicitly deferred (Task 5 note).
- **Placeholder scan:** none — every code step contains full code; commands have expected output.
- **Type consistency:** `TunnelInfo`, `TunnelTool`, `TunnelPane`, `ReconcileResult` defined in Tasks 1/3/4 and used consistently; `tunnelList`/`tunnelStart`/`tunnelStop`/`listCloudflaredTunnels`/`listNgrokTunnels`/`fetchNgrokAgent` names stable across Tasks 5–7.
- **Known follow-up to confirm at execution:** verify `loadConfig()`'s nullable return shape against `src/shared/config.ts` (Task 5 Step 6 guard) and that ngrok account-API rendering remains out of scope.
