import { describe, expect, it, vi } from 'vitest';
import type { AgentPersona } from '../src/shared/config.js';
import {
  validateTargetAgent,
  type AgentTargetingProbeFn,
  type AgentTargetingProbeResult
} from '../src/cli/agent-targeting.js';

const peerStub = {
  id: 'peer-123',
  gatewayUrl: 'https://peer.example.com',
  displayName: 'Peer'
};

function makeProbe(result: Partial<AgentTargetingProbeResult> = {}): AgentTargetingProbeFn {
  return vi.fn(async () => ({
    features: result.features ?? [],
    agents: result.agents ?? []
  }));
}

const sterling: AgentPersona = {
  id: 'sterling',
  displayName: 'Sterling',
  role: 'specialist'
};

const main: AgentPersona = {
  id: 'main',
  displayName: 'Main',
  role: 'primary'
};

describe('validateTargetAgent (P4 capability check)', () => {
  it('returns ok when --to-agent is omitted (legacy behavior)', async () => {
    const probe = makeProbe();
    const result = await validateTargetAgent(peerStub, undefined, probe);
    expect(result).toEqual({ ok: true });
    expect(probe).not.toHaveBeenCalled();
  });

  it('returns ok when peer advertises multi-agent-personas and persona exists', async () => {
    const probe = makeProbe({
      features: ['scope-negotiation', 'multi-agent-personas'],
      agents: [main, sterling]
    });
    const result = await validateTargetAgent(peerStub, 'sterling', probe);
    expect(result).toEqual({ ok: true });
    expect(probe).toHaveBeenCalledOnce();
  });

  it('rejects when peer does not advertise multi-agent-personas capability', async () => {
    const probe = makeProbe({
      features: ['scope-negotiation', 'reply-callback'],
      agents: []
    });
    const result = await validateTargetAgent(peerStub, 'sterling', probe);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/multi-agent/i);
      expect(result.reason).toMatch(/sterling/);
    }
  });

  it('rejects when persona is not in peer agents[]', async () => {
    const probe = makeProbe({
      features: ['multi-agent-personas'],
      agents: [main]
    });
    const result = await validateTargetAgent(peerStub, 'sterling', probe);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("'sterling'");
      expect(result.reason).toContain('main');
    }
  });

  it('lists "(none)" when peer advertises multi-agent but exposes no agents', async () => {
    const probe = makeProbe({
      features: ['multi-agent-personas'],
      agents: []
    });
    const result = await validateTargetAgent(peerStub, 'sterling', probe);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('(none)');
    }
  });

  it('returns a clear error when probe throws (peer unreachable)', async () => {
    const probe: AgentTargetingProbeFn = vi.fn(async () => {
      throw new Error('ECONNREFUSED');
    });
    const result = await validateTargetAgent(peerStub, 'sterling', probe);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toMatch(/could not reach/i);
      expect(result.reason).toContain('Peer');
    }
  });
});
