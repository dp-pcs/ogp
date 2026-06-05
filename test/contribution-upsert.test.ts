import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { generateKeyPair } from '../src/shared/signing.js';
import { buildSignedContribution } from '../src/daemon/contribution-signing.js';
import {
  addProject, createProject, joinProject, getProject,
  upsertContribution, type Project
} from '../src/daemon/projects.js';

describe('upsertContribution', () => {
  let tempDir: string;
  const author = generateKeyPair();

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ogp-upsert-'));
    process.env.OGP_HOME = tempDir;
    const p: Project = createProject('proj', 'Proj');
    addProject(p);
    joinProject('proj', author.publicKey); // author is a member
  });
  afterEach(() => {
    delete process.env.OGP_HOME;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  const mk = () => buildSignedContribution({
    projectId: 'proj', authorId: author.publicKey,
    entryType: 'note', summary: 'hello'
  }, author.privateKey).record;

  it('stores a verified record and is idempotent by id', () => {
    const rec = mk();
    expect(upsertContribution('proj', rec)).toBe('inserted');
    expect(upsertContribution('proj', rec)).toBe('duplicate'); // same id, no-op

    const proj = getProject('proj')!;
    const all = proj.topics.flatMap(t => t.contributions);
    expect(all.filter(c => c.id === rec.id)).toHaveLength(1);
    expect(all[0].verified).toBe(true);
  });

  it('rejects a record whose signature does not verify', () => {
    const rec = mk();
    rec.summary = 'tampered-after-signing';
    expect(upsertContribution('proj', rec)).toBe('rejected');
  });

  it('accepts a verified record from a NON-member author (the Story B hook)', () => {
    const stranger = generateKeyPair();
    const rec = buildSignedContribution({
      projectId: 'proj', authorId: stranger.publicKey,
      entryType: 'note', summary: 'relayed'
    }, stranger.privateKey).record;
    // stranger is NOT joined to 'proj'
    expect(upsertContribution('proj', rec)).toBe('inserted');
  });

  it('returns not-found for an unknown project', () => {
    expect(upsertContribution('nope', mk())).toBe('not-found');
  });
});
