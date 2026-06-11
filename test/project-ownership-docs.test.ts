import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('bd-hy3o docs + completion updated', () => {
  it('bash completion lists ownership subcommands', () => {
    const s = readFileSync('scripts/completion.bash', 'utf-8');
    for (const c of ['add-owner', 'claim-ownership', 'owners']) expect(s).toContain(c);
  });
  it('zsh completion lists ownership subcommands', () => {
    const s = readFileSync('scripts/completion.zsh', 'utf-8');
    for (const c of ['add-owner', 'claim-ownership', 'owners']) expect(s).toContain(c);
  });
  it('README documents project ownership', () => {
    const s = readFileSync('README.md', 'utf-8');
    expect(s).toMatch(/Project Ownership/i);
    for (const c of ['add-owner', 'claim-ownership', 'owners']) expect(s).toContain(c);
  });
});
