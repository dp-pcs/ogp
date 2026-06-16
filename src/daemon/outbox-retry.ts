/**
 * OGP outbox retry scheduler (bd-8rd.3 Option B).
 *
 * The daemon periodically scans the durable outbox and retries due frames.
 * Successful sends dequeue the frame; failures update the retry schedule.
 * After max attempts, the frame is moved to a dead-letter file.
 */
import { getPeer } from './peers.js';
import { loadConfig } from '../shared/config.js';
import {
  dequeueFrame,
  listDueFrames,
  recordAttempt,
  type QueuedFrame,
} from './outbox.js';
import { deliverFederationMessage } from './federation-delivery.js';

const RETRY_INTERVAL_MS = 30_000;

let retryTimer: ReturnType<typeof setInterval> | null = null;

async function retryFrame(peerId: string, frame: QueuedFrame): Promise<void> {
  const peer = getPeer(peerId);
  if (!peer) {
    recordAttempt(peerId, frame.nonce, 'Unknown peer');
    return;
  }
  const config = loadConfig();
  if (!config) {
    recordAttempt(peerId, frame.nonce, 'No OGP config');
    return;
  }
  try {
    const { ok, result } = await deliverFederationMessage(
      peer,
      { message: frame.message, messageStr: frame.messageStr, signature: frame.signature },
      { timeoutMs: 30000, config }
    );
    if (ok) {
      dequeueFrame(peerId, frame.nonce);
      console.log(`[OGP] Outbox retry succeeded: ${frame.nonce} -> ${peer.displayName || peerId}`);
    } else {
      const error = result?.error ? String(result.error) : 'Retry failed';
      recordAttempt(peerId, frame.nonce, error);
    }
  } catch (err) {
    recordAttempt(peerId, frame.nonce, (err as Error).message);
  }
}

export async function processOutbox(): Promise<void> {
  const due = listDueFrames();
  for (const { peerId, frame } of due) {
    await retryFrame(peerId, frame);
  }
}

export function startOutboxRetryScheduler(): void {
  if (retryTimer) return;
  void processOutbox();
  retryTimer = setInterval(() => {
    void processOutbox();
  }, RETRY_INTERVAL_MS);
}

export function stopOutboxRetryScheduler(): void {
  if (retryTimer) {
    clearInterval(retryTimer);
    retryTimer = null;
  }
}
