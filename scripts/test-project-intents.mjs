#!/usr/bin/env node

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const cliPath = path.join(repoRoot, 'dist', 'cli.js');

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function parseArgs(argv) {
  const args = {
    root: path.join(repoRoot, '.tmp', 'project-intent-test', timestamp()),
    projectId: 'project-intent-smoke',
    projectName: 'Project Intent Smoke Test',
    skipBuild: false,
    keepState: false,
    ports: {
      alpha: 18890,
      beta: 18891
    }
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case '--root':
        args.root = path.resolve(argv[++i]);
        break;
      case '--project-id':
        args.projectId = argv[++i];
        break;
      case '--project-name':
        args.projectName = argv[++i];
        break;
      case '--alpha-port':
        args.ports.alpha = Number.parseInt(argv[++i], 10);
        break;
      case '--beta-port':
        args.ports.beta = Number.parseInt(argv[++i], 10);
        break;
      case '--skip-build':
        args.skipBuild = true;
        break;
      case '--keep-state':
        args.keepState = true;
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!Number.isInteger(args.ports.alpha) || !Number.isInteger(args.ports.beta)) {
    throw new Error('Ports must be integers');
  }

  if (args.ports.alpha === args.ports.beta) {
    throw new Error('Alpha and beta ports must differ');
  }

  return args;
}

function printHelp() {
  console.log(`Project-intent end-to-end harness

Usage:
  node scripts/test-project-intents.mjs [options]

Options:
  --root <dir>            State root (default: repo-local .tmp directory)
  --project-id <id>       Project ID to use
  --project-name <name>   Project name to use
  --alpha-port <port>     Alpha daemon port (default: 18890)
  --beta-port <port>      Beta daemon port (default: 18891)
  --skip-build            Skip npm run build
  --keep-state            Keep test state/logs after success
`);
}

function logSection(title) {
  console.log(`\n=== ${title} ===`);
}

function formatShellCommand(command, args = [], envAdditions = {}) {
  const envPrefix = Object.entries(envAdditions)
    .map(([key, value]) => `${key}=${shellQuote(String(value))}`)
    .join(' ');
  const parts = [command, ...args].map(shellQuote);
  return [envPrefix, ...parts].filter(Boolean).join(' ');
}

