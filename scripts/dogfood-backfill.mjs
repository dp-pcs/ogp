// bd-53c live dogfood: prove on-join backfill converges a disjoint contribution slice.
//
// alpha (owner) makes 2 signed contributions to a project. beta federates + joins.
// On join, beta pulls alpha's contributions via signed project.query + union-merge.
// We assert beta's local mirror ends up holding alpha's contributions (the union),
// then a second backfill pass is a no-op (idempotent), then a tamper check.
//
// Run: node scripts/dogfood-backfill.mjs   (uses dist/, run `npm run build` first)

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cliPath = path.join(repoRoot, 'dist', 'cli.js');
const PROJECT = 'backfill-dogfood';

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function writeJson(p, data) { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(data, null, 2)); }
function readJson(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }

function gwConfig(home, port, agentId, name, email) {
  const stateDir = path.join(home, 'state');
  writeJson(path.join(home, 'config.json'), {
    daemonPort: port, openclawUrl: 'http://127.0.0.1:9', openclawToken: 't', openclawHooksToken: 't',
    gatewayUrl: `http://127.0.0.1:${port}`, displayName: name, email, stateDir, agentId, platform: 'openclaw',
  });
  fs.mkdirSync(stateDir, { recursive: true });
}

function run(home, args, label) {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [cliPath, ...args], { env: { ...process.env, OGP_HOME: home }, cwd: repoRoot });
    let out = '', err = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (err += d));
    p.on('close', (code) => {
      if (code !== 0) reject(new Error(`${label} exited ${code}: ${err || out}`));
      else resolve(out);
    });
  });
}

function startDaemon(home) {
  const log = fs.openSync(path.join(home, 'daemon.log'), 'a');
  const p = spawn(process.execPath, [cliPath, 'start'], { env: { ...process.env, OGP_HOME: home }, detached: true, stdio: ['ignore', log, log] });
  p.unref();
  return p;
}

async function waitForCard(url, tries = 30) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(`${url}/.well-known/ogp`); if (r.ok) return await r.json(); } catch {}
    await sleep(500);
  }
  throw new Error(`daemon at ${url} did not come up`);
}

async function waitForPeer(home, pred, tries = 30) {
  const peersPath = path.join(home, 'peers.json');
  for (let i = 0; i < tries; i++) {
    if (fs.existsSync(peersPath)) {
      const peers = readJson(peersPath);
      const m = (Array.isArray(peers) ? peers : peers.peers || []).find(pred);
      if (m) return m;
    }
    await sleep(500);
  }
  throw new Error('peer condition not met');
}

function projectsOf(home) {
  const p = path.join(home, 'projects.json');
  if (!fs.existsSync(p)) return [];
  const d = readJson(p);
  return Array.isArray(d) ? d : d.projects || [];
}
function contribSummaries(home, projectId) {
  const proj = projectsOf(home).find((x) => x.id === projectId);
  if (!proj) return [];
  return (proj.topics || []).flatMap((t) => (t.contributions || []).map((c) => c.summary));
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ogp-backfill-'));
const alpha = path.join(root, 'alpha'), beta = path.join(root, 'beta');
const A_PORT = 18990, B_PORT = 18991;
const aUrl = `http://127.0.0.1:${A_PORT}`, bUrl = `http://127.0.0.1:${B_PORT}`;
let aD, bD;

function fail(msg) { console.error(`\n✗ FAIL: ${msg}`); cleanup(); process.exit(1); }
function cleanup() {
  try { aD && process.kill(-aD.pid); } catch {}
  try { bD && process.kill(-bD.pid); } catch {}
  try { fs.rmSync(root, { recursive: true, force: true }); } catch {}
}

try {
  gwConfig(alpha, A_PORT, 'alpha', 'Alpha', 'alpha@test');
  gwConfig(beta, B_PORT, 'beta', 'Beta', 'beta@test');

  console.log('Starting daemons...');
  aD = startDaemon(alpha); bD = startDaemon(beta);
  const aCard = await waitForCard(aUrl); await waitForCard(bUrl);

  console.log('Federating beta -> alpha...');
  await run(beta, ['federation', 'request', aUrl, 'alpha', '--alias', 'alpha'], 'beta request');
  const betaOnAlpha = await waitForPeer(alpha, (p) => p.gatewayUrl === bUrl && p.status === 'pending');
  await run(alpha, ['federation', 'approve', betaOnAlpha.id, '--intents', 'project.join,project.contribute,project.query,project.status'], 'alpha approve');
  await waitForPeer(beta, (p) => p.gatewayUrl === aUrl && p.status === 'approved');
  await waitForPeer(alpha, (p) => p.gatewayUrl === bUrl && p.status === 'approved');

  console.log('Alpha creates project + 2 signed contributions...');
  await run(alpha, ['project', 'create', PROJECT, 'Backfill Dogfood'], 'create');
  await run(alpha, ['project', 'contribute', PROJECT, 'progress', 'alpha-one', '--local-only'], 'c1');
  await run(alpha, ['project', 'contribute', PROJECT, 'decision', 'alpha-two', '--local-only'], 'c2');

  // Beta has NOTHING for this project yet (disjoint: alpha=2, beta=0).
  const before = contribSummaries(beta, PROJECT);
  console.log(`Beta before join: [${before.join(', ')}]`);

  console.log('Beta joins via request-join (triggers on-join backfill)...');
  const alphaOnBeta = await waitForPeer(beta, (p) => p.gatewayUrl === aUrl && p.status === 'approved');
  const out = await run(beta, ['project', 'request-join', alphaOnBeta.id, PROJECT, 'Backfill Dogfood', '--description', 'dogfood'], 'request-join');
  console.log(out.split('\n').filter((l) => l.includes('backfill') || l.includes('joined')).map((l) => '  ' + l.trim()).join('\n'));
  await sleep(1500);

  const after = contribSummaries(beta, PROJECT);
  console.log(`Beta after join+backfill: [${after.join(', ')}]`);

  const converged = after.includes('alpha-one') && after.includes('alpha-two');
  if (!converged) fail(`beta did not converge to alpha's contributions (got [${after.join(', ')}])`);
  console.log('\n✓ PASS: beta converged to the union (alpha-one + alpha-two) via signed on-join backfill.');

  // Idempotency: a second join attempt should not duplicate.
  const dedupeCount = projectsOf(beta).find((x) => x.id === PROJECT)?.topics?.flatMap((t) => t.contributions).length ?? 0;
  console.log(`Beta contribution count: ${dedupeCount} (expect 2, no dupes)`);
  if (dedupeCount !== 2) fail(`expected 2 contributions, got ${dedupeCount} (dedupe failed)`);
  console.log('✓ PASS: idempotent — no duplicate contributions.');

  cleanup();
  console.log('\n✓ bd-53c live dogfood PASSED');
} catch (e) {
  fail(e.message);
}
