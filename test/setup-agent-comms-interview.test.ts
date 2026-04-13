import { describe, expect, it } from 'vitest';
import {
  applyDelegatedAuthorityInterviewAnswers,
  deriveDelegatedAuthorityInterviewAnswers,
  isValidGatewayUrl,
  normalizeGatewayUrlInput
} from '../src/cli/setup.js';
import type { OGPConfig } from '../src/shared/config.js';

describe('agent-comms interview config helpers', () => {
  it('normalizes a bare gateway hostname to https', () => {
    expect(normalizeGatewayUrlInput('david-proctor.gw.clawporate.elelem.expert/')).toBe(
      'https://david-proctor.gw.clawporate.elelem.expert'
    );
  });

  it('accepts valid normalized gateway URLs and rejects malformed ones', () => {
    expect(isValidGatewayUrl('https://ogp.example.com')).toBe(true);
    expect(isValidGatewayUrl('http://localhost:18790')).toBe(true);
    expect(isValidGatewayUrl('https://')).toBe(false);
  });

  it('derives current interview defaults from delegated-authority config', () => {
    const config: OGPConfig = {
      daemonPort: 18790,
      openclawUrl: 'http://localhost:18789',
      openclawToken: 'token',
      gatewayUrl: 'https://ogp.example.com',
      displayName: 'Junior',
      email: 'junior@example.com',
      stateDir: '~/.ogp',
      agentId: 'main',
      humanDeliveryTarget: 'telegram:123456789',
      inboundFederationPolicy: {
        mode: 'summarize'
      },
      delegatedAuthority: {
        global: {
          defaultRule: {
            mode: 'autonomous',
            relayMode: 'deliver',
            surfaceToHuman: 'important-only',
            allowDirectPeerReply: true,
            notes: 'Trusted peers may receive more autonomy through future per-peer overrides.'
          },
          classRules: {
            'human-relay': {
              mode: 'forward',
              relayMode: 'summarize',
              surfaceToHuman: 'important-only',
              allowDirectPeerReply: false
            }
          },
          topicRules: {
            finance: {
              mode: 'approval-required',
              relayMode: 'approval-required',
              surfaceToHuman: 'always',
              allowDirectPeerReply: false
            }
          }
        },
        peers: {}
      }
    };

    expect(deriveDelegatedAuthorityInterviewAnswers(config)).toEqual({
      humanDeliveryTarget: 'telegram:123456789',
      inboundFederationMode: 'autonomous',
      humanSurfacingMode: 'important-only',
      relayHandlingMode: 'summarize',
      approvalTopics: ['finance'],
      trustedPeerAutonomy: true
    });
  });

  it('applies interview answers without clobbering unrelated config fields', () => {
    const config: OGPConfig = {
      daemonPort: 18793,
      openclawUrl: 'http://localhost:18789',
      openclawToken: '',
      gatewayUrl: 'https://hermes.example.com',
      displayName: 'Apollo',
      email: 'apollo@example.com',
      stateDir: '~/.ogp-hermes',
      platform: 'hermes',
      hermesWebhookUrl: 'http://localhost:8644/webhooks/ogp_federation',
      hermesWebhookSecret: 'secret',
      notifyTarget: 'telegram:999',
      inboundFederationPolicy: {
        mode: 'forward'
      }
    };

    const updated = applyDelegatedAuthorityInterviewAnswers(config, {
      inboundFederationMode: 'approval-required',
      humanSurfacingMode: 'important-only',
      relayHandlingMode: 'approval-required',
      approvalTopics: ['calendar', 'personal'],
      trustedPeerAutonomy: false
    });

    expect(updated.platform).toBe('hermes');
    expect(updated.hermesWebhookUrl).toBe('http://localhost:8644/webhooks/ogp_federation');
    expect(updated.notifyTarget).toBe('telegram:999');
    expect(updated.inboundFederationPolicy?.mode).toBe('approval-required');
    expect(updated.humanDeliveryTarget).toBeUndefined();
    expect(updated.delegatedAuthority?.global.defaultRule.notes).toContain('should not receive more autonomy');
    expect(updated.delegatedAuthority?.global.topicRules).toMatchObject({
      calendar: {
        mode: 'approval-required'
      },
      personal: {
        mode: 'approval-required'
      }
    });
  });
});
