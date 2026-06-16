import { describe, expect, it } from 'vitest';
import { resolveTransportList } from '../src/shared/config.js';

/**
 * bd-maas: `resolveTransportList` is the internal source of truth for what
 * transports a daemon advertises. These tests pin Option A's precedence rules
 * (settled 2026-06-11): advertise > mode > absent, with `prefer` hoisting.
 */
describe('resolveTransportList (bd-maas)', () => {
  it('absent transport block ⇒ [direct] (byte-identical to today)', () => {
    expect(resolveTransportList({})).toEqual([{ mode: 'direct' }]);
    expect(resolveTransportList({ transport: undefined })).toEqual([{ mode: 'direct' }]);
  });

  it('single mode ⇒ one-element list (the simple set-mode path)', () => {
    expect(resolveTransportList({ transport: { mode: 'relay' } })).toEqual([{ mode: 'relay' }]);
    expect(resolveTransportList({ transport: { mode: 'direct' } })).toEqual([{ mode: 'direct' }]);
  });

  it('advertise list ⇒ that list, in declaration order', () => {
    expect(
      resolveTransportList({ transport: { mode: 'direct', advertise: ['direct', 'relay'] } })
    ).toEqual([{ mode: 'direct' }, { mode: 'relay' }]);
  });

  it('advertise overrides mode (advertise is authoritative when set)', () => {
    // mode says relay, but advertise says direct+relay → advertise wins.
    expect(
      resolveTransportList({ transport: { mode: 'relay', advertise: ['relay', 'direct'] } })
    ).toEqual([{ mode: 'relay' }, { mode: 'direct' }]);
  });

  it('prefer hoists a member to the front', () => {
    expect(
      resolveTransportList({ transport: { mode: 'direct', advertise: ['direct', 'relay'], prefer: 'relay' } })
    ).toEqual([{ mode: 'relay' }, { mode: 'direct' }]);
  });

  it('prefer not in the advertised set is ignored', () => {
    expect(
      resolveTransportList({ transport: { mode: 'direct', advertise: ['direct', 'relay'], prefer: 'iroh' } })
    ).toEqual([{ mode: 'direct' }, { mode: 'relay' }]);
  });

  it('de-duplicates the advertised list, preserving first occurrence', () => {
    expect(
      resolveTransportList({ transport: { mode: 'direct', advertise: ['relay', 'relay', 'direct', 'relay'] } })
    ).toEqual([{ mode: 'relay' }, { mode: 'direct' }]);
  });

  it('empty advertise array falls back to mode', () => {
    expect(resolveTransportList({ transport: { mode: 'relay', advertise: [] } })).toEqual([{ mode: 'relay' }]);
  });
});