function shellQuote(value) {
  if (/^[A-Za-z0-9_./:@=-]+$/.test(value)) {
    return value;
  }
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

async function ensureDir(dir) {
  await fsp.mkdir(dir, { recursive: true });
}

async function writeJson(filePath, data) {
  await ensureDir(path.dirname(filePath));
  await fsp.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

async function readJson(filePath) {
  const raw = await fsp.readFile(filePath, 'utf-8');
  return JSON.parse(raw);
}

function getPeersPath(home) {
  return path.join(home, 'peers.json');
}

function getProjectsPath(home) {
  return path.join(home, 'projects.json');
}

function getConfigPath(home) {
  return path.join(home, 'config.json');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function runCommand(command, args, options = {}) {
  const {
    cwd = repoRoot,
    env = process.env,
    expectCode = 0,
    label
  } = options;

  const printable = formatShellCommand(command, args, options.envAdditions || {});
  console.log(`$ ${printable}`);

  const child = spawn(command, args, {
    cwd,
    env,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let stdout = '';
  let stderr = '';

  child.stdout.on('data', (chunk) => {
    stdout += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  const code = await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('close', resolve);
  });

  if (stdout.trim()) {
    console.log(stdout.trimEnd());
  }
  if (stderr.trim()) {
    console.error(stderr.trimEnd());
  }

  if (code !== expectCode) {
    throw new Error(
      `${label || command} exited with code ${code}; expected ${expectCode}`
    );
  }

  return { code, stdout, stderr };
}

function startDaemon(home, name, logsDir) {
  const env = {
    ...process.env,
    OGP_HOME: home
  };

  const stdoutLog = fs.createWriteStream(path.join(logsDir, `${name}.stdout.log`), { flags: 'a' });
  const stderrLog = fs.createWriteStream(path.join(logsDir, `${name}.stderr.log`), { flags: 'a' });

  const printable = formatShellCommand(process.execPath, [cliPath, 'start'], { OGP_HOME: home });
  console.log(`$ ${printable}`);

  const child = spawn(process.execPath, [cliPath, 'start'], {
    cwd: repoRoot,
    env,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let stdout = '';
  let stderr = '';

  child.stdout.on('data', (chunk) => {
    const text = chunk.toString();
    stdout += text;
    stdoutLog.write(text);
  });
  child.stderr.on('data', (chunk) => {
    const text = chunk.toString();
    stderr += text;
    stderrLog.write(text);
  });

  return {
    child,
    home,
    name,
    getStdout: () => stdout,
    getStderr: () => stderr,
    closeLogs: () => {
      stdoutLog.end();
      stderrLog.end();
    }
  };
}

async function stopDaemon(daemon) {
  if (!daemon?.child || daemon.child.exitCode !== null) {
    daemon?.closeLogs?.();
    return;
  }

  daemon.child.kill('SIGINT');
  await Promise.race([
    new Promise((resolve) => daemon.child.once('close', resolve)),
    sleep(5000).then(() => {
      daemon.child.kill('SIGKILL');
    })
  ]);
  daemon.closeLogs();
}

async function waitForJson(url, daemon, timeoutMs = 15000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (daemon?.child?.exitCode !== null) {
      throw new Error(`${daemon.name} daemon exited early.\nstdout:\n${daemon.getStdout()}\nstderr:\n${daemon.getStderr()}`);
    }

    try {
      const response = await fetch(url);
      if (response.ok) {
        return response.json();
      }
    } catch {
      // Wait and retry while the daemon comes up.
    }
    await sleep(250);
  }

  throw new Error(`Timed out waiting for ${url}`);
}

async function waitForPeer(home, predicate, timeoutMs = 10000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (fs.existsSync(getPeersPath(home))) {
      const peers = await readJson(getPeersPath(home));
      const match = peers.find(predicate);
      if (match) {
        return match;
      }
    }
    await sleep(200);
  }
  throw new Error(`Timed out waiting for peer in ${home}`);
}

async function waitForProject(home, projectId, timeoutMs = 10000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (fs.existsSync(getProjectsPath(home))) {
      const projects = await readJson(getProjectsPath(home));
      const match = projects.find((project) => project.id === projectId);
      if (match) {
        return match;
      }
    }
    await sleep(200);
  }
  throw new Error(`Timed out waiting for project ${projectId} in ${home}`);
}

async function createGatewayConfig(home, gateway) {
  const config = {
    daemonPort: gateway.port,
    openclawUrl: 'http://127.0.0.1:9',
    openclawToken: 'test-token',
    openclawHooksToken: 'test-hooks',
    gatewayUrl: gateway.url,
    displayName: gateway.displayName,
    email: gateway.email,
    stateDir: path.join(home, 'state'),
    agentId: gateway.agentId,
    platform: 'openclaw'
  };

  await ensureDir(home);
  await ensureDir(config.stateDir);
  await writeJson(getConfigPath(home), config);
}

function getContributionSummaries(project) {
  return (project.topics || []).flatMap((topic) =>
    (topic.contributions || []).map((contribution) => contribution.summary)
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const runRoot = args.root;
  const logsDir = path.join(runRoot, 'logs');
  const alphaHome = path.join(runRoot, 'alpha');
  const betaHome = path.join(runRoot, 'beta');

  const alpha = {
    home: alphaHome,
    displayName: 'Alpha Test Gateway',
    email: 'alpha@example.test',
    agentId: 'alpha',
    port: args.ports.alpha,
    url: `http://127.0.0.1:${args.ports.alpha}`
  };

  const beta = {
    home: betaHome,
    displayName: 'Beta Test Gateway',
    email: 'beta@example.test',
    agentId: 'beta',
    port: args.ports.beta,
    url: `http://127.0.0.1:${args.ports.beta}`
  };

  let alphaDaemon;
  let betaDaemon;

  await ensureDir(logsDir);
  await createGatewayConfig(alpha.home, alpha);
  await createGatewayConfig(beta.home, beta);

  try {
    logSection('Build');
    if (!args.skipBuild) {
      await runCommand('npm', ['run', 'build'], { cwd: repoRoot, label: 'build' });
    } else {
      console.log('Skipping build because --skip-build was provided.');
    }

    assert(fs.existsSync(cliPath), `CLI build artifact not found: ${cliPath}`);

    logSection('Start Local Gateways');
    alphaDaemon = startDaemon(alpha.home, 'alpha', logsDir);
    betaDaemon = startDaemon(beta.home, 'beta', logsDir);

    const alphaCard = await waitForJson(`${alpha.url}/.well-known/ogp`, alphaDaemon);
    const betaCard = await waitForJson(`${beta.url}/.well-known/ogp`, betaDaemon);
    const betaRuntimeSenderId = betaCard.publicKey.substring(0, 32);

    console.log(`Alpha online: ${alphaCard.displayName} (${alpha.url})`);
    console.log(`Beta online:  ${betaCard.displayName} (${beta.url})`);

    logSection('Federate Alpha -> Beta');
    await runCommand(
      process.execPath,
      [cliPath, 'federation', 'request', beta.url, 'beta-local', '--alias', 'beta-local'],
      {
        cwd: repoRoot,
        env: { ...process.env, OGP_HOME: alpha.home },
        envAdditions: { OGP_HOME: alpha.home },
        label: 'alpha federation request'
      }
    );

    const alphaPeerOnBeta = await waitForPeer(
      beta.home,
      (peer) => peer.gatewayUrl === alpha.url && peer.status === 'pending'
    );

    await runCommand(
      process.execPath,
      [
        cliPath,
        'federation',
        'approve',
        alphaPeerOnBeta.id,
        '--intents',
        'message,agent-comms,project.join,project.contribute,project.query,project.status'
      ],
      {
        cwd: repoRoot,
        env: { ...process.env, OGP_HOME: beta.home },
        envAdditions: { OGP_HOME: beta.home },
        label: 'beta federation approve'
      }
    );

    const betaPeerOnAlpha = await waitForPeer(
      alpha.home,
      (peer) => peer.gatewayUrl === beta.url && peer.status === 'approved'
    );
    const refreshedAlphaPeerOnBeta = await waitForPeer(
      beta.home,
      (peer) => peer.gatewayUrl === alpha.url && peer.status === 'approved'
    );

    console.log(`Alpha sees beta as approved peer: ${betaPeerOnAlpha.id}`);
    console.log(`Beta sees alpha as approved peer: ${refreshedAlphaPeerOnBeta.id}`);

    logSection('Owner-Side Local Project Smoke');
    await runCommand(
      process.execPath,
      [cliPath, 'project', 'create', args.projectId, args.projectName, '--description', 'Project-intent test harness'],
      {
        cwd: repoRoot,
        env: { ...process.env, OGP_HOME: alpha.home },
        envAdditions: { OGP_HOME: alpha.home },
        label: 'alpha project create'
      }
    );

    await runCommand(
      process.execPath,
      [
        cliPath,
        'project',
        'contribute',
        args.projectId,
        'progress',
        'Alpha created the test project',
        '--metadata',
        JSON.stringify({ stage: 'owner-local-smoke' }),
        '--local-only'
      ],
      {
        cwd: repoRoot,
        env: { ...process.env, OGP_HOME: alpha.home },
        envAdditions: { OGP_HOME: alpha.home },
        label: 'alpha local contribution'
      }
    );

    const alphaProjectAfterLocal = await waitForProject(alpha.home, args.projectId);
    assert(
      getContributionSummaries(alphaProjectAfterLocal).includes('Alpha created the test project'),
      'Alpha local contribution did not persist'
    );

    logSection('Membership Isolation Before Join');
    await runCommand(
      process.execPath,
      [cliPath, 'project', 'query-peer', refreshedAlphaPeerOnBeta.id, args.projectId, '--limit', '5'],
      {
        cwd: repoRoot,
        env: { ...process.env, OGP_HOME: beta.home },
        envAdditions: { OGP_HOME: beta.home },
        expectCode: 1,
        label: 'beta pre-join query-peer'
      }
    );

    logSection('Join Flow');
    await runCommand(
      process.execPath,
      [
        cliPath,
        'project',
        'request-join',
        refreshedAlphaPeerOnBeta.id,
        args.projectId,
        args.projectName,
        '--description',
        'Joined through local harness'
      ],
      {
        cwd: repoRoot,
        env: { ...process.env, OGP_HOME: beta.home },
        envAdditions: { OGP_HOME: beta.home },
        label: 'beta request-join'
      }
    );

    const alphaProjectAfterJoin = await waitForProject(alpha.home, args.projectId);
    const betaProjectAfterJoin = await waitForProject(beta.home, args.projectId);

    assert(
      alphaProjectAfterJoin.members.includes(betaRuntimeSenderId),
      'Alpha project did not record beta using its runtime sender identity'
    );
    assert(
      betaProjectAfterJoin.members.includes(beta.email),
      'Beta local project did not record beta email as a local member'
    );

    logSection('Remote Contribution And Query');
    await runCommand(
      process.execPath,
      [
        cliPath,
        'project',
        'send-contribution',
        refreshedAlphaPeerOnBeta.id,
        args.projectId,
        'decision',
        'Beta confirmed remote contribution path',
        '--metadata',
        JSON.stringify({ source: 'beta', assertion: 'remote-send' })
      ],
      {
        cwd: repoRoot,
        env: { ...process.env, OGP_HOME: beta.home },
        envAdditions: { OGP_HOME: beta.home },
        label: 'beta send-contribution'
      }
    );

    const alphaProjectAfterRemoteContribution = await waitForProject(alpha.home, args.projectId);
    assert(
      getContributionSummaries(alphaProjectAfterRemoteContribution).includes('Beta confirmed remote contribution path'),
      'Alpha project did not receive beta contribution'
    );

    await runCommand(
      process.execPath,
      [cliPath, 'project', 'query-peer', refreshedAlphaPeerOnBeta.id, args.projectId, '--limit', '10'],
      {
        cwd: repoRoot,
        env: { ...process.env, OGP_HOME: beta.home },
        envAdditions: { OGP_HOME: beta.home },
        label: 'beta query-peer post-join'
      }
    );

    logSection('Status Request Path');
    await runCommand(
      process.execPath,
      [cliPath, 'project', 'status-peer', refreshedAlphaPeerOnBeta.id, args.projectId],
      {
        cwd: repoRoot,
        env: { ...process.env, OGP_HOME: beta.home },
        envAdditions: { OGP_HOME: beta.home },
        label: 'beta status-peer'
      }
    );

    logSection('Validation Summary');
    console.log('Validated:');
    console.log('- Two isolated local gateways booted with separate OGP_HOME directories.');
    console.log('- Federation request + approval completed.');
    console.log('- Local owner project creation and contribution persisted.');
    console.log('- Pre-join project query was denied as expected.');
    console.log('- Remote project join succeeded.');
    console.log('- Remote contribution arrived on the owner gateway.');
    console.log('- Remote query succeeded after membership was granted.');
    console.log('- Remote status request path completed without transport failure.');

    console.log('\nManual replay commands:');
    console.log(formatShellCommand(process.execPath, [cliPath, 'federation', 'request', beta.url, 'beta-local', '--alias', 'beta-local'], { OGP_HOME: alpha.home }));
    console.log(formatShellCommand(process.execPath, [cliPath, 'federation', 'approve', alphaPeerOnBeta.id, '--intents', 'message,agent-comms,project.join,project.contribute,project.query,project.status'], { OGP_HOME: beta.home }));
    console.log(formatShellCommand(process.execPath, [cliPath, 'project', 'create', args.projectId, args.projectName, '--description', 'Project-intent test harness'], { OGP_HOME: alpha.home }));
    console.log(formatShellCommand(process.execPath, [cliPath, 'project', 'contribute', args.projectId, 'progress', 'Alpha created the test project', '--metadata', JSON.stringify({ stage: 'owner-local-smoke' }), '--local-only'], { OGP_HOME: alpha.home }));
    console.log(formatShellCommand(process.execPath, [cliPath, 'project', 'request-join', refreshedAlphaPeerOnBeta.id, args.projectId, args.projectName, '--description', 'Joined through local harness'], { OGP_HOME: beta.home }));
    console.log(formatShellCommand(process.execPath, [cliPath, 'project', 'send-contribution', refreshedAlphaPeerOnBeta.id, args.projectId, 'decision', 'Beta confirmed remote contribution path', '--metadata', JSON.stringify({ source: 'beta', assertion: 'remote-send' })], { OGP_HOME: beta.home }));
    console.log(formatShellCommand(process.execPath, [cliPath, 'project', 'query-peer', refreshedAlphaPeerOnBeta.id, args.projectId, '--limit', '10'], { OGP_HOME: beta.home }));
    console.log(formatShellCommand(process.execPath, [cliPath, 'project', 'status-peer', refreshedAlphaPeerOnBeta.id, args.projectId], { OGP_HOME: beta.home }));

    console.log(`\nState root: ${runRoot}`);
    console.log(`Alpha logs: ${path.join(logsDir, 'alpha.stdout.log')} / ${path.join(logsDir, 'alpha.stderr.log')}`);
    console.log(`Beta logs:  ${path.join(logsDir, 'beta.stdout.log')} / ${path.join(logsDir, 'beta.stderr.log')}`);

    if (!args.keepState) {
      await stopDaemon(alphaDaemon);
      await stopDaemon(betaDaemon);
      await fsp.rm(runRoot, { recursive: true, force: true });
      console.log('\nCleaned up temporary state. Re-run with --keep-state to inspect files.');
      return;
    }

    await stopDaemon(alphaDaemon);
    await stopDaemon(betaDaemon);
    console.log('\nKept state on disk because --keep-state was provided.');
  } catch (error) {
    console.error(`\nProject-intent harness failed: ${error instanceof Error ? error.message : String(error)}`);
    console.error(`State root retained at: ${runRoot}`);
    process.exitCode = 1;
  } finally {
    await stopDaemon(alphaDaemon);
    await stopDaemon(betaDaemon);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
