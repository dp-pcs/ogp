/**
 * OpenClaw Bridge for OGP Notifications
 *
 * Primary path: /hooks/agent so OpenClaw can run an isolated agent turn and
 * deliver the result through its normal channel-routing logic.
 *
 * Secondary path: Gateway RPC sessions.send for direct session injection.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import JSON5 from 'json5';
import { requireConfig } from '../shared/config.js';
import { shouldRelaxTls } from '../shared/tls.js';
import { resolveOpenClawBin } from '../shared/openclaw-bin.js';

const execFileAsync = promisify(execFile);

/**
 * bd-aiz: distinguish gateway auth (401) failures from generic transport
 * failures so the daemon does not silently 401 forever after an OpenClaw token
 * rotation that was not mirrored into OGP's own config. Scope is the
 * gateway-auth path ONLY — this never touches the Ed25519 trust model.
 */
export function isGatewayAuthFailure(text: string | undefined | null): boolean {
  if (!text) {
    return false;
  }
  const haystack = text.toLowerCase();
  return (
    haystack.includes('401') ||
    haystack.includes('unauthorized') ||
    haystack.includes('invalid token') ||
    haystack.includes('authentication failed') ||
    haystack.includes('auth failed') ||
    haystack.includes('forbidden') ||
    haystack.includes('403')
  );
}

// Consecutive gateway auth failures across calls. We WARN (instead of failing
// silently) once this crosses the threshold so a rotated-out token is operator-
// visible. Reset on any successful gateway call.
const GATEWAY_AUTH_WARN_THRESHOLD = 3;
let consecutiveGatewayAuthFailures = 0;

export function __resetGatewayAuthFailureCount(): void {
  consecutiveGatewayAuthFailures = 0;
}

export function __getGatewayAuthFailureCount(): number {
  return consecutiveGatewayAuthFailures;
}

function noteGatewayAuthFailure(method: string): void {
  consecutiveGatewayAuthFailures += 1;
  if (consecutiveGatewayAuthFailures >= GATEWAY_AUTH_WARN_THRESHOLD) {
    console.warn(
      `[OGP Bridge] WARN: ${consecutiveGatewayAuthFailures} consecutive gateway auth failures on ${method}. ` +
        'The OpenClaw gateway token may have rotated and is no longer mirrored into OGP config (openclawToken). ' +
        're-check/re-auth required — the daemon will keep 401ing until the token is refreshed.'
    );
  }
}

function noteGatewayAuthSuccess(): void {
  consecutiveGatewayAuthFailures = 0;
}

type DeliveryTarget = {
  channel?: string;
  to?: string;
};

type HookDispatchOptions = {
  deliver?: boolean;
  target?: DeliveryTarget;
  sessionKey?: string;
  /**
   * B0032 v0.7.0 — Override the OpenClaw `agentId` in the hook payload.
   * When set (non-empty), takes precedence over `config.agentId`. When omitted,
   * falls through to the legacy `config.agentId || 'main'` behavior.
   */
  agentId?: string;
};

interface OpenClawHooksConfigSnapshot {
  token?: string;
  allowRequestSessionKey: boolean;
  allowedSessionKeyPrefixes?: string[];
}

type OpenClawConfigFile = {
  hooks?: {
    token?: string;
    allowRequestSessionKey?: boolean;
    allowedSessionKeyPrefixes?: string[];
  };
};

function extractJsonObject(output: string): Record<string, any> | null {
  const start = output.indexOf('{');
  if (start === -1) {
    return null;
  }

  try {
    return JSON.parse(output.slice(start));
  } catch {
    return null;
  }
}

function normalizeBaseUrl(url: string): URL {
  if (url.startsWith('ws://')) {
    return new URL(`http://${url.slice('ws://'.length)}`);
  }
  if (url.startsWith('wss://')) {
    return new URL(`https://${url.slice('wss://'.length)}`);
  }
  return new URL(url);
}

