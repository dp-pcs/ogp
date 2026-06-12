// Cross-member contribution reconciliation (bd-53c).
//
// Each daemon only stores the project.contribute messages addressed to IT, so a
// consumer's mirror is a partial frozen subset of a project's contributions. This
// module pulls a peer's contributions over the SIGNED project.query path and
// union-merges them by contribution id — idempotent, trust-preserving, and never by
// scanning sibling stateDirs on disk.
//
// The trust core is reused, not reinvented: every merged record is re-verified by
// upsertContribution against its own signature. A record without a signed envelope
// (legacy) is skipped — it can't be trust-merged. Pure-ish: the federation sender and
// the upsert fn are injected so the merge logic is unit-testable without a live peer.

import type { ProjectContribution } from './projects.js';

/** One contribution as it appears in a project.query response (bd-2n3 + bd-53c). */
export interface QueriedContribution {
  id: string;
  timestamp: string;
  authorId: string;
  entryType?: string;
  topic?: string;
  summary: string;
  metadata?: Record<string, any>;
  // bd-53c: present only for signed records — the trust envelope needed to merge.
  signature?: string;
  payloadStr?: string;
}

/** Outcome tally of a backfill pass against one peer. */
export interface BackfillResult {
  peerId: string;
  projectId: string;
  pulled: number;     // contributions returned by the peer
  inserted: number;   // freshly merged
  duplicate: number;  // already had them (idempotent no-op)
  rejected: number;   // signature failed re-verification (tamper / wrong key)
  skipped: number;    // no signed envelope (legacy) — can't trust-merge
  error?: string;     // peer offline / 403 / malformed — pull failed entirely
}

/** Minimal shape of a federation `project.query` response we read. */
interface QueryResponse {
  success?: boolean;
  error?: string;
  response?: {
    projectId?: string;
    contributions?: QueriedContribution[];
  };
}

export interface BackfillDeps {
  /** Send a signed `project.query` to the peer; mirrors federationSend's return. */
  query: (peerId: string, projectId: string, limit: number) => Promise<QueryResponse | null>;
  /** Idempotent, signature-verifying merge; mirrors projects.upsertContribution. */
  upsert: (projectId: string, record: ProjectContribution) => 'inserted' | 'duplicate' | 'rejected' | 'not-found';
}

const DEFAULT_LIMIT = 500;

/**
 * Pull `projectId`'s contributions from `peerId` and union-merge them locally.
 * Best-effort: a failed pull returns a result with `error` set and zero merges —
 * it never throws, so callers (on-join / heartbeat) can sweep many peers safely.
 */
export async function backfillContributionsFromPeer(
  peerId: string,
  projectId: string,
  deps: BackfillDeps,
  opts: { limit?: number } = {}
): Promise<BackfillResult> {
  const result: BackfillResult = {
    peerId, projectId, pulled: 0, inserted: 0, duplicate: 0, rejected: 0, skipped: 0
  };

  let response: QueryResponse | null;
  try {
    response = await deps.query(peerId, projectId, opts.limit ?? DEFAULT_LIMIT);
  } catch (err) {
    result.error = `query failed: ${(err as Error).message}`;
    return result;
  }

  if (!response) { result.error = 'no response from peer'; return result; }
  if (response.success === false) { result.error = response.error || 'query rejected'; return result; }

  const contributions = response.response?.contributions ?? [];
  result.pulled = contributions.length;

  for (const c of contributions) {
    // Only signed records can be trust-merged. The envelope is what upsertContribution
    // re-verifies; without it we'd be trusting unsigned peer data — skip instead.
    if (!c.signature || !c.payloadStr) { result.skipped++; continue; }

    const record: ProjectContribution = {
      id: c.id,
      timestamp: c.timestamp,
      authorId: c.authorId,
      entryType: c.entryType ?? c.topic,
      topic: c.entryType ?? c.topic,
      summary: c.summary,
      metadata: c.metadata,
      signature: c.signature
    };

    const outcome = deps.upsert(projectId, record);
    if (outcome === 'inserted') result.inserted++;
    else if (outcome === 'duplicate') result.duplicate++;
    else result.rejected++; // 'rejected' (bad sig) or 'not-found' (project gone locally)
  }

  return result;
}
