import { afterEach, describe, expect, it, vi } from 'vitest';

// Mock the two transport-decision dependencies so we can assert the branch.
vi.mock('../src/daemon/rendezvous.js', () => ({
  lookupPeerTransport: vi.fn(),
  lookupPeer: vi.fn(),
}));
vi.mock('../src/daemon/relay-client.js', () => ({
  deliverViaRelay: vi.fn(),
}));

import { deliverFederationMessage } from '../src/cli/federation.js';
import { lookupPeerTransport } from '../src/daemon/rendezvous.js';
import { deliverViaRelay } from '../src/daemon/relay-client.js';

const peer = { id: 'pkB', displayName: 'B', gatewayUrl: 'https://b.example', publicKey: 'pubB' } as any;
const frame = { message: { intent: 'x' }, messageStr: '{"intent":"x"}', signature: 'sig' };

describe('deliverFederationMessage transport branch', () => {
  afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); });

  it('DIRECT (rendezvous disabled): posts to gatewayUrl, never touches relay', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, status: 200, json: async () => ({ success: true, nonce: 'n' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const out = await deliverFederationMessage(peer, frame, { config: { rendezvous: { enabled: false } } as any });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://b.example/federation/message');
    expect(JSON.parse(init.body)).toEqual({ message: frame.message, messageStr: frame.messageStr, signature: frame.signature });
    expect(deliverViaRelay).not.toHaveBeenCalled();
    expect(out).toEqual({ ok: true, status: 200, result: { success: true, nonce: 'n' } });
  });

  it('DIRECT (peer advertises direct): still posts to gatewayUrl', async () => {
    (lookupPeerTransport as any).mockResolvedValue({ mode: 'direct', url: 'https://b.example' });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ success: true }) });
    vi.stubGlobal('fetch', fetchMock);

    await deliverFederationMessage(peer, frame, { config: { rendezvous: { enabled: true, url: 'https://rv' } } as any });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(deliverViaRelay).not.toHaveBeenCalled();
  });

  it('RELAY: routes via deliverViaRelay, never calls fetch', async () => {
    (lookupPeerTransport as any).mockResolvedValue({ mode: 'relay', relayUrl: 'ws://rv/relay', pubkey: 'pubB' });
    (deliverViaRelay as any).mockResolvedValue({ success: true, nonce: 'n2' });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const out = await deliverFederationMessage(peer, frame, { config: { rendezvous: { enabled: true, url: 'https://rv' } } as any });

    expect(deliverViaRelay).toHaveBeenCalledWith('ws://rv/relay', 'pubB', frame, undefined);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(out.ok).toBe(true);
    expect(out.result).toEqual({ success: true, nonce: 'n2' });
  });

  it('RELAY error maps to a failed-send result (not a throw)', async () => {
    (lookupPeerTransport as any).mockResolvedValue({ mode: 'relay', relayUrl: 'ws://rv/relay', pubkey: 'pubB' });
    (deliverViaRelay as any).mockRejectedValue(new Error('peer-not-connected'));
    vi.stubGlobal('fetch', vi.fn());

    const out = await deliverFederationMessage(peer, frame, { config: { rendezvous: { enabled: true, url: 'https://rv' } } as any });

    expect(out.ok).toBe(false);
    expect(String(out.result.error)).toContain('not connected via relay');
  });

  it('lookup THROWS ⇒ falls through to DIRECT (flaky rendezvous never breaks direct)', async () => {
    (lookupPeerTransport as any).mockRejectedValue(new Error('rendezvous down'));
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ success: true }) });
    vi.stubGlobal('fetch', fetchMock);

    await deliverFederationMessage(peer, frame, { config: { rendezvous: { enabled: true, url: 'https://rv' } } as any });

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toBe('https://b.example/federation/message');
    expect(deliverViaRelay).not.toHaveBeenCalled();
  });
});
