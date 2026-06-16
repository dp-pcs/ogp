import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { backfillContributionsFromPeer } from '../src/daemon/contribution-backfill.js';
import { upsertContribution, createProject, addProject } from '../src/daemon/projects.js';
import { buildSignedContribution } from '../src/daemon/contribution-signing.js';
import * as crypto from 'node:crypto';

const { privateKey: PRIVATE_KEY, publicKey: PUBKEY } = (() => {
  const keypair = crypto.generateKeyPairSync('ed25519');
  const pub = keypair.publicKey.export({ type: 'spki', format: 'der' }).toString('hex');
  const priv = keypair.privateKey.export({ type: 'pkcs8', format: 'der' }).toString('hex');
  return { privateKey: priv, publicKey: pub };
})();

describe('federation reconcile backfill', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ogp-reconcile-'));
    process.env.OGP_HOME = dir;
  });

  afterEach(() => {
    delete process.env.OGP_HOME;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('merges signed contributions from a peer query', async () => {
    addProject(createProject('proj-1', 'Project One'));
    const { wire: signed } = buildSignedContribution(
      { projectId: 'proj-1', authorId: PUBKEY, entryType: 'note', summary: 'hello' },
      PRIVATE_KEY
    );

    const deps = {
      query: async () => ({
        success: true,
        response: {
          projectId: 'proj-1',
          contributions: [{
            id: signed.id,
            timestamp: signed.timestamp,
            authorId: signed.authorId,
            entryType: 'note',
            summary: 'hello',
            signature: signed.signature,
            payloadStr: signed.payloadStr,
          }],
        },
      }),
      upsert: (projectId: string, rec: any) => upsertContribution(projectId, rec),
    };

    const result = await backfillContributionsFromPeer('peer-1', 'proj-1', deps, { limit: 100 });
    expect(result.pulled).toBe(1);
    expect(result.inserted).toBe(1);
  });

  it('skips unsigned contributions', async () => {
    const deps = {
      query: async () => ({
        success: true,
        response: {
          projectId: 'proj-1',
          contributions: [{
            id: 'c2',
            timestamp: new Date().toISOString(),
            authorId: PUBKEY,
            entryType: 'note',
            summary: 'legacy',
          }],
        },
      }),
      upsert: () => 'inserted' as const,
    };

    const result = await backfillContributionsFromPeer('peer-1', 'proj-1', deps, { limit: 100 });
    expect(result.pulled).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.inserted).toBe(0);
  });
});
