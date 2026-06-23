import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { showContextHelp } from '../src/shared/help.js';

describe('context help', () => {
  const logLines: string[] = [];

  beforeEach(() => {
    logLines.length = 0;
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logLines.push(args.join(' '));
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('top-level help includes current command surfaces', () => {
    showContextHelp([]);

    const output = logLines.join('\n');
    expect(output).toContain('  app');
    expect(output).toContain('  tunnel');
    expect(output).toContain('  completion');
    expect(output).toContain('  keychain');
  });
});
