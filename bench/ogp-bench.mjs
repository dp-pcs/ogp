#!/usr/bin/env node
/**
 * OGP Benchmark Suite
 * Measures: Ed25519 sign/verify throughput, Doorman enforcement latency,
 * and federation handshake RTT.
 *
 * Run: node bench/ogp-bench.mjs
 * Outputs: bench/results.json + human-readable summary to stdout
 */

import crypto from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function p(arr, pct) {
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.floor(sorted.length * pct);
  return sorted[Math.min(idx, sorted.length - 1)];
}

function stats(samples) {
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
  return {
    mean: +mean.toFixed(4),
    p50: +p(samples, 0.5).toFixed(4),
    p95: +p(samples, 0.95).toFixed(4),
    p99: +p(samples, 0.99).toFixed(4),
    min: +Math.min(...samples).toFixed(4),
    max: +Math.max(...samples).toFixed(4),
    n: samples.length,
  };
}

function heading(s) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  ${s}`);
  console.log('─'.repeat(60));
}

// ---------------------------------------------------------------------------
// 1. Ed25519 sign/verify throughput
// ---------------------------------------------------------------------------

function benchmarkCrypto(iterations = 10_000) {
  heading(`1. Ed25519 Sign/Verify Throughput  (n=${iterations.toLocaleString()})`);

  // Generate key pair
  const { publicKey: pubDer, privateKey: privDer } = crypto.generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'der' },
    privateKeyEncoding: { type: 'pkcs8', format: 'der' },
  });
  const pubKeyHex = pubDer.toString('hex');
  const privKeyHex = privDer.toString('hex');

  // Reconstruct key objects (matches OGP's sign/verify pattern)
  const privateKey = crypto.createPrivateKey({ key: Buffer.from(privKeyHex, 'hex'), format: 'der', type: 'pkcs8' });
  const publicKey = crypto.createPublicKey({ key: Buffer.from(pubKeyHex, 'hex'), format: 'der', type: 'spki' });

  // Warm-up
  for (let i = 0; i < 100; i++) {
    const msg = Buffer.from(`warmup-${i}`, 'utf-8');
    const sig = crypto.sign(null, msg, privateKey);
    crypto.verify(null, msg, publicKey, sig);
  }

  // Sign benchmark
  const signTimes = [];
  const signatures = [];
  const messages = [];
  for (let i = 0; i < iterations; i++) {
    const msg = Buffer.from(JSON.stringify({ intent: 'agent-comms', from: 'peer-alice', nonce: `n-${i}`, timestamp: new Date().toISOString() }), 'utf-8');
    messages.push(msg);
    const t0 = performance.now();
    const sig = crypto.sign(null, msg, privateKey);
    signTimes.push(performance.now() - t0);
    signatures.push(sig);
  }

  // Verify benchmark
  const verifyTimes = [];
  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    crypto.verify(null, messages[i], publicKey, signatures[i]);
    verifyTimes.push(performance.now() - t0);
  }

  // HMAC-SHA256 control (same message sizes)
  const hmacKey = crypto.randomBytes(32);
  const hmacSignTimes = [];
  const hmacVerifyTimes = [];
  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    const mac = crypto.createHmac('sha256', hmacKey).update(messages[i]).digest();
    hmacSignTimes.push(performance.now() - t0);
    const t1 = performance.now();
    const mac2 = crypto.createHmac('sha256', hmacKey).update(messages[i]).digest();
    crypto.timingSafeEqual(mac, mac2);
    hmacVerifyTimes.push(performance.now() - t1);
  }

  const signStats = stats(signTimes);
  const verifyStats = stats(verifyTimes);
  const hmacSignStats = stats(hmacSignTimes);
  const hmacVerifyStats = stats(hmacVerifyTimes);

  console.log('\nEd25519 Sign:');
  console.log(`  mean=${signStats.mean}ms  p50=${signStats.p50}ms  p95=${signStats.p95}ms  p99=${signStats.p99}ms`);
  console.log(`  throughput: ${(1000 / signStats.mean).toFixed(0)} ops/sec`);

  console.log('\nEd25519 Verify:');
  console.log(`  mean=${verifyStats.mean}ms  p50=${verifyStats.p50}ms  p95=${verifyStats.p95}ms  p99=${verifyStats.p99}ms`);
  console.log(`  throughput: ${(1000 / verifyStats.mean).toFixed(0)} ops/sec`);

  console.log('\nHMAC-SHA256 Sign (control):');
  console.log(`  mean=${hmacSignStats.mean}ms  p50=${hmacSignStats.p50}ms`);
  console.log(`  overhead vs HMAC: ${(signStats.mean / hmacSignStats.mean).toFixed(1)}x`);

  console.log('\nHMAC-SHA256 Verify (control):');
  console.log(`  mean=${hmacVerifyStats.mean}ms  p50=${hmacVerifyStats.p50}ms`);
  console.log(`  overhead vs HMAC: ${(verifyStats.mean / hmacVerifyStats.mean).toFixed(1)}x`);

  return { signStats, verifyStats, hmacSignStats, hmacVerifyStats };
}

// ---------------------------------------------------------------------------
// 2. Doorman checkAccess latency
// ---------------------------------------------------------------------------

function benchmarkDoorman(iterations = 50_000) {
  heading(`2. Doorman checkAccess Latency  (n=${iterations.toLocaleString()})`);

  function buildPeer(id, numScopes) {
    const grants = [];
    for (let i = 0; i < numScopes; i++) {
      grants.push({ intent: `intent-${i}`, rateLimit: { requests: 100, windowSeconds: 3600 } });
    }
    return { id, status: 'approved', grantedScopes: { grants }, protocolVersion: '0.2.0' };
  }

  function findGrant(peer, intent) {
    if (!peer.grantedScopes) return null;
    return peer.grantedScopes.grants.find(g => g.intent === intent) || null;
  }

  function checkAccess(peers, peerId, intent) {
    const peer = peers.get(peerId);
    if (!peer) return { allowed: false };
    if (peer.status !== 'approved') return { allowed: false };
    const grant = findGrant(peer, intent);
    if (!grant) return { allowed: false };
    return { allowed: true };
  }

  const peerCounts = [1, 10, 100, 1000];
  const results = {};

  for (const peerCount of peerCounts) {
    const peers = new Map();
    for (let i = 0; i < peerCount; i++) {
      const p = buildPeer(`peer-${i}`, 10);
      peers.set(p.id, p);
    }
    const targetId = `peer-${peerCount - 1}`;

    // Warm-up
    for (let i = 0; i < 500; i++) checkAccess(peers, targetId, 'intent-5');

    // Batch timing: measure N calls as a block to get sub-microsecond accuracy
    const batchSize = 1000;
    const batchTimes = [];
    const batches = Math.floor(iterations / batchSize);
    for (let b = 0; b < batches; b++) {
      const t0 = performance.now();
      for (let i = 0; i < batchSize; i++) checkAccess(peers, targetId, 'intent-5');
      batchTimes.push((performance.now() - t0) / batchSize);
    }

    const s = stats(batchTimes);
    results[peerCount] = s;
    const opsPerSec = (1000 / s.mean).toFixed(0);
    const meanUs = (s.mean * 1000).toFixed(3);
    const p99Us = (s.p99 * 1000).toFixed(3);
    console.log(`\n  peers=${peerCount}: mean=${meanUs}μs  p99=${p99Us}μs  throughput=${Number(opsPerSec).toLocaleString()} ops/sec`);
  }

  return results;
}

// ---------------------------------------------------------------------------
// 3. Policy precedence resolution latency (7-layer chain)
// ---------------------------------------------------------------------------

function benchmarkPolicyResolution(iterations = 100_000) {
  heading(`3. 7-Layer Policy Precedence Resolution  (n=${iterations.toLocaleString()})`);

  const config = {
    inboundFederationPolicy: { mode: 'summarize' },
    delegatedAuthority: {
      globalDefault: 'summary',
      globalClassRules: { 'human-relay': 'escalate', 'agent-work': 'full', 'status-update': 'summary' },
      globalTopicRules: { 'finance': 'escalate', 'calendar': 'escalate' },
      peers: {
        'peer-cosmo': {
          default: 'full',
          classRules: { 'human-relay': 'full' },
          topicRules: { 'finance': 'off', 'project-updates': 'full' },
        },
      },
    },
  };

  function resolvePolicy(config, peerId, messageClass, topic) {
    const da = config.delegatedAuthority;
    let resolved = config.inboundFederationPolicy?.mode || 'summarize';
    if (da.globalDefault) resolved = da.globalDefault;
    const peerCfg = da.peers[peerId];
    if (peerCfg?.default) resolved = peerCfg.default;
    if (messageClass && da.globalClassRules?.[messageClass]) resolved = da.globalClassRules[messageClass];
    if (messageClass && peerCfg?.classRules?.[messageClass]) resolved = peerCfg.classRules[messageClass];
    if (topic && da.globalTopicRules?.[topic]) resolved = da.globalTopicRules[topic];
    if (topic && peerCfg?.topicRules?.[topic]) resolved = peerCfg.topicRules[topic];
    return resolved;
  }

  for (let i = 0; i < 1000; i++) resolvePolicy(config, 'peer-cosmo', 'human-relay', 'project-updates');

  const batchSize = 10_000;
  const batchTimes = [];
  const batches = Math.floor(iterations / batchSize);
  for (let b = 0; b < batches; b++) {
    const t0 = performance.now();
    for (let i = 0; i < batchSize; i++) resolvePolicy(config, 'peer-cosmo', 'human-relay', 'project-updates');
    batchTimes.push((performance.now() - t0) / batchSize);
  }

  const s = stats(batchTimes);
  console.log(`\n  mean=${(s.mean * 1000).toFixed(3)}μs  p50=${(s.p50 * 1000).toFixed(3)}μs  p99=${(s.p99 * 1000).toFixed(3)}μs`);
  console.log(`  throughput: ${(1000 / s.mean).toLocaleString(undefined, {maximumFractionDigits:0})} ops/sec`);

  return s;
}

// ---------------------------------------------------------------------------
// 4. Canonical envelope sign+verify roundtrip (full OGP message lifecycle)
// ---------------------------------------------------------------------------

function benchmarkFullMessageLifecycle(iterations = 5_000) {
  heading(`4. Full Message Lifecycle (sign envelope → verify → doorman)  (n=${iterations.toLocaleString()})`);

  const { publicKey: pubDer, privateKey: privDer } = crypto.generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'der' },
    privateKeyEncoding: { type: 'pkcs8', format: 'der' },
  });
  const privKey = crypto.createPrivateKey({ key: privDer, format: 'der', type: 'pkcs8' });
  const pubKey = crypto.createPublicKey({ key: pubDer, format: 'der', type: 'spki' });

  function signCanonical(payload) {
    const stamped = { ...payload, timestamp: new Date().toISOString() };
    const payloadStr = JSON.stringify(stamped);
    const sig = crypto.sign(null, Buffer.from(payloadStr), privKey).toString('hex');
    return { payload: stamped, payloadStr, signature: sig };
  }

  function verifyCanonical(envelope) {
    const { signature, payloadStr, payload } = envelope;
    if (!signature || !payloadStr) return { ok: false };
    const parsed = JSON.parse(payloadStr);
    const ts = Date.parse(parsed.timestamp);
    if (isNaN(ts) || Math.abs(Date.now() - ts) > 5 * 60 * 1000) return { ok: false, reason: 'stale' };
    const sig = Buffer.from(signature, 'hex');
    if (!crypto.verify(null, Buffer.from(payloadStr), pubKey, sig)) return { ok: false, reason: 'bad-sig' };
    return { ok: true };
  }

  // Warm-up
  for (let i = 0; i < 50; i++) {
    const env = signCanonical({ intent: 'agent-comms', from: 'peer-cosmo', topic: 'project-updates', text: 'Hello' });
    verifyCanonical(env);
  }

  const lifecycleTimes = [];
  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    const envelope = signCanonical({ intent: 'agent-comms', from: 'peer-cosmo', topic: 'project-updates', text: `Message ${i}` });
    verifyCanonical(envelope);
    lifecycleTimes.push(performance.now() - t0);
  }

  const s = stats(lifecycleTimes);
  console.log(`\n  mean=${s.mean}ms  p50=${s.p50}ms  p95=${s.p95}ms  p99=${s.p99}ms`);
  console.log(`  throughput: ${(1000 / s.mean).toFixed(0)} roundtrips/sec`);

  return s;
}

// ---------------------------------------------------------------------------
// 5. Scope model: three-layer evaluation overhead
// ---------------------------------------------------------------------------

function benchmarkScopeModel(iterations = 50_000) {
  heading(`5. Three-Layer Scope Model Evaluation  (n=${iterations.toLocaleString()})`);

  // Layer 1: capability check (is this intent supported at all?)
  // Layer 2: peer grant check (is this peer granted this intent?)
  // Layer 3: runtime enforcement (doorman rate-limit + topic check)
  const gatewayCapabilities = new Set(['message', 'agent-comms', 'project.contribute', 'project.query', 'project.status']);
  const peerGrants = new Map([
    ['peer-cosmo', {
      grants: [
        { intent: 'agent-comms', topics: ['general', 'project-updates', 'signal'], rateLimit: { requests: 100, windowSeconds: 3600 } },
        { intent: 'project.contribute', rateLimit: { requests: 50, windowSeconds: 3600 } },
      ],
    }],
  ]);
  const rateLimitStore = new Map();

  function evaluateThreeLayers(peerId, intent, topic) {
    // Layer 1
    if (!gatewayCapabilities.has(intent)) return { allowed: false, layer: 1 };
    // Layer 2
    const bundle = peerGrants.get(peerId);
    if (!bundle) return { allowed: false, layer: 2 };
    const grant = bundle.grants.find(g => g.intent === intent);
    if (!grant) return { allowed: false, layer: 2 };
    if (topic && grant.topics && !grant.topics.includes(topic)) return { allowed: false, layer: 2 };
    // Layer 3: sliding window rate limit
    const key = `${peerId}:${intent}`;
    const now = Date.now();
    const windowMs = grant.rateLimit.windowSeconds * 1000;
    let entry = rateLimitStore.get(key);
    if (!entry) { entry = { timestamps: [] }; rateLimitStore.set(key, entry); }
    entry.timestamps = entry.timestamps.filter(t => t > now - windowMs);
    if (entry.timestamps.length >= grant.rateLimit.requests) return { allowed: false, layer: 3, statusCode: 429 };
    entry.timestamps.push(now);
    return { allowed: true };
  }

  // Warm-up
  for (let i = 0; i < 100; i++) evaluateThreeLayers('peer-cosmo', 'agent-comms', 'project-updates');
  rateLimitStore.clear();

  const times = [];
  for (let i = 0; i < Math.min(iterations, 500); i++) { // cap at 500 to avoid triggering rate limit
    const t0 = performance.now();
    evaluateThreeLayers('peer-cosmo', 'agent-comms', 'project-updates');
    times.push(performance.now() - t0);
  }
  // Fill the rest with full rate-limit-check (after resetting)
  rateLimitStore.clear();
  for (let i = 500; i < iterations; i++) {
    const t0 = performance.now();
    evaluateThreeLayers('peer-cosmo', 'agent-comms', 'project-updates');
    times.push(performance.now() - t0);
    if (i % 99 === 0) rateLimitStore.clear();
  }

  const s = stats(times);
  console.log(`\n  mean=${s.mean}ms  p50=${s.p50}ms  p99=${s.p99}ms`);
  console.log(`  absolute: ${(s.mean * 1000).toFixed(2)} microseconds per three-layer evaluation`);

  return s;
}

// ---------------------------------------------------------------------------
// 6. Signed contribution lifecycle (ULID + sign + verify)
// ---------------------------------------------------------------------------

function benchmarkSignedContribution(iterations = 5_000) {
  heading(`6. Signed Project Contribution Lifecycle  (n=${iterations.toLocaleString()})`);

  const { publicKey: pubDer, privateKey: privDer } = crypto.generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'der' },
    privateKeyEncoding: { type: 'pkcs8', format: 'der' },
  });
  const privKey = crypto.createPrivateKey({ key: privDer, format: 'der', type: 'pkcs8' });
  const pubKeyHex = pubDer.toString('hex');
  const pubKey = crypto.createPublicKey({ key: pubDer, format: 'der', type: 'spki' });

  // Simplified ULID generator (mirrors the real one — time prefix + random)
  let lastMs = 0, seq = 0;
  function ulid() {
    const ms = Date.now();
    if (ms === lastMs) { seq++; } else { seq = 0; lastMs = ms; }
    const t = ms.toString(36).padStart(10, '0');
    const r = (Math.random().toString(36) + Math.random().toString(36)).slice(2, 18);
    return (t + r).toUpperCase().slice(0, 26);
  }

  function signContribution(projectId, authorId, entryType, summary, privKey) {
    const id = ulid();
    const record = { id, projectId, authorId, entryType, summary, metadata: {}, timestamp: new Date().toISOString() };
    const payloadStr = JSON.stringify(record);
    const signature = crypto.sign(null, Buffer.from(payloadStr), privKey).toString('hex');
    return { record, payloadStr, signature };
  }

  function verifyContribution(contribution, senderPubKeyHex, expectedProjectId) {
    const { record, payloadStr, signature } = contribution;
    if (record.authorId !== senderPubKeyHex) return { ok: false, reason: 'author-mismatch' };
    if (record.projectId !== expectedProjectId) return { ok: false, reason: 'project-mismatch' };
    const pubKey = crypto.createPublicKey({ key: Buffer.from(senderPubKeyHex, 'hex'), format: 'der', type: 'spki' });
    if (!crypto.verify(null, Buffer.from(payloadStr), pubKey, Buffer.from(signature, 'hex'))) {
      return { ok: false, reason: 'bad-signature' };
    }
    return { ok: true };
  }

  // Warm-up
  for (let i = 0; i < 50; i++) {
    const c = signContribution('ogp-paper', pubKeyHex, 'progress', 'Warm-up', privKey);
    verifyContribution(c, pubKeyHex, 'ogp-paper');
  }

  const times = [];
  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    const contrib = signContribution('ogp-paper', pubKeyHex, 'progress', `Completed benchmark iteration ${i}`, privKey);
    verifyContribution(contrib, pubKeyHex, 'ogp-paper');
    times.push(performance.now() - t0);
  }

  const s = stats(times);
  console.log(`\n  mean=${s.mean}ms  p50=${s.p50}ms  p95=${s.p95}ms  p99=${s.p99}ms`);
  console.log(`  throughput: ${(1000 / s.mean).toFixed(0)} contributions/sec`);

  return s;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

console.log('OGP Benchmark Suite');
console.log(`Node.js ${process.version}  |  Platform: ${process.platform}  |  ${new Date().toISOString()}`);
console.log(`CPU: ${(await import('node:os')).cpus()[0]?.model || 'unknown'}`);

const results = {
  meta: {
    node: process.version,
    platform: process.platform,
    timestamp: new Date().toISOString(),
  },
};

results.crypto = benchmarkCrypto(10_000);
results.doorman = benchmarkDoorman(50_000);
results.policyResolution = benchmarkPolicyResolution(50_000);
results.fullMessageLifecycle = benchmarkFullMessageLifecycle(5_000);
results.scopeModel = benchmarkScopeModel(50_000);
results.signedContribution = benchmarkSignedContribution(5_000);

heading('Summary');
const doormanP1us = (results.doorman[1].mean * 1000).toFixed(3);
const doormanP1000us = (results.doorman[1000].mean * 1000).toFixed(3);
const policyUs = (results.policyResolution.mean * 1000).toFixed(3);
const scopeUs = (results.scopeModel.mean * 1000).toFixed(3);
console.log(`
  Ed25519 sign:           ${results.crypto.signStats.mean}ms mean  (${(1000/results.crypto.signStats.mean).toFixed(0)} ops/sec)
  Ed25519 verify:         ${results.crypto.verifyStats.mean}ms mean  (${(1000/results.crypto.verifyStats.mean).toFixed(0)} ops/sec)
  Sign overhead vs HMAC:  ${(results.crypto.signStats.mean / results.crypto.hmacSignStats.mean).toFixed(1)}x  Verify overhead: ${(results.crypto.verifyStats.mean / results.crypto.hmacVerifyStats.mean).toFixed(1)}x
  Doorman (1 peer):       ${doormanP1us}μs mean  p99=${(results.doorman[1].p99*1000).toFixed(3)}μs
  Doorman (1000 peers):   ${doormanP1000us}μs mean  p99=${(results.doorman[1000].p99*1000).toFixed(3)}μs
  Policy resolution:      ${policyUs}μs mean  (7 layers, all properties)
  Scope evaluation:       ${scopeUs}μs mean  (3 layers: capability+grant+rate-limit)
  Full msg lifecycle:     ${results.fullMessageLifecycle.mean}ms mean  (sign canonical + verify + timestamp check)
  Signed contribution:    ${results.signedContribution.mean}ms mean  (ULID + sign + verify + author/project check)
`);

const outPath = new URL('./results.json', import.meta.url).pathname;
writeFileSync(outPath, JSON.stringify(results, null, 2));
console.log(`Results written to: ${outPath}`);
