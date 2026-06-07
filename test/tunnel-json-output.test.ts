import { describe, it, expect } from 'vitest';
import {
  buildTunnelJson,
  type TunnelPane,
  type ReconcileResult,
} from '../src/cli/tunnel.js';

describe('buildTunnelJson', () => {
  it('shapes panes and reconcile into a stable JSON object', () => {
    const panes: TunnelPane[] = [
      {
        tool: 'cloudflared',
        infos: [
          {
            tool: 'cloudflared',
            name: 'hermes',
            publicUrl: 'https://hermes.sarcastek.com',
            live: true,
            source: 'cloudflared tunnel list',
          },
        ],
      },
      { tool: 'ngrok', infos: [], error: 'ngrok not installed' },
    ];
    const reconcile: ReconcileResult = {
      verdict: 'match',
      message: '✓ gatewayUrl hermes.sarcastek.com is served by a live tunnel',
    };

    const out = buildTunnelJson(panes, reconcile);

    expect(out).toEqual({ tools: panes, reconcile });
  });

  it('emits null reconcile when none provided', () => {
    expect(buildTunnelJson([], null).reconcile).toBeNull();
  });
});