function isLoopbackHost(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  return (
    normalized === 'localhost' ||
    normalized === '127.0.0.1' ||
    normalized === '::1'
  );
}

function buildGatewayWsUrls(url: string): string[] {
  const base = normalizeBaseUrl(url);
  const wsProtocol = base.protocol === 'https:' ? 'wss:' : 'ws:';
  const primary = `${wsProtocol}//${base.host}`;

  // Current OpenClaw local gateway defaults to TLS on 18789, even if the
  // OGP config still says http://localhost:18789.
  if (base.protocol === 'http:' && isLoopbackHost(base.hostname) && base.port === '18789') {
    return [`wss://${base.host}`, `ws://${base.host}`];
  }

  return [primary];
}

function buildHookBaseUrls(url: string): string[] {
  const base = normalizeBaseUrl(url);
  const primaryProtocol = base.protocol === 'https:' ? 'https:' : 'http:';
  const primary = `${primaryProtocol}//${base.host}`;

  if (base.protocol === 'http:' && isLoopbackHost(base.hostname) && base.port === '18789') {
    return [`https://${base.host}`, `http://${base.host}`];
  }

  return [primary];
}

function resolveOpenClawConfigPath(): string {
  return process.env.OPENCLAW_CONFIG_PATH || path.join(os.homedir(), '.openclaw', 'openclaw.json');
}

export function parseOpenClawHooksConfigText(configText: string): OpenClawHooksConfigSnapshot | undefined {
  let raw: OpenClawConfigFile;

  try {
    raw = JSON.parse(configText) as OpenClawConfigFile;
  } catch {
    try {
      raw = JSON5.parse(configText) as OpenClawConfigFile;
    } catch {
      return undefined;
    }
  }

  const token = raw.hooks?.token?.trim();
  const allowedSessionKeyPrefixes = Array.isArray(raw.hooks?.allowedSessionKeyPrefixes)
    ? raw.hooks.allowedSessionKeyPrefixes
        .map(prefix => typeof prefix === 'string' ? prefix.trim() : '')
        .filter(Boolean)
    : undefined;

  return {
    token: token || undefined,
    allowRequestSessionKey: raw.hooks?.allowRequestSessionKey === true,
    allowedSessionKeyPrefixes: allowedSessionKeyPrefixes?.length ? allowedSessionKeyPrefixes : undefined
  };
}

function loadHooksConfigFromOpenClawConfig(): OpenClawHooksConfigSnapshot | undefined {
  try {
    const configPath = resolveOpenClawConfigPath();
    if (!fs.existsSync(configPath)) {
      return undefined;
    }

    return parseOpenClawHooksConfigText(fs.readFileSync(configPath, 'utf-8'));
  } catch {
    return undefined;
  }
}

function isAllowedHookSessionKey(sessionKey: string, allowedPrefixes?: string[]): boolean {
  if (!allowedPrefixes || allowedPrefixes.length === 0) {
    return true;
  }
  return allowedPrefixes.some(prefix => sessionKey.startsWith(prefix));
}

