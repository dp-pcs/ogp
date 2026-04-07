#!/usr/bin/env node
// Ed25519 performance benchmark for patent filing
// Tests sign/verify operations and throughput

import { generateKeyPair, sign, verify } from './dist/shared/signing.js';

const ITERATIONS = 10000;
const TEST_MESSAGE = JSON.stringify({
  intent: 'agent-comms',
  payload: { content: 'Test message for performance benchmark' },
  timestamp: new Date().toISOString()
});

console.log('=== Ed25519 Performance Benchmark ===\n');

// Generate test keypair
console.log('Generating Ed25519 keypair...');
const keypairStart = performance.now();
const keypair = generateKeyPair();
const keypairEnd = performance.now();
console.log(`Keypair generation: ${(keypairEnd - keypairStart).toFixed(2)}ms`);
console.log(`Public key (first 16 chars): ${keypair.publicKey.slice(0, 16)}...`);

// Benchmark signing
console.log(`\nBenchmarking ${ITERATIONS} sign operations...`);
const signStart = performance.now();
const signatures = [];

for (let i = 0; i < ITERATIONS; i++) {
  const sig = sign(TEST_MESSAGE, keypair.privateKey);
  signatures.push(sig);
}

const signEnd = performance.now();
const signDuration = signEnd - signStart;
const signOpsPerSec = (ITERATIONS / (signDuration / 1000)).toFixed(0);
const signAvgMs = (signDuration / ITERATIONS).toFixed(3);

console.log(`Total time: ${signDuration.toFixed(2)}ms`);
console.log(`Operations/second: ${signOpsPerSec}`);
console.log(`Average per operation: ${signAvgMs}ms`);

// Benchmark verification
console.log(`\nBenchmarking ${ITERATIONS} verify operations...`);
const verifyStart = performance.now();
let verifyCount = 0;

for (let i = 0; i < ITERATIONS; i++) {
  const valid = verify(TEST_MESSAGE, signatures[i], keypair.publicKey);
  if (valid) verifyCount++;
}

const verifyEnd = performance.now();
const verifyDuration = verifyEnd - verifyStart;
const verifyOpsPerSec = (ITERATIONS / (verifyDuration / 1000)).toFixed(0);
const verifyAvgMs = (verifyDuration / ITERATIONS).toFixed(3);

console.log(`Total time: ${verifyDuration.toFixed(2)}ms`);
console.log(`Operations/second: ${verifyOpsPerSec}`);
console.log(`Average per operation: ${verifyAvgMs}ms`);
console.log(`Verified: ${verifyCount}/${ITERATIONS}`);

// Combined benchmark (sign + verify)
console.log(`\nBenchmarking ${ITERATIONS} sign+verify operations...`);
const combinedStart = performance.now();

for (let i = 0; i < ITERATIONS; i++) {
  const sig = sign(TEST_MESSAGE, keypair.privateKey);
  const valid = verify(TEST_MESSAGE, sig, keypair.publicKey);
}

const combinedEnd = performance.now();
const combinedDuration = combinedEnd - combinedStart;
const combinedOpsPerSec = (ITERATIONS / (combinedDuration / 1000)).toFixed(0);
const combinedAvgMs = (combinedDuration / ITERATIONS).toFixed(3);

console.log(`Total time: ${combinedDuration.toFixed(2)}ms`);
console.log(`Operations/second: ${combinedOpsPerSec}`);
console.log(`Average per sign+verify: ${combinedAvgMs}ms`);

// Summary
console.log('\n=== SUMMARY ===');
console.log(`Sign average: ${signAvgMs}ms (<0.5ms claim: ${parseFloat(signAvgMs) < 0.5 ? '✅ VALID' : '❌ FAIL'})`);
console.log(`Verify average: ${verifyAvgMs}ms (<0.5ms claim: ${parseFloat(verifyAvgMs) < 0.5 ? '✅ VALID' : '❌ FAIL'})`);
console.log(`Sign+Verify average: ${combinedAvgMs}ms (<1ms claim: ${parseFloat(combinedAvgMs) < 1.0 ? '✅ VALID' : '❌ FAIL'})`);
console.log(`Throughput: ${combinedOpsPerSec} ops/sec (1000 req/sec claim: ${parseInt(combinedOpsPerSec) >= 1000 ? '✅ VALID' : '❌ FAIL'})`);

console.log('\n=== Patent Filing Metrics ===');
console.log(`- Ed25519 sign: ${signAvgMs}ms (claimed <0.5ms)`);
console.log(`- Ed25519 verify: ${verifyAvgMs}ms (claimed <0.5ms)`);
console.log(`- Federation overhead: ${combinedAvgMs}ms (claimed <1ms)`);
console.log(`- Max throughput: ${combinedOpsPerSec} req/sec (claimed 1000 req/sec)`);

// Output JSON for documentation
console.log('\n=== JSON Output ===');
const results = {
  algorithm: 'Ed25519',
  iterations: ITERATIONS,
  signAvgMs: parseFloat(signAvgMs),
  verifyAvgMs: parseFloat(verifyAvgMs),
  combinedAvgMs: parseFloat(combinedAvgMs),
  opsPerSecond: parseInt(combinedOpsPerSec),
  claims: {
    signUnder0_5ms: parseFloat(signAvgMs) < 0.5,
    verifyUnder0_5ms: parseFloat(verifyAvgMs) < 0.5,
    combinedUnder1ms: parseFloat(combinedAvgMs) < 1.0,
    throughputOver1000: parseInt(combinedOpsPerSec) >= 1000
  },
  hardware: 'MacBook Pro M4 (determine actual hardware)',
  timestamp: new Date().toISOString()
};
console.log(JSON.stringify(results, null, 2));
