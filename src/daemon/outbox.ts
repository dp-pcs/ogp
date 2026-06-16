/**
 * OGP durable send outbox (bd-8rd.3 Option B).
 *
 * When a federation send is marked durable and fails to deliver, the signed
 * frame is queued here. The daemon periodically retries the queue with exponential
 * backoff. On success the frame is removed; after max attempts it is moved to a
 * dead-letter file.
 *
 * The outbox is per-config-dir (per-framework) and is read/written by both the
 * CLI (enqueue on failure) and the daemon (retry / dequeue / dead-letter).
 */
import fs from 'node:fs';
import path from 'node:path';
import { getConfigDir, ensureConfigDir } from '../shared/config.js';

export interface QueuedFrame {
  /** Original message nonce — also used as the queue item id. */
  nonce: string;
  /** The signed message payload. */
  message: unknown;
  /** The raw JSON string that was signed. */
  messageStr: string;
  /** Ed25519 signature. */
  signature: string;
  /** When the item was enqueued. */
  enqueuedAt: string;
  /** Number of delivery attempts so far. */
  attempts: number;
  /** ISO timestamp of the next scheduled retry. */
  nextAttempt: string;
  /** Last failure reason, if any. */
  lastError?: string;
}

export interface Outbox {
  version: number;
  queues: Record<string, QueuedFrame[]>;
}

export interface RetryPolicy {
  /** Backoff intervals in seconds. */
  backoffSeconds: number[];
  /** Maximum attempts before dead-lettering. */
  maxAttempts: number;
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  backoffSeconds: [10, 30, 60, 120, 300, 600, 1800, 3600],
  maxAttempts: 16,
};

const OUTBOX_FILE = 'outbox.json';
const DEAD_LETTER_FILE = 'outbox-dead.json';

function getOutboxPath(): string {
  return path.join(getConfigDir(), OUTBOX_FILE);
}

function getDeadLetterPath(): string {
  return path.join(getConfigDir(), DEAD_LETTER_FILE);
}

export function loadOutbox(): Outbox {
  const file = getOutboxPath();
  if (!fs.existsSync(file)) {
    return { version: 1, queues: {} };
  }
  try {
    const raw = fs.readFileSync(file, 'utf-8');
    const parsed = JSON.parse(raw) as Outbox;
    if (parsed.version !== 1 || typeof parsed.queues !== 'object') {
      return { version: 1, queues: {} };
    }
    return parsed;
  } catch {
    return { version: 1, queues: {} };
  }
}

export function saveOutbox(outbox: Outbox): void {
  ensureConfigDir();
  const file = getOutboxPath();
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(outbox, null, 2), 'utf-8');
  fs.renameSync(tmp, file);
}

export function loadDeadLetter(): Outbox {
  const file = getDeadLetterPath();
  if (!fs.existsSync(file)) {
    return { version: 1, queues: {} };
  }
  try {
    const raw = fs.readFileSync(file, 'utf-8');
    const parsed = JSON.parse(raw) as Outbox;
    if (parsed.version !== 1 || typeof parsed.queues !== 'object') {
      return { version: 1, queues: {} };
    }
    return parsed;
  } catch {
    return { version: 1, queues: {} };
  }
}

export function saveDeadLetter(dead: Outbox): void {
  ensureConfigDir();
  const file = getDeadLetterPath();
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(dead, null, 2), 'utf-8');
  fs.renameSync(tmp, file);
}

function nowISO(): string {
  return new Date().toISOString();
}

function addSeconds(iso: string, seconds: number): string {
  const d = new Date(iso);
  d.setTime(d.getTime() + seconds * 1000);
  return d.toISOString();
}

