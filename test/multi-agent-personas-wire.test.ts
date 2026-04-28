import { describe, expect, it } from 'vitest';
import { buildWellKnownResponse } from '../src/daemon/server.js';
import type { FederationMessage } from '../src/daemon/message-handler.js';
import type { ScopeGrant } from '../src/daemon/scopes.js';
import type { AgentPersona, OGPConfig } from '../src/shared/config.js';

function baseConfig(extra: Partial<OGPConfig> = {}): OGPConfig {
  return {
    daemonPort: 18790,
    openclawUrl: '',
    openclawToken: '',
    gatewayUrl: 'https://test.example.com',
    displayName: 'Test Gateway',
    email: 'test@example.com',
    stateDir: '/tmp/ogp-test',
    ...extra
  };
}

describe('/.well-known/ogp wire format — agents[] (B0032 P2)', () => {
  it('always advertises multi-agent-personas in capabilities.features', () => {
    const response = buildWellKnownResponse({
      cfg: baseConfig({ agentName: 'Junior' }),
      intentNames: ['message', 'agent-comms'],
      publicKey: 'test-pk-1'
    });

    expect(response.capabilities.features).toContain('multi-agent-personas');
  });

  it('preserves existing capability flags (scope-negotiation, reply-callback, bidirectional-health)', () => {
    const response = buildWellKnownResponse({
      cfg: baseConfig({ agentName: 'Junior' }),
      intentNames: ['message'],
      publicKey: 'test-pk-1'
    });

    expect(response.capabilities.features).toEqual(
      expect.arrayContaining(['scope-negotiation', 'reply-callback', 'bidirectional-health', 'multi-agent-personas'])
    );
  });

  it('includes agents[] in response — synthesized when only legacy fields set', () => {
    const response = buildWellKnownResponse({
      cfg: baseConfig({ agentName: 'Junior' }),
      intentNames: ['message'],
      publicKey: 'test-pk-1'
    });

    expect(response.agents).toBeDefined();
    expect(response.agents).toHaveLength(1);
    expect(response.agents![0]).toMatchObject({
      id: 'junior',
      displayName: 'Junior',
      role: 'primary'
    });
  });

  it('includes agents[] verbatim when explicitly configured', () => {
    const explicitAgents: AgentPersona[] = [
      { id: 'junior', displayName: 'Junior', role: 'primary', displayIcon: '⭐' },
      { id: 'sterling', displayName: 'Sterling', role: 'specialist', displayIcon: '💰' },
      { id: 'apollo', displayName: 'Apollo', role: 'specialist', displayIcon: '🔬' }
    ];
    const response = buildWellKnownResponse({
      cfg: baseConfig({ agents: explicitAgents }),
      intentNames: ['message', 'agent-comms'],
      publicKey: 'test-pk-1'
    });

    expect(response.agents).toEqual(explicitAgents);
  });

  it('preserves existing fields (version, displayName, email, gatewayUrl, publicKey, endpoints)', () => {
    const response = buildWellKnownResponse({
      cfg: baseConfig({ agentName: 'Junior' }),
      intentNames: ['message'],
      publicKey: 'test-pk-1'
    });

    expect(response).toMatchObject({
      version: expect.any(String),
      displayName: 'Test Gateway',
      email: 'test@example.com',
      gatewayUrl: 'https://test.example.com',
      publicKey: 'test-pk-1',
      capabilities: { intents: ['message'] },
      endpoints: {
        request: 'https://test.example.com/federation/request',
        approve: 'https://test.example.com/federation/approve',
        message: 'https://test.example.com/federation/message',
        reply: 'https://test.example.com/federation/reply/:nonce'
      }
    });
  });

  it('includes optional peerStatus when provided (existing F-12 behavior preserved)', () => {
    const peerStatus = {
      peerId: 'pid-123',
      healthy: true,
      healthState: 'established',
      lastCheckedAt: '2026-04-28T12:00:00Z',
      lastCheckFailedAt: null,
      healthCheckFailures: 0
    };
    const response = buildWellKnownResponse({
      cfg: baseConfig({ agentName: 'Junior' }),
      intentNames: ['message'],
      publicKey: 'test-pk-1',
      peerStatus
    });

    expect(response.peerStatus).toEqual(peerStatus);
  });

  it('omits peerStatus when not provided', () => {
    const response = buildWellKnownResponse({
      cfg: baseConfig({ agentName: 'Junior' }),
      intentNames: ['message'],
      publicKey: 'test-pk-1'
    });

    expect(response.peerStatus).toBeUndefined();
  });
});

describe('FederationMessage — toAgent field (B0032 P2)', () => {
  it('accepts a message envelope with toAgent set', () => {
    const message: FederationMessage = {
      intent: 'agent-comms',
      from: 'peer-1',
      to: 'me',
      toAgent: 'sterling',
      nonce: 'nonce-1',
      timestamp: '2026-04-28T12:00:00Z',
      payload: { topic: 'finance', text: 'hello sterling' }
    };

    expect(message.toAgent).toBe('sterling');
  });

  it('accepts a message envelope without toAgent (backward compat)', () => {
    const message: FederationMessage = {
      intent: 'agent-comms',
      from: 'peer-1',
      to: 'me',
      nonce: 'nonce-1',
      timestamp: '2026-04-28T12:00:00Z',
      payload: {}
    };

    expect(message.toAgent).toBeUndefined();
  });

  it('round-trips toAgent through JSON serialization', () => {
    const message: FederationMessage = {
      intent: 'message',
      from: 'peer-1',
      to: 'me',
      toAgent: 'apollo',
      nonce: 'nonce-2',
      timestamp: '2026-04-28T12:00:00Z',
      payload: { text: 'hi' }
    };

    const wire = JSON.stringify(message);
    const parsed = JSON.parse(wire) as FederationMessage;

    expect(parsed.toAgent).toBe('apollo');
    expect(parsed).toEqual(message);
  });
});

describe('ScopeGrant — personas[] field (B0032 P2)', () => {
  it('accepts a grant with personas restriction', () => {
    const grant: ScopeGrant = {
      intent: 'agent-comms',
      enabled: true,
      personas: ['junior', 'sterling']
    };

    expect(grant.personas).toEqual(['junior', 'sterling']);
  });

  it('accepts a grant without personas (backward compat — applies to all)', () => {
    const grant: ScopeGrant = {
      intent: 'agent-comms',
      enabled: true
    };

    expect(grant.personas).toBeUndefined();
  });

  it('round-trips personas through JSON serialization', () => {
    const grant: ScopeGrant = {
      intent: 'project.contribute',
      enabled: true,
      rateLimit: { requests: 50, windowSeconds: 1800 },
      topics: ['property-data'],
      personas: ['junior'],
      expiresAt: '2026-12-31T23:59:59Z'
    };

    const wire = JSON.stringify(grant);
    const parsed = JSON.parse(wire) as ScopeGrant;

    expect(parsed.personas).toEqual(['junior']);
    expect(parsed).toEqual(grant);
  });

  it('accepts an empty personas array (treated as absent at enforcement time, but valid on the wire)', () => {
    const grant: ScopeGrant = {
      intent: 'message',
      enabled: true,
      personas: []
    };

    expect(grant.personas).toEqual([]);
  });
});
