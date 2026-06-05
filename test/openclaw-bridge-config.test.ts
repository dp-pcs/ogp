import { describe, expect, it } from 'vitest';
import { parseOpenClawHooksConfigText } from '../src/daemon/openclaw-bridge.js';

describe('parseOpenClawHooksConfigText', () => {
  it('parses strict JSON config', () => {
    const parsed = parseOpenClawHooksConfigText(JSON.stringify({
      hooks: {
        token: 'abc123',
        allowRequestSessionKey: true,
        allowedSessionKeyPrefixes: ['agent:main:', ' agent:scribe: ']
      }
    }));

    expect(parsed).toEqual({
      token: 'abc123',
      allowRequestSessionKey: true,
      allowedSessionKeyPrefixes: ['agent:main:', 'agent:scribe:']
    });
  });

  it('parses json5-style OpenClaw config with trailing commas', () => {
    const parsed = parseOpenClawHooksConfigText(`
      {
        hooks: {
          token: 'hook-token',
          allowRequestSessionKey: false,
          allowedSessionKeyPrefixes: ['agent:main:',],
        },
      }
    `);

    expect(parsed).toEqual({
      token: 'hook-token',
      allowRequestSessionKey: false,
      allowedSessionKeyPrefixes: ['agent:main:']
    });
  });

  it('returns undefined for invalid config text', () => {
    expect(parseOpenClawHooksConfigText('{ definitely not valid')).toBeUndefined();
  });
});
