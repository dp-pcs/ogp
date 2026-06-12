import { describe, expect, it } from 'vitest';
import {
  buildTransportList,
  serializeTransportAdvertisement,
  parseResolvedTransports
} from '../src/daemon/rendezvous.js';

/**
 * bd-maas: the daemon builds an ORDERED transport advertisement list, serializes
 * it with backward compatibility, and a peer parses it back into reachable
 * transports. These tests pin the round-trip + the legacy single-descriptor path.
 */
const RV = 'https://rendezvous.elelem.expert';
const GW = 'https://me.example.com';
const PUB = 'abc123pub';

describe('buildTransportList (bd-maas)', () => {
  it('absent config ⇒ [] (direct-only, field omitted — byte-identical)', () => {
    expect(buildTransportList(undefined, RV, GW)).toEqual([]);
  });

  it('explicit single direct ⇒ [] (no info beyond ip:port/publicUrl)', () => {
    expect(buildTransportList({ mode: 'direct' }, RV, GW)).toEqual([]);
  });

  it('single relay ⇒ one-element relay list', () => {
    expect(buildTransportList({ mode: 'relay', relay: { url: 'wss://r/relay' } }, RV, GW))
      .toEqual([{ transport: 'relay', relayUrl: 'wss://r/relay' }]);
  });

  it('advertise direct+relay ⇒ ordered list with explicit direct gatewayUrl', () => {
    expect(
      buildTransportList({ mode: 'direct', advertise: ['direct', 'relay'] }, RV, GW)
    ).toEqual([
      { transport: 'direct', gatewayUrl: GW },
      { transport: 'relay', relayUrl: 'wss://rendezvous.elelem.expert/relay' }
    ]);
  });

  it('prefer relay reorders the advertised list', () => {
    expect(
      buildTransportList({ mode: 'direct', advertise: ['direct', 'relay'], prefer: 'relay' }, RV, GW)
    ).toEqual([
      { transport: 'relay', relayUrl: 'wss://rendezvous.elelem.expert/relay' },
      { transport: 'direct', gatewayUrl: GW }
    ]);
  });

  it('drops an unresolvable leg (iroh w/o node id) instead of advertising it dead', () => {
    expect(
      buildTransportList({ mode: 'direct', advertise: ['relay', 'iroh'], relay: { url: 'wss://r/relay' } }, RV, GW)
    ).toEqual([{ transport: 'relay', relayUrl: 'wss://r/relay' }]);
  });
});

describe('serializeTransportAdvertisement (bd-maas backward compat)', () => {
  it('empty list ⇒ no fields (pre-bd-b7em shape)', () => {
    expect(serializeTransportAdvertisement([])).toEqual({});
  });

  it('single relay ⇒ legacy `transport` only (old servers still route relay)', () => {
    expect(serializeTransportAdvertisement([{ transport: 'relay', relayUrl: 'wss://r/relay' }]))
      .toEqual({ transport: { transport: 'relay', relayUrl: 'wss://r/relay' } });
  });

  it('single direct ⇒ `transports` list (a bare direct has no legacy meaning)', () => {
    expect(serializeTransportAdvertisement([{ transport: 'direct', gatewayUrl: GW }]))
      .toEqual({ transports: [{ transport: 'direct', gatewayUrl: GW }] });
  });

  it('multi-element ⇒ `transports` list + first non-direct mirrored to legacy `transport`', () => {
    const list = [
      { transport: 'direct' as const, gatewayUrl: GW },
      { transport: 'relay' as const, relayUrl: 'wss://r/relay' }
    ];
    expect(serializeTransportAdvertisement(list)).toEqual({
      transports: list,
      transport: { transport: 'relay', relayUrl: 'wss://r/relay' }
    });
  });
});

describe('parseResolvedTransports (bd-maas)', () => {
  it('new `transports` list ⇒ resolves each entry in order', () => {
    const data = {
      transports: [
        { transport: 'relay' as const, relayUrl: 'wss://r/relay' },
        { transport: 'direct' as const, gatewayUrl: GW }
      ]
    };
    expect(parseResolvedTransports(data, PUB)).toEqual([
      { mode: 'relay', relayUrl: 'wss://r/relay', pubkey: PUB },
      { mode: 'direct', url: GW }
    ]);
  });

  it('legacy single `transport` ⇒ one-element list', () => {
    expect(parseResolvedTransports({ transport: { transport: 'relay', relayUrl: 'wss://r/relay' } }, PUB))
      .toEqual([{ mode: 'relay', relayUrl: 'wss://r/relay', pubkey: PUB }]);
  });

  it('no descriptors, publicUrl present ⇒ plain direct (pre-bd-b7em)', () => {
    expect(parseResolvedTransports({ publicUrl: 'https://peer.example' }, PUB))
      .toEqual([{ mode: 'direct', url: 'https://peer.example' }]);
  });

  it('no descriptors, ip:port only ⇒ direct http url', () => {
    expect(parseResolvedTransports({ ip: '1.2.3.4', port: 18790 }, PUB))
      .toEqual([{ mode: 'direct', url: 'http://1.2.3.4:18790' }]);
  });

  it('direct descriptor without gatewayUrl falls back to publicUrl', () => {
    expect(parseResolvedTransports({ transport: { transport: 'direct' }, publicUrl: 'https://peer.example' }, PUB))
      .toEqual([{ mode: 'direct', url: 'https://peer.example' }]);
  });

  it('nothing reachable ⇒ []', () => {
    expect(parseResolvedTransports({}, PUB)).toEqual([]);
  });

  it('round-trip: build → serialize → (server echoes) → parse', () => {
    const built = buildTransportList({ mode: 'direct', advertise: ['direct', 'relay'], prefer: 'relay' }, RV, GW);
    const wire = serializeTransportAdvertisement(built);
    // The server stores+returns the verified `transports`/`transport` fields.
    const resolved = parseResolvedTransports(wire, PUB);
    expect(resolved).toEqual([
      { mode: 'relay', relayUrl: 'wss://rendezvous.elelem.expert/relay', pubkey: PUB },
      { mode: 'direct', url: GW }
    ]);
  });
});
