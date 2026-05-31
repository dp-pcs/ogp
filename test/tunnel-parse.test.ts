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
    expect(live.detail!.match(/den01/g)).toHaveLength(1);
    const idle = infos.find((t) => t.name === 'idle-tunnel')!;
    expect(idle.live).toBe(false);
  });

  it('returns [] on invalid JSON', () => {
    expect(parseCloudflaredTunnels('not json')).toEqual([]);
    expect(parseCloudflaredTunnels('{"not":"an array"}')).toEqual([]);
  });
});

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

  it('returns a single http-only tunnel and skips malformed URLs', () => {
    const json = JSON.stringify({
      tunnels: [
        { name: 'http-only', public_url: 'http://xyz.ngrok-free.app', proto: 'http', config: { addr: 'http://localhost:3000' } },
        { name: 'broken', public_url: 'not a url', proto: 'https', config: { addr: 'http://localhost:3000' } }
      ]
    });
    const infos = parseNgrokAgentTunnels(json);
    expect(infos).toHaveLength(1);
    expect(infos[0].publicUrl).toBe('http://xyz.ngrok-free.app');
  });
});

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

  it('handles quoted hostnames and strips trailing paths', () => {
    const yaml = `
ingress:
  - hostname: "ogp.example.com"
    service: http://localhost:18790
  - hostname: api.example.com/health
    service: http://localhost:18791
`;
    expect(parseCloudflaredIngressHosts(yaml)).toEqual(['ogp.example.com', 'api.example.com']);
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

  it('matches on host even when gatewayUrl has a path', () => {
    const r = reconcileGatewayUrl(['ogp.example.com'], 'https://ogp.example.com/api')!;
    expect(r.verdict).toBe('match');
  });
});

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
