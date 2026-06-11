import { describe, expect, it } from 'vitest';
import { buildTransportDescriptor } from '../src/daemon/rendezvous.js';
import { getTransportMode } from '../src/shared/config.js';

/**
 * bd-b7em Phase 1: the daemon builds the transport descriptor it advertises from
 * its TransportConfig. Direct (or absent) ⇒ undefined (register exactly as before).
 */
describe('buildTransportDescriptor (bd-b7em)', () => {
  const RV = 'https://rendezvous.elelem.expert';

  it('absent config ⇒ undefined (direct, byte-identical to pre-bd-b7em)', () => {
    expect(buildTransportDescriptor(undefined, RV)).toBeUndefined();
  });

  it('explicit direct ⇒ undefined', () => {
    expect(buildTransportDescriptor({ mode: 'direct' }, RV)).toBeUndefined();
  });

  it('relay with configured url ⇒ relay descriptor', () => {
    expect(buildTransportDescriptor({ mode: 'relay', relay: { url: 'wss://my.relay/relay' } }, RV))
      .toEqual({ transport: 'relay', relayUrl: 'wss://my.relay/relay' });
  });

  it('relay without url ⇒ default relay derived from rendezvous host (https→wss)', () => {
    expect(buildTransportDescriptor({ mode: 'relay' }, RV))
      .toEqual({ transport: 'relay', relayUrl: 'wss://rendezvous.elelem.expert/relay' });
  });

  it('relay default derives ws:// from an http rendezvous url', () => {
    expect(buildTransportDescriptor({ mode: 'relay' }, 'http://localhost:3000'))
      .toEqual({ transport: 'relay', relayUrl: 'ws://localhost:3000/relay' });
  });

  it('iroh without a node id ⇒ undefined (stays direct until Phase 3)', () => {
    expect(buildTransportDescriptor({ mode: 'iroh' }, RV)).toBeUndefined();
  });

  it('iroh with a node id ⇒ iroh descriptor (field carried)', () => {
    expect(buildTransportDescriptor({ mode: 'iroh', iroh: { relayUrl: 'https://r' } }, RV, 'node-xyz'))
      .toEqual({ transport: 'iroh', nodeId: 'node-xyz', relayUrl: 'https://r' });
  });
});

describe('getTransportMode', () => {
  it('absent transport ⇒ direct', () => {
    expect(getTransportMode({})).toBe('direct');
    expect(getTransportMode({ transport: undefined })).toBe('direct');
  });
  it('returns the configured mode', () => {
    expect(getTransportMode({ transport: { mode: 'relay' } })).toBe('relay');
    expect(getTransportMode({ transport: { mode: 'iroh' } })).toBe('iroh');
  });
});
