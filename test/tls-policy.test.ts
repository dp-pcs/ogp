import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { shouldRelaxTls } from '../src/shared/tls.js';

/**
 * F-03: TLS verification policy. Relax only for loopback hosts; everything
 * else gets full certificate verification unless an explicit env-var
 * override is set for that target.
 */
describe('shouldRelaxTls (F-03)', () => {
  const ENV_VAR = 'OGP_HERMES_INSECURE_TLS';
  const original = process.env[ENV_VAR];

  beforeEach(() => {
    delete process.env[ENV_VAR];
  });

  afterEach(() => {
    if (original === undefined) delete process.env[ENV_VAR];
    else process.env[ENV_VAR] = original;
  });

  it('relaxes TLS for localhost', () => {
    expect(shouldRelaxTls('localhost')).toBe(true);
  });

  it('relaxes TLS for 127.0.0.1', () => {
    expect(shouldRelaxTls('127.0.0.1')).toBe(true);
  });

  it('relaxes TLS for ::1 (IPv6 loopback)', () => {
    expect(shouldRelaxTls('::1')).toBe(true);
  });

  it('is case-insensitive on hostname', () => {
    expect(shouldRelaxTls('LOCALHOST')).toBe(true);
    expect(shouldRelaxTls(' Localhost ')).toBe(true);
  });

  it('does NOT relax for a remote hostname by default', () => {
    expect(shouldRelaxTls('hermes.example.com')).toBe(false);
    expect(shouldRelaxTls('rendezvous.elelem.expert')).toBe(false);
    expect(shouldRelaxTls('10.0.0.5')).toBe(false);  // private but not loopback
  });

  it('does NOT relax for an empty or undefined hostname', () => {
    expect(shouldRelaxTls('')).toBe(false);
    expect(shouldRelaxTls(undefined as unknown as string)).toBe(false);
  });

  it('relaxes for a remote hostname when the env override is set to "1"', () => {
    process.env[ENV_VAR] = '1';
    expect(shouldRelaxTls('hermes.example.com', ENV_VAR)).toBe(true);
  });

  it('does NOT relax when the env override is set to anything other than "1"', () => {
    process.env[ENV_VAR] = 'true';
    expect(shouldRelaxTls('hermes.example.com', ENV_VAR)).toBe(false);
    process.env[ENV_VAR] = 'yes';
    expect(shouldRelaxTls('hermes.example.com', ENV_VAR)).toBe(false);
    process.env[ENV_VAR] = '0';
    expect(shouldRelaxTls('hermes.example.com', ENV_VAR)).toBe(false);
  });

  it('does NOT relax when env override is unset, even with the var name passed', () => {
    expect(shouldRelaxTls('hermes.example.com', ENV_VAR)).toBe(false);
  });

  it('still relaxes loopback when env override exists but is unset', () => {
    expect(shouldRelaxTls('localhost', ENV_VAR)).toBe(true);
  });

  it('a different env var name does not leak across helpers', () => {
    process.env[ENV_VAR] = '1';
    // shouldRelaxTls called with no envVar arg should ignore any other env
    expect(shouldRelaxTls('openclaw.example.com')).toBe(false);
  });
});