async function callGatewayMethod(params: {
  gatewayToken: string;
  gatewayUrl: string;
  method: string;
  payload: Record<string, unknown>;
}): Promise<boolean> {
  const candidates = buildGatewayWsUrls(params.gatewayUrl);

  // bd-bq1: resolve `openclaw` explicitly instead of relying on PATH. The
  // LaunchAgent-spawned daemon has a minimal PATH without /opt/homebrew/bin,
  // which made every `spawn openclaw` fail with ENOENT (100% sessions.send loss).
  const openclawBin = resolveOpenClawBin();

  for (const candidate of candidates) {
    try {
      const { stdout, stderr } = await execFileAsync(openclawBin, [
        'gateway',
        'call',
        '--token',
        params.gatewayToken,
        '--url',
        candidate,
        '--params',
        JSON.stringify(params.payload),
        '--json',
        params.method
      ], {
        timeout: 10_000,
        maxBuffer: 1024 * 1024
      });

      const response = extractJsonObject(stdout);
      const ok = Boolean(
        response &&
        (response.runId || response.status === 'started' || response.messageSeq || response.ok)
      );

      if (ok) {
        noteGatewayAuthSuccess();
        return true;
      }

      // bd-aiz: a successful CLI invocation that still reports auth trouble in
      // its output is an auth failure, not a transport hiccup.
      if (isGatewayAuthFailure(stdout) || isGatewayAuthFailure(stderr)) {
        noteGatewayAuthFailure(params.method);
      }

      console.error(
        `[OGP Bridge] ${params.method} returned unexpected output via ${candidate}:`,
        stdout.trim() || stderr.trim()
      );
    } catch (err: any) {
      const detail = (err && (err.stderr || err.message)) || String(err);
      // bd-aiz: classify 401/auth errors distinctly so they surface a WARN
      // instead of being collapsed into a silent transport failure.
      if (isGatewayAuthFailure(detail)) {
        noteGatewayAuthFailure(params.method);
      }
      console.error(`[OGP Bridge] ${params.method} failed via ${candidate}:`, err.message || err);
    }
  }

  return false;
}

async function postJson(params: {
  baseUrl: string;
  path: string;
  token: string;
  body: Record<string, unknown>;
}): Promise<boolean> {
  const candidates = buildHookBaseUrls(params.baseUrl);
  const body = JSON.stringify(params.body);

  for (const candidate of candidates) {
    try {
      const url = new URL(params.path, candidate);
      const reqFn = url.protocol === 'https:' ? httpsRequest : httpRequest;

      const ok = await new Promise<boolean>((resolve) => {
        // SECURITY (F-03): relax cert verification only for loopback targets
        // (the typical OpenClaw dev setup runs with a self-signed cert on
        // localhost). For remote OpenClaw URLs, full TLS verification applies.
        const req = reqFn(
          {
            hostname: url.hostname,
            port: url.port || (url.protocol === 'https:' ? 443 : 80),
            path: url.pathname,
            method: 'POST',
            rejectUnauthorized: !shouldRelaxTls(url.hostname),
            headers: {
              Authorization: `Bearer ${params.token}`,
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(body)
            }
          },
          (res) => {
            let responseBody = '';
            res.setEncoding('utf8');
            res.on('data', (chunk) => {
              responseBody += chunk;
            });
            res.on('end', () => {
              const parsed = extractJsonObject(responseBody);
              resolve(Boolean(res.statusCode && res.statusCode >= 200 && res.statusCode < 300 && parsed?.ok));
            });
          }
        );

        req.on('error', () => resolve(false));
        req.setTimeout(10_000, () => {
          req.destroy();
          resolve(false);
        });
        req.write(body);
        req.end();
      });

      if (ok) {
        return true;
      }
    } catch {
      // Try the next candidate.
    }
  }

  return false;
}

/**
 * Connect bridge (no-op for request-based implementation)
 */
export function connectBridge(): void {
  console.log('[OGP Bridge] Using OpenClaw hooks/agent for notifications and gateway RPC as fallback');
}

