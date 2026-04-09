import { describe, expect, it } from 'vitest';
import {
  classifyFederatedMessage,
  formatHandlingGuidance,
  resolveFederatedHandlingPolicy,
  type NotificationPayload
} from '../src/daemon/notify.js';
import type { OGPConfig } from '../src/shared/config.js';

function createConfig(overrides: Partial<OGPConfig> = {}): OGPConfig {
  return {
    daemonPort: 18790,
    openclawUrl: 'https://localhost:18789',
    openclawToken: 'token',
    gatewayUrl: 'https://example.com',
    displayName: 'Test Gateway',
    email: 'test@example.com',
    stateDir: '/tmp/ogp-test',
    ...overrides
  };
}

describe('notify policy resolution', () => {
  it('falls back to legacy inbound federation mode when delegated authority is absent', () => {
    const config = createConfig({
      inboundFederationPolicy: { mode: 'autonomous' }
    });
    const payload: NotificationPayload = {
      text: 'hello',
      intent: 'agent-comms',
      topic: 'general',
      peerId: 'apollo'
    };

    expect(resolveFederatedHandlingPolicy(config, payload)).toEqual({
      messageClass: 'agent-work',
      topic: 'general',
      mode: 'autonomous',
      relayMode: 'deliver',
      surfaceToHuman: 'important-only',
      allowDirectPeerReply: true
    });
  });

  it('prefers delegated authority over legacy mode', () => {
    const config = createConfig({
      inboundFederationPolicy: { mode: 'forward' },
      delegatedAuthority: {
        global: {
          defaultRule: {
            mode: 'summarize',
            surfaceToHuman: 'summary-only'
          }
        }
      }
    });
    const payload: NotificationPayload = {
      text: 'hello',
      intent: 'agent-comms',
      topic: 'general'
    };

    expect(resolveFederatedHandlingPolicy(config, payload).mode).toBe('summarize');
    expect(resolveFederatedHandlingPolicy(config, payload).surfaceToHuman).toBe('summary-only');
  });

  it('applies global topic rules after peer defaults', () => {
    const config = createConfig({
      delegatedAuthority: {
        global: {
          defaultRule: { mode: 'summarize' },
          topicRules: {
            finance: {
              mode: 'approval-required',
              relayMode: 'approval-required',
              surfaceToHuman: 'always',
              allowDirectPeerReply: false
            }
          }
        },
        peers: {
          apollo: {
            trust: 'trusted',
            defaultRule: {
              mode: 'autonomous',
              surfaceToHuman: 'never',
              allowDirectPeerReply: true
            }
          }
        }
      }
    });
    const payload: NotificationPayload = {
      text: 'budget update',
      intent: 'agent-comms',
      topic: 'finance',
      peerId: 'apollo'
    };

    expect(resolveFederatedHandlingPolicy(config, payload)).toEqual({
      messageClass: 'agent-work',
      topic: 'finance',
      mode: 'approval-required',
      relayMode: 'approval-required',
      surfaceToHuman: 'always',
      allowDirectPeerReply: false
    });
  });

  it('does not let peer defaults override more specific global class rules', () => {
    const config = createConfig({
      delegatedAuthority: {
        global: {
          defaultRule: {
            mode: 'summarize',
            surfaceToHuman: 'summary-only'
          },
          classRules: {
            'human-relay': {
              mode: 'forward',
              relayMode: 'approval-required',
              surfaceToHuman: 'always',
              allowDirectPeerReply: false
            }
          }
        },
        peers: {
          apollo: {
            defaultRule: {
              mode: 'autonomous',
              relayMode: 'deliver',
              surfaceToHuman: 'never',
              allowDirectPeerReply: true
            }
          }
        }
      }
    });
    const payload: NotificationPayload = {
      text: 'tell David the budget changed',
      intent: 'agent-comms',
      messageClass: 'human-relay',
      peerId: 'apollo'
    };

    expect(resolveFederatedHandlingPolicy(config, payload)).toEqual({
      messageClass: 'human-relay',
      topic: undefined,
      mode: 'forward',
      relayMode: 'approval-required',
      surfaceToHuman: 'always',
      allowDirectPeerReply: false
    });
  });

  it('lets peer class rules override global class rules within the same specificity tier', () => {
    const config = createConfig({
      delegatedAuthority: {
        global: {
          defaultRule: { mode: 'summarize' },
          classRules: {
            'human-relay': {
              relayMode: 'approval-required',
              surfaceToHuman: 'always',
              allowDirectPeerReply: false
            }
          }
        },
        peers: {
          apollo: {
            classRules: {
              'human-relay': {
                relayMode: 'summarize',
                surfaceToHuman: 'summary-only'
              }
            }
          }
        }
      }
    });
    const payload: NotificationPayload = {
      text: 'tell David the budget changed',
      intent: 'agent-comms',
      messageClass: 'human-relay',
      peerId: 'apollo'
    };

    expect(resolveFederatedHandlingPolicy(config, payload)).toEqual({
      messageClass: 'human-relay',
      topic: undefined,
      mode: 'summarize',
      relayMode: 'summarize',
      surfaceToHuman: 'summary-only',
      allowDirectPeerReply: false
    });
  });

  it('applies peer topic rules last', () => {
    const config = createConfig({
      delegatedAuthority: {
        global: {
          defaultRule: { mode: 'summarize' },
          topicRules: {
            finance: {
              mode: 'approval-required',
              surfaceToHuman: 'always',
              allowDirectPeerReply: false
            }
          }
        },
        peers: {
          apollo: {
            defaultRule: { mode: 'autonomous' },
            topicRules: {
              finance: {
                mode: 'summarize',
                surfaceToHuman: 'summary-only',
                allowDirectPeerReply: true
              }
            }
          }
        }
      }
    });
    const payload: NotificationPayload = {
      text: 'budget update',
      intent: 'agent-comms',
      topic: 'finance',
      peerId: 'apollo'
    };

    expect(resolveFederatedHandlingPolicy(config, payload)).toEqual({
      messageClass: 'agent-work',
      topic: 'finance',
      mode: 'summarize',
      relayMode: 'summarize',
      surfaceToHuman: 'summary-only',
      allowDirectPeerReply: true
    });
  });

  it('classifies federation requests as approval requests from metadata', () => {
    const payload: NotificationPayload = {
      text: 'approve me',
      metadata: {
        ogp: {
          type: 'federation_request'
        }
      }
    };

    expect(classifyFederatedMessage(payload)).toBe('approval-request');
  });

  it('formats human-relay guidance without claiming delivery happened', () => {
    const config = createConfig({
      humanDeliveryTarget: 'telegram:123456',
      delegatedAuthority: {
        global: {
          defaultRule: { mode: 'autonomous' },
          classRules: {
            'human-relay': {
              relayMode: 'approval-required',
              surfaceToHuman: 'always',
              allowDirectPeerReply: false
            }
          }
        }
      }
    });
    const payload: NotificationPayload = {
      text: 'Tell David we shipped it',
      intent: 'agent-comms',
      messageClass: 'human-relay'
    };

    const guidance = formatHandlingGuidance(config, payload);
    expect(guidance).toContain('hold this relay for approval');
    expect(guidance).toContain('Do not claim delivery');
    expect(guidance).toContain('telegram:123456');
  });

  it('uses metadata peer display name fallback for lifecycle notifications', () => {
    const config = createConfig({
      delegatedAuthority: {
        global: {
          defaultRule: { mode: 'summarize' }
        }
      }
    });
    const payload: NotificationPayload = {
      text: 'pending approval',
      messageClass: 'approval-request',
      metadata: {
        ogp: {
          type: 'federation_request',
          peer: {
            id: 'apollo-id',
            displayName: 'Apollo'
          }
        }
      }
    };

    const guidance = formatHandlingGuidance(config, payload);
    expect(guidance).toContain('approval-request');
    expect(classifyFederatedMessage(payload)).toBe('approval-request');
  });
});
