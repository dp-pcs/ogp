import { describe, expect, it, vi } from 'vitest';
import {
  ensureLocalGatewayReachable,
  fetchFederationCard
} from '../src/cli/federation.js';

describe('federation preflight helpers', () => {
  it('uses the canonical gatewayUrl from the remote card', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        gatewayUrl: 'https://junior.example.com',
        displayName: 'Junior @ OpenClaw'
      })
    });

    await expect(fetchFederationCard('https://old-junior.example.com/', fetchMock as any)).resolves.toEqual({
      requestedUrl: 'https://old-junior.example.com',
      canonicalUrl: 'https://junior.example.com',
      card: {
        gatewayUrl: 'https://junior.example.com',
        displayName: 'Junior @ OpenClaw'
      }
    });

    expect(fetchMock).toHaveBeenCalledWith('https://old-junior.example.com/.well-known/ogp');
  });

  it('fails local preflight when gatewayUrl is missing', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(
      ensureLocalGatewayReachable({ gatewayUrl: '' }, 'send federation requests', vi.fn() as any)
    ).resolves.toBe(false);

    expect(errorSpy).toHaveBeenCalledWith(
      'Error: gatewayUrl is not set. Run "ogp expose" or update your config before you send federation requests.'
    );

    errorSpy.mockRestore();
  });

  it('fails local preflight when the live card disagrees with configured gatewayUrl', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        gatewayUrl: 'https://actual.example.com'
      })
    });

    await expect(
      ensureLocalGatewayReachable(
        { gatewayUrl: 'https://stale.example.com' },
        'approve federation requests',
        fetchMock as any
      )
    ).resolves.toBe(false);

    expect(errorSpy).toHaveBeenCalledWith('Error: configured gatewayUrl is stale.');
    expect(errorSpy).toHaveBeenCalledWith('  Config: https://stale.example.com');
    expect(errorSpy).toHaveBeenCalledWith('  Live card: https://actual.example.com');

    errorSpy.mockRestore();
  });
});