export function enqueueFrame(
  peerId: string,
  frame: { message: unknown; messageStr: string; signature: string; nonce: string },
  error?: string,
  policy: RetryPolicy = DEFAULT_RETRY_POLICY
): void {
  const outbox = loadOutbox();
  outbox.queues[peerId] = outbox.queues[peerId] || [];
  const existing = outbox.queues[peerId].find((q) => q.nonce === frame.nonce);
  if (existing) {
    // Already queued — just update the last error and leave schedule alone.
    existing.lastError = error;
    saveOutbox(outbox);
    return;
  }
  const item: QueuedFrame = {
    nonce: frame.nonce,
    message: frame.message,
    messageStr: frame.messageStr,
    signature: frame.signature,
    enqueuedAt: nowISO(),
    attempts: 0,
    nextAttempt: addSeconds(nowISO(), policy.backoffSeconds[0] || 10),
    lastError: error,
  };
  outbox.queues[peerId].push(item);
  saveOutbox(outbox);
}

export function dequeueFrame(peerId: string, nonce: string): void {
  const outbox = loadOutbox();
  const queue = outbox.queues[peerId];
  if (!queue) return;
  const idx = queue.findIndex((q) => q.nonce === nonce);
  if (idx >= 0) {
    queue.splice(idx, 1);
    if (queue.length === 0) delete outbox.queues[peerId];
  }
  saveOutbox(outbox);
}

export function recordAttempt(
  peerId: string,
  nonce: string,
  error: string,
  policy: RetryPolicy = DEFAULT_RETRY_POLICY
): 'retry' | 'dead' {
  const outbox = loadOutbox();
  const queue = outbox.queues[peerId];
  if (!queue) return 'dead';
  const item = queue.find((q) => q.nonce === nonce);
  if (!item) return 'dead';
  item.attempts += 1;
  item.lastError = error;
  if (item.attempts >= policy.maxAttempts) {
    moveToDeadLetter(peerId, item, outbox);
    return 'dead';
  }
  const delay = policy.backoffSeconds[Math.min(item.attempts, policy.backoffSeconds.length - 1)];
  item.nextAttempt = addSeconds(nowISO(), delay);
  saveOutbox(outbox);
  return 'retry';
}

function moveToDeadLetter(peerId: string, item: QueuedFrame, outbox: Outbox): void {
  const dead = loadDeadLetter();
  dead.queues[peerId] = dead.queues[peerId] || [];
  dead.queues[peerId].push({ ...item, lastError: `${item.lastError || ''} (max attempts reached)`.trim() });
  saveDeadLetter(dead);
  const queue = outbox.queues[peerId];
  const idx = queue.findIndex((q) => q.nonce === item.nonce);
  if (idx >= 0) {
    queue.splice(idx, 1);
    if (queue.length === 0) delete outbox.queues[peerId];
  }
  saveOutbox(outbox);
}

export function listDueFrames(policy: RetryPolicy = DEFAULT_RETRY_POLICY): { peerId: string; frame: QueuedFrame }[] {
  const outbox = loadOutbox();
  const now = nowISO();
  const due: { peerId: string; frame: QueuedFrame }[] = [];
  for (const [peerId, queue] of Object.entries(outbox.queues)) {
    for (const frame of queue) {
      if (frame.nextAttempt <= now && frame.attempts < policy.maxAttempts) {
        due.push({ peerId, frame });
      }
    }
  }
  return due;
}

export function getQueueSummary(): { peerId: string; count: number; nextAttempt: string | null }[] {
  const outbox = loadOutbox();
  return Object.entries(outbox.queues).map(([peerId, queue]) => {
    const next = queue.length > 0 ? queue.map((q) => q.nextAttempt).sort()[0] : null;
    return { peerId, count: queue.length, nextAttempt: next };
  });
}

export function isDurableEnabled(config: { federation?: { durableDelivery?: boolean } } | null): boolean {
  return !!config?.federation?.durableDelivery;
}

export function shouldUseDurable(explicit: boolean | undefined, config: { federation?: { durableDelivery?: boolean } } | null): boolean {
  if (explicit !== undefined) return explicit;
  return isDurableEnabled(config);
}