export async function dispatchAgentHook(
  message: string,
  from: string,
  options?: HookDispatchOptions
): Promise<boolean> {
  const config = requireConfig();
  const hooksConfig = loadHooksConfigFromOpenClawConfig();
  const hooksToken = config.openclawHooksToken || hooksConfig?.token;
  const baseUrl = config.openclawUrl || 'https://localhost:18789';

  if (!hooksToken) {
    console.error('[OGP Bridge] OpenClaw hooks token not configured');
    return false;
  }

  let requestedSessionKey: string | undefined;
  const trimmedSessionKey = options?.sessionKey?.trim();
  if (trimmedSessionKey) {
    if (hooksConfig?.allowRequestSessionKey === true) {
      if (isAllowedHookSessionKey(trimmedSessionKey, hooksConfig.allowedSessionKeyPrefixes)) {
        requestedSessionKey = trimmedSessionKey;
      } else {
        console.warn('[OGP Bridge] Hook sessionKey override blocked by OpenClaw allowedSessionKeyPrefixes:', trimmedSessionKey);
      }
    } else {
      console.warn(
        '[OGP Bridge] OpenClaw hooks.allowRequestSessionKey=false; /hooks/agent cannot be pinned to the target session and may run in the default hook session instead.'
      );
    }
  }

  const ok = await postJson({
    baseUrl,
    path: '/hooks/agent',
    token: hooksToken,
    body: {
      message,
      name: 'OGP Federation',
      // B0032 v0.7.0: explicit per-persona agentId override takes precedence.
      // Falls through to legacy config.agentId || 'main' for back-compat.
      agentId: (options?.agentId && options.agentId.length > 0)
        ? options.agentId
        : (config.agentId || 'main'),
      wakeMode: 'now',
      deliver: options?.deliver ?? true,
      ...(requestedSessionKey ? { sessionKey: requestedSessionKey } : {}),
      ...(options?.target?.channel ? { channel: options.target.channel } : {}),
      ...(options?.target?.to ? { to: options.target.to } : {})
    }
  });

  if (ok) {
    console.log('[OGP Bridge] Message delivered via /hooks/agent:', from, message.substring(0, 100));
  } else {
    console.error('[OGP Bridge] /hooks/agent delivery failed');
  }
  return ok;
}

/**
 * Inject a message into an OpenClaw session using the gateway RPC.
 * Note: OpenClaw currently renders these messages with sender "cli", so OGP must
 * include peer identity in the message content itself.
 */
export async function injectMessage(
  sessionKey: string,
  message: string,
  from?: string
): Promise<boolean> {
  const config = requireConfig();
  const gatewayToken = config.openclawToken;
  const gatewayUrl = config.openclawUrl || 'https://localhost:18789';

  if (!gatewayToken) {
    console.error('[OGP Bridge] OpenClaw gateway token not configured');
    return false;
  }

  const ok = await callGatewayMethod({
    gatewayToken,
    gatewayUrl,
    method: 'sessions.send',
    payload: { key: sessionKey, message }
  });

  if (ok) {
    console.log(
      '[OGP Bridge] Message delivered via sessions.send:',
      sessionKey,
      from ? `from ${from}` : '',
      message.substring(0, 100)
    );
  } else {
    // bd-wjh0: graceful degradation for the cosmetic sessions.send sync-note.
    // The PRIMARY delivery path (/hooks/agent) is independent and already
    // succeeded by the time callers reach this courtesy sync-note. When the
    // OpenClaw gateway has hooks.allowRequestSessionKey=false (a common,
    // deliberate hardened posture — e.g. clawporate's entrypoint sets it on
    // every boot), sessions.send to a pinned session key is rejected. That is
    // EXPECTED and purely cosmetic, not a delivery failure. Emit a clear,
    // self-explanatory diagnostic so consumer-gateway operators stop
    // mis-reading this as a dropped federation message.
    const hooksConfig = loadHooksConfigFromOpenClawConfig();
    if (hooksConfig?.allowRequestSessionKey !== true) {
      console.warn(
        '[OGP Bridge] sessions.send sync-note skipped (cosmetic): OpenClaw ' +
        'hooks.allowRequestSessionKey is not true, so the courtesy [OGP Internal ' +
        'Sync] note cannot be pinned to the sender session. Federation message ' +
        'delivery via /hooks/agent is UNAFFECTED. To enable the sync-note, set ' +
        'hooks.allowRequestSessionKey=true in the OpenClaw gateway config.'
      );
    } else {
      console.warn(
        '[OGP Bridge] sessions.send sync-note failed for session:',
        sessionKey,
        from ? `(from ${from})` : '',
        '— federation delivery via /hooks/agent is unaffected.'
      );
    }
  }

  return ok;
}

/**
 * Disconnect bridge (no-op for request-based implementation)
 */
export function disconnectBridge(): void {
  console.log('[OGP Bridge] Request-based bridge has no persistent connection');
}
