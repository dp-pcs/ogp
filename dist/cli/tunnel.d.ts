import { Command } from 'commander';
export type TunnelTool = 'cloudflared' | 'ngrok';
export interface TunnelInfo {
    tool: TunnelTool;
    name?: string;
    id?: string;
    publicUrl?: string;
    target?: string;
    live: boolean;
    detail?: string;
    source: string;
}
/**
 * Parse the JSON array emitted by `cloudflared tunnel list --output json`.
 * Filters out deleted tunnels and classifies live = has active connections.
 * Returns [] on any parse failure (caller surfaces the raw error separately).
 */
export declare function parseCloudflaredTunnels(jsonText: string): TunnelInfo[];
/**
 * Parse the JSON from the ngrok local agent API (http://127.0.0.1:4040/api/tunnels).
 * ngrok historically returns one entry per proto (http + https) for the same
 * forward; we dedupe by public-URL host, preferring https. Returns [] on failure.
 */
export declare function parseNgrokAgentTunnels(jsonText: string): TunnelInfo[];
/**
 * Best-effort extraction of ingress hostnames from a cloudflared config.yml.
 * Used to resolve a public hostname for named tunnels during reconcile.
 */
export declare function parseCloudflaredIngressHosts(yamlText: string): string[];
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
export declare function reconcileGatewayUrl(liveHosts: string[], gatewayUrl: string | undefined): ReconcileResult | null;
export interface TunnelPane {
    tool: TunnelTool;
    infos: TunnelInfo[];
    error?: string;
    note?: string;
}
/**
 * Format tunnel panes for the terminal. Pure: takes resolved data, returns a string.
 */
export declare function renderTunnels(panes: TunnelPane[], reconcile: ReconcileResult | null): string;
export declare function listCloudflaredTunnels(): Promise<TunnelPane>;
export declare function listNgrokTunnels(): Promise<TunnelPane>;
export interface TunnelJson {
    tools: TunnelPane[];
    reconcile: ReconcileResult | null;
}
/** Pure shaping for `ogp tunnel list --json`. */
export declare function buildTunnelJson(panes: TunnelPane[], reconcile: ReconcileResult | null): TunnelJson;
export declare function tunnelList(tool?: TunnelTool, json?: boolean): Promise<void>;
/**
 * Start a quick tunnel for the given tool. Idempotent: if an ogp-managed tunnel is
 * already alive (or, for ngrok, a local agent is already serving), prints current
 * status instead of starting a duplicate. Note: the duplicate-guard relies on the
 * background PID file (and the ngrok :4040 agent), so a foreground cloudflared quick
 * tunnel started twice cannot be detected — cloudflared exposes no local agent to query.
 */
export declare function tunnelStart(tool: TunnelTool, background?: boolean): Promise<void>;
/**
 * Outcome of a stop attempt. `no-managed-tunnel` is the bd-iakg case: ogp has no
 * tracked tunnel to stop (the gateway may be served by an externally-started
 * tunnel ogp can't manage). Callers — including the Companion — must be able to
 * distinguish this from an actual stop, instead of treating it as success.
 */
export type TunnelStopStatus = 'stopped' | 'no-managed-tunnel' | 'already-stopped' | 'error';
/** Stop the ogp-managed tunnel (PID file). Does not affect externally-started tunnels. */
export declare function tunnelStop(opts?: {
    json?: boolean;
}): TunnelStopStatus;
export declare const tunnelCommand: Command;
//# sourceMappingURL=tunnel.d.ts.map