import { describe, expect, it } from 'vitest';
import {
  type AgentPersona,
  resolveTargetPersona,
  effectiveHookAgentId
} from '../src/shared/config.js';

const PRIMARY: AgentPersona = { id: 'junior', displayName: 'Junior', role: 'primary' };
const STERLING: AgentPersona = { id: 'sterling', displayName: 'Sterling', role: 'specialist' };
const APOLLO: AgentPersona = { id: 'apollo', displayName: 'Apollo', role: 'specialist', hookAgentId: 'apollo-bot' };

const personas = [PRIMARY, STERLING, APOLLO];

describe('resolveTargetPersona — truth table (B0032 P3)', () => {
  it('returns primary when toAgent is undefined', () => {
    expect(resolveTargetPersona(undefined, personas)).toEqual(PRIMARY);
  });

  it('returns primary when toAgent is null', () => {
    expect(resolveTargetPersona(null, personas)).toEqual(PRIMARY);
  });

  it('returns primary when toAgent is an empty string', () => {
    expect(resolveTargetPersona('', personas)).toEqual(PRIMARY);
  });

  it('returns primary when toAgent matches the primary id', () => {
    expect(resolveTargetPersona('junior', personas)).toEqual(PRIMARY);
  });

  it('returns the matching specialist when toAgent matches a specialist id', () => {
    expect(resolveTargetPersona('sterling', personas)).toEqual(STERLING);
  });

  it('returns null when toAgent does not match any persona', () => {
    expect(resolveTargetPersona('nonexistent', personas)).toBeNull();
  });

  it('is case-sensitive (toAgent must match exact id)', () => {
    expect(resolveTargetPersona('JUNIOR', personas)).toBeNull();
    expect(resolveTargetPersona('Sterling', personas)).toBeNull();
  });

  it('returns null when personas array is empty (no primary to fall back to)', () => {
    expect(resolveTargetPersona(undefined, [])).toBeNull();
    expect(resolveTargetPersona('junior', [])).toBeNull();
  });

  it('returns the first primary if multiple primaries somehow exist (defensive)', () => {
    // validatePersonas should have caught this, but resolveTargetPersona must not crash.
    const badArray: AgentPersona[] = [
      { id: 'first-primary', displayName: 'First', role: 'primary' },
      { id: 'second-primary', displayName: 'Second', role: 'primary' }
    ];
    expect(resolveTargetPersona(undefined, badArray)).toEqual(badArray[0]);
  });
});

describe('effectiveHookAgentId — defaulting (B0032 P3, design doc decision #3)', () => {
  it('returns explicit hookAgentId when set', () => {
    expect(effectiveHookAgentId(APOLLO)).toBe('apollo-bot');
  });

  it('defaults primary persona without hookAgentId to "main" (back-compat)', () => {
    const persona: AgentPersona = { id: 'junior', displayName: 'Junior', role: 'primary' };
    expect(effectiveHookAgentId(persona)).toBe('main');
  });

  it('defaults specialist persona without hookAgentId to its id', () => {
    const persona: AgentPersona = { id: 'sterling', displayName: 'Sterling', role: 'specialist' };
    expect(effectiveHookAgentId(persona)).toBe('sterling');
  });

  it('explicit hookAgentId on a primary persona overrides the "main" default', () => {
    const persona: AgentPersona = { id: 'junior', displayName: 'Junior', role: 'primary', hookAgentId: 'custom' };
    expect(effectiveHookAgentId(persona)).toBe('custom');
  });

  it('explicit hookAgentId on a specialist persona overrides the id default', () => {
    const persona: AgentPersona = { id: 'sterling', displayName: 'Sterling', role: 'specialist', hookAgentId: 'sterling-v2' };
    expect(effectiveHookAgentId(persona)).toBe('sterling-v2');
  });

  it('treats empty-string hookAgentId as not-set (falls through to default)', () => {
    const primary: AgentPersona = { id: 'junior', displayName: 'Junior', role: 'primary', hookAgentId: '' };
    expect(effectiveHookAgentId(primary)).toBe('main');

    const specialist: AgentPersona = { id: 'sterling', displayName: 'Sterling', role: 'specialist', hookAgentId: '' };
    expect(effectiveHookAgentId(specialist)).toBe('sterling');
  });
});
