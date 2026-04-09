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
import { requireConfig } from '../shared/config.js';

const execFileAsync = promisify(execFile);

type DeliveryTarget = {
  channel?: string;
  to?: string;
};

type HookDispatchOptions = {
  deliver?: boolean;
  target?: DeliveryTarget;
  sessionKey?: string;
};

interface OpenClawHooksConfigSnapshot {
  token?: string;
  allowRequestSessionKey: boolean;
  allowedSessionKeyPrefixes?: string[];
}

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

function loadHooksConfigFromOpenClawConfig(): OpenClawHooksConfigSnapshot | undefined {
  try {
    const configPath = resolveOpenClawConfigPath();
    if (!fs.existsSync(configPath)) {
      return undefined;
    }

    const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as {
      hooks?: {
        token?: string;
        allowRequestSessionKey?: boolean;
        allowedSessionKeyPrefixes?: string[];
      };
    };
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

  for (const candidate of candidates) {
    try {
      const { stdout, stderr } = await execFileAsync('openclaw', [
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
        return true;
      }

      console.error(
        `[OGP Bridge] ${params.method} returned unexpected output via ${candidate}:`,
        stdout.trim() || stderr.trim()
      );
    } catch (err: any) {
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
        const req = reqFn(
          {
            hostname: url.hostname,
            port: url.port || (url.protocol === 'https:' ? 443 : 80),
            path: url.pathname,
            method: 'POST',
            rejectUnauthorized: false,
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
      agentId: config.agentId || 'main',
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
  }

  return ok;
}

/**
 * Disconnect bridge (no-op for request-based implementation)
 */
export function disconnectBridge(): void {
  console.log('[OGP Bridge] Request-based bridge has no persistent connection');
}
