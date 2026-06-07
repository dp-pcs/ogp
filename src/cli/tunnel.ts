import { spawn, execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { Command } from 'commander';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { loadConfig, requireConfig, getConfigDir } from '../shared/config.js';

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

/**
 * Best-effort extraction of ingress hostnames from a cloudflared config.yml.
 * Used to resolve a public hostname for named tunnels during reconcile.
 */
export function parseCloudflaredIngressHosts(yamlText: string): string[] {
  const hosts: string[] = [];
  for (const line of yamlText.split('\n')) {
    const m = line.match(/^\s*-?\s*hostname:\s*["']?([^"'#\s/]+)/);
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

export interface TunnelJson {
  tools: TunnelPane[];
  reconcile: ReconcileResult | null;
}

/** Pure shaping for `ogp tunnel list --json`. */
export function buildTunnelJson(
  panes: TunnelPane[],
  reconcile: ReconcileResult | null
): TunnelJson {
  return { tools: panes, reconcile };
}

export async function tunnelList(tool?: TunnelTool, json = false): Promise<void> {
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

  if (json) {
    console.log(JSON.stringify(buildTunnelJson(panes, reconcile), null, 2));
    return;
  }

  console.log(renderTunnels(panes, reconcile));
}

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
    fs.closeSync(logStream);
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
 * status instead of starting a duplicate. Note: the duplicate-guard relies on the
 * background PID file (and the ngrok :4040 agent), so a foreground cloudflared quick
 * tunnel started twice cannot be detected — cloudflared exposes no local agent to query.
 */
export async function tunnelStart(tool: TunnelTool, background = false): Promise<void> {
  const config = requireConfig();

  if (!commandExists(tool)) {
    console.error(`${tool} not installed — \`brew install ${tool}\``);
    process.exitCode = 1;
    return;
  }

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
  } catch (error: any) {
    if (error?.code === 'ESRCH') {
      console.log('Tunnel already stopped (process exited between checks)');
      try { fs.unlinkSync(pidFile); } catch { /* already gone */ }
    } else {
      console.error('Failed to stop tunnel:', error);
    }
  }
}

export const tunnelCommand = new Command('tunnel')
  .description('Inspect and manage cloudflared / ngrok tunnels');

tunnelCommand
  .command('list')
  .alias('show')
  .description('List running tunnels (cloudflared, ngrok, or both)')
  .argument('[tool]', 'Limit to one tool: cloudflared | ngrok')
  .option('--json', 'Output machine-readable JSON')
  .action(async (tool: string | undefined, options: { json?: boolean }) => {
    if (tool && tool !== 'cloudflared' && tool !== 'ngrok') {
      console.error(`Unknown tool '${tool}'. Use 'cloudflared' or 'ngrok'.`);
      process.exitCode = 1;
      return;
    }
    await tunnelList(tool as TunnelTool | undefined, options.json ?? false);
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
