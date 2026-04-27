import { describe, expect, it } from 'vitest';
import { buildFrameworkConfigsFromAnswers, type NonInteractiveFrameworkAnswers } from '../src/cli/setup.js';

describe('buildFrameworkConfigsFromAnswers (Issue #6)', () => {
  it('builds standalone framework + OGP config from a minimal answers object', () => {
    const answers: NonInteractiveFrameworkAnswers = {
      id: 'standalone',
      gatewayUrl: 'gateway.example.com',
      humanName: 'David',
      agentName: 'Junior',
      email: 'junior@example.com',
      agentId: 'main',
      inboundFederationMode: 'summarize'
    };

    const { framework, ogpConfig } = buildFrameworkConfigsFromAnswers(answers);

    expect(framework.id).toBe('standalone');
    expect(framework.enabled).toBe(true);
    expect(framework.gatewayUrl).toBe('https://gateway.example.com');
    expect(framework.displayName).toBe('David - Junior');

    expect(ogpConfig.gatewayUrl).toBe('https://gateway.example.com');
    expect(ogpConfig.email).toBe('junior@example.com');
    expect(ogpConfig.agentId).toBe('main');
    expect(ogpConfig.inboundFederationPolicy?.mode).toBe('summarize');
    expect(ogpConfig.delegatedAuthority?.global.defaultRule.mode).toBe('summarize');
  });

  it('rejects an answers object with an unknown framework id', () => {
    expect(() =>
      buildFrameworkConfigsFromAnswers({ id: 'bogus' as any })
    ).toThrow(/Unknown framework id/);
  });

  it('rejects an invalid gatewayUrl', () => {
    expect(() =>
      buildFrameworkConfigsFromAnswers({ id: 'standalone', gatewayUrl: 'https://' })
    ).toThrow(/Invalid gatewayUrl/);
  });

  it('passes through keychain options for headless macOS (Issue #8)', () => {
    const { ogpConfig } = buildFrameworkConfigsFromAnswers({
      id: 'standalone',
      keychainPath: '~/.ogp/ogp.keychain-db',
      keychainPasswordFile: '~/.ogp/keychain-password'
    });

    expect(ogpConfig.keychainPath).toBe('~/.ogp/ogp.keychain-db');
    expect(ogpConfig.keychainPasswordFile).toBe('~/.ogp/keychain-password');
  });

  it('defaults humanSurfacingMode and relayHandlingMode from inboundFederationMode when omitted', () => {
    const { ogpConfig } = buildFrameworkConfigsFromAnswers({
      id: 'standalone',
      inboundFederationMode: 'approval-required'
    });

    expect(ogpConfig.delegatedAuthority?.global.defaultRule.surfaceToHuman).toBe('important-only');
    expect(ogpConfig.delegatedAuthority?.global.classRules?.['human-relay']?.relayMode).toBe('approval-required');
  });
});
