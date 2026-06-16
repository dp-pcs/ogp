import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  loadOutbox,
  saveOutbox,
  enqueueFrame,
  dequeueFrame,
  recordAttempt,
  listDueFrames,
  getQueueSummary,
} from '../src/daemon/outbox.js';

describe('outbox', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ogp-outbox-'));
    process.env.OGP_HOME = dir;
  });

  afterEach(() => {
    delete process.env.OGP_HOME;
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('loads an empty outbox when no file exists', () => {
    const ob = loadOutbox();
    expect(ob.version).toBe(1);
    expect(ob.queues).toEqual({});
  });

  it('enqueues a frame', () => {
    const frame = {
      nonce: 'n1',
      message: { intent: 'project.contribute' },
      messageStr: '{}',
      signature: 'sig',
    };
    enqueueFrame('peer-1', frame);
    const ob = loadOutbox();
    expect(ob.queues['peer-1']).toHaveLength(1);
    expect(ob.queues['peer-1'][0].nonce).toBe('n1');
    expect(ob.queues['peer-1'][0].attempts).toBe(0);
  });

  it('does not duplicate the same nonce', () => {
    const frame = { nonce: 'n1', message: {}, messageStr: '{}', signature: 'sig' };
    enqueueFrame('peer-1', frame, 'first');
    enqueueFrame('peer-1', frame, 'second');
    const ob = loadOutbox();
    expect(ob.queues['peer-1']).toHaveLength(1);
    expect(ob.queues['peer-1'][0].lastError).toBe('second');
  });

  it('dequeues a frame', () => {
    const frame = { nonce: 'n1', message: {}, messageStr: '{}', signature: 'sig' };
    enqueueFrame('peer-1', frame);
    dequeueFrame('peer-1', 'n1');
    const ob = loadOutbox();
    expect(ob.queues['peer-1']).toBeUndefined();
  });

  it('lists due frames based on nextAttempt', () => {
    const now = new Date().toISOString();
    const past = new Date(Date.now() - 1000).toISOString();
    const future = new Date(Date.now() + 1000).toISOString();
    saveOutbox({
      version: 1,
      queues: {
        'peer-1': [
          { nonce: 'due', message: {}, messageStr: '{}', signature: 'sig', enqueuedAt: now, attempts: 0, nextAttempt: past },
          { nonce: 'future', message: {}, messageStr: '{}', signature: 'sig', enqueuedAt: now, attempts: 0, nextAttempt: future },
        ],
      },
    });
    const due = listDueFrames();
    expect(due.map((d) => d.frame.nonce)).toEqual(['due']);
  });

  it('records an attempt and advances nextAttempt', () => {
    const frame = { nonce: 'n1', message: {}, messageStr: '{}', signature: 'sig' };
    enqueueFrame('peer-1', frame);
    const before = loadOutbox().queues['peer-1'][0].nextAttempt;
    recordAttempt('peer-1', 'n1', 'timeout');
    const after = loadOutbox().queues['peer-1'][0];
    expect(after.attempts).toBe(1);
    expect(after.lastError).toBe('timeout');
    expect(new Date(after.nextAttempt).getTime()).toBeGreaterThan(new Date(before).getTime());
  });

  it('moves a frame to dead letter after max attempts', () => {
    const policy = { backoffSeconds: [0], maxAttempts: 1 };
    const frame = { nonce: 'n1', message: {}, messageStr: '{}', signature: 'sig' };
    enqueueFrame('peer-1', frame);
    const status = recordAttempt('peer-1', 'n1', 'fail', policy);
    expect(status).toBe('dead');
    expect(loadOutbox().queues['peer-1']).toBeUndefined();
    const dead = loadOutboxFromFile(path.join(dir, 'outbox-dead.json'));
    expect(dead.queues['peer-1']).toHaveLength(1);
    expect(dead.queues['peer-1'][0].nonce).toBe('n1');
  });

  it('summarizes queues', () => {
    const frame = { nonce: 'n1', message: {}, messageStr: '{}', signature: 'sig' };
    enqueueFrame('peer-1', frame);
    const summary = getQueueSummary();
    expect(summary).toHaveLength(1);
    expect(summary[0].count).toBe(1);
    expect(summary[0].nextAttempt).toBeDefined();
  });
});

function loadOutboxFromFile(file: string) {
  if (!fs.existsSync(file)) return { version: 1, queues: {} };
  return JSON.parse(fs.readFileSync(file, 'utf-8'));
}
