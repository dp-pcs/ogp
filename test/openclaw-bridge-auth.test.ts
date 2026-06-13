import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  isGatewayAuthFailure,
  __resetGatewayAuthFailureCount,
  __getGatewayAuthFailureCount,
} from '../src/daemon/openclaw-bridge.js';

// bd-aiz: gateway auth (401) failures must be classified distinctly from
// generic transport failures so a rotated-out OpenClaw token surfaces a WARN
// instead of an indefinite silent 401 loop. These tests cover the pure
// classifier; the counter/WARN behavior is exercised via the exported test
// hooks. Scope is the gateway-auth path only — never the Ed25519 trust model.

describe('isGatewayAuthFailure', () => {
  it('detects 401 in error text', () => {
    expect(isGatewayAuthFailure('Request failed with status 401')).toBe(true);
  });

  it('detects "unauthorized" regardless of case', () => {
    expect(isGatewayAuthFailure('UNAUTHORIZED: bad token')).toBe(true);
    expect(isGatewayAuthFailure('Unauthorized')).toBe(true);
  });

  it('detects invalid-token and auth-failed phrasings', () => {
    expect(isGatewayAuthFailure('invalid token supplied')).toBe(true);
    expect(isGatewayAuthFailure('authentication failed')).toBe(true);
    expect(isGatewayAuthFailure('auth failed')).toBe(true);
  });

  it('detects 403/forbidden', () => {
    expect(isGatewayAuthFailure('403 Forbidden')).toBe(true);
    expect(isGatewayAuthFailure('forbidden')).toBe(true);
  });

  it('does NOT flag generic transport errors as auth failures', () => {
    expect(isGatewayAuthFailure('ECONNREFUSED 127.0.0.1:18789')).toBe(false);
    expect(isGatewayAuthFailure('socket hang up')).toBe(false);
    expect(isGatewayAuthFailure('ETIMEDOUT')).toBe(false);
    expect(isGatewayAuthFailure('spawn openclaw ENOENT')).toBe(false);
  });

  it('handles empty / null / undefined safely', () => {
    expect(isGatewayAuthFailure('')).toBe(false);
    expect(isGatewayAuthFailure(undefined)).toBe(false);
    expect(isGatewayAuthFailure(null)).toBe(false);
  });
});

describe('gateway auth failure counter (bd-aiz)', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    __resetGatewayAuthFailureCount();
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
    __resetGatewayAuthFailureCount();
  });

  it('starts at zero after reset', () => {
    expect(__getGatewayAuthFailureCount()).toBe(0);
  });
});
