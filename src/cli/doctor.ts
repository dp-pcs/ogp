import { Command } from 'commander';
import { getIdentityDiagnostics, type IdentityDiagnostics } from '../daemon/keypair.js';
import { loadProjects, isProjectMember, type Project } from '../daemon/projects.js';
import { getConfigPath } from '../shared/config.js';

/**
 * `ogp doctor` — read-only identity + membership diagnostic.
 *
 * Prints the identity chain (keychain/file private key -> derived public key ->
 * keypair.json cache -> advertised public key), a project-membership cross-check
 * (does each local project's member list contain the daemon's signing key?), and a
 * stale-keychain audit (lists ogp-federation-* services, flags non-current ones).
 *
 * DIAGNOSES and NAMES fixes; it does NOT auto-mutate keypair.json, the keychain, or
 * federated membership. This is intentional: long-lived daemons should never be
 * silently re-identified by a diagnostic.
 */

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

function color(enabled: boolean, c: string, s: string): string {
  return enabled ? `${c}${s}${RESET}` : s;
}

function short(key: string | null | undefined): string {
  if (!key) return '(none)';
  return key.length > 20 ? `${key.slice(0, 12)}…${key.slice(-6)}` : key;
}

interface MembershipRow {
  projectId: string;
  isMember: boolean;
}

function checkMembership(signingKey: string | null, projects: Project[]): MembershipRow[] {
  if (!signingKey) return [];
  return projects.map((p) => ({
    projectId: p.id,
    isMember: isProjectMember(p.id, signingKey)
  }));
}

interface DoctorReport {
  ok: boolean;
  identity: IdentityDiagnostics;
  configPath: string;
  membership: MembershipRow[];
  warnings: string[];
  errors: string[];
}

function buildReport(): DoctorReport {
  const identity = getIdentityDiagnostics();
  const warnings: string[] = [];
  const errors: string[] = [];

  // The signing/advertised key is the private-key-derived truth when available,
  // otherwise the cached value (best-effort).
  const signingKey = identity.derivedPublicKey ?? identity.cachedPublicKey;

  if (!identity.keypairFileExists) {
    errors.push(`keypair.json not found at ${identity.keypairFile} — run \`ogp setup\` to initialize identity.`);
  }
  if (!identity.privateKeyAvailable) {
    errors.push(
      'Private key unavailable — cannot derive the source-of-truth public key. ' +
        (identity.platform === 'darwin'
          ? 'On macOS the private key lives in the login Keychain; unlock it (`ogp keychain unlock`) or check OGP_KEYCHAIN_PATH/OGP_KEYCHAIN_PASSWORD_FILE.'
          : 'Set OGP_KEYPAIR_SECRET (encrypted-at-rest) or check keypair.json.')
    );
  }
  if (identity.cacheMatchesDerived === false) {
    errors.push(
      `keypair.json public-key cache (${short(identity.cachedPublicKey)}) does NOT match the key derived from the private key (${short(identity.derivedPublicKey)}). ` +
        'The private key is the source of truth — the cache is stale. ' +
        'Fix: re-derive and rewrite the cache (planned `ogp doctor --heal`, or `ogp setup --reset-keypair` to regenerate — destructive, breaks existing memberships).'
    );
  }
  if (identity.privateKeySource === 'plaintext-file') {
    warnings.push(
      'Private key is stored in legacy plaintext in keypair.json. Set OGP_KEYPAIR_SECRET (or configure the platform secret), then `ogp setup --reset-keypair` to harden at rest.'
    );
  }

  const staleNonCurrent = identity.staleKeychainEntries.filter((e) => !e.isCurrent);
  if (staleNonCurrent.length > 0) {
    warnings.push(
      `${staleNonCurrent.length} other ogp-federation-* keychain service(s) present besides the current one (${identity.keychainService}). ` +
        'These are likely stale identities from prior config dirs — harmless but can confuse manual keychain inspection. Review with `security dump-keychain`.'
    );
  }

  let membership: MembershipRow[] = [];
  try {
    const projects = loadProjects();
    membership = checkMembership(signingKey, projects);
    const notMember = membership.filter((m) => !m.isMember);
    if (notMember.length > 0) {
      warnings.push(
        `Daemon signing key is NOT in the member list of ${notMember.length} local project(s): ${notMember
          .map((m) => m.projectId)
          .join(', ')}. ` +
          'If you expect to participate, you may need to (re)join — federated messages to those projects will be rejected as non-member.'
      );
    }
  } catch (err) {
    warnings.push(`Could not load projects for membership cross-check: ${err instanceof Error ? err.message : String(err)}`);
  }

  return {
    ok: errors.length === 0,
    identity,
    configPath: (() => {
      try {
        return getConfigPath();
      } catch {
        return '(unknown)';
      }
    })(),
    membership,
    warnings,
    errors
  };
}

function printHuman(report: DoctorReport, useColor: boolean): void {
  const { identity } = report;
  const ok = (b: boolean) => color(useColor, b ? GREEN : RED, b ? '✓' : '✗');
  const warn = color(useColor, YELLOW, '!');

  console.log(color(useColor, BOLD, 'OGP Doctor — identity & membership diagnostic') + color(useColor, DIM, ' (read-only)'));
  console.log('');
  console.log(color(useColor, BOLD, 'Config'));
  console.log(`  config dir:    ${identity.configDir}`);
  console.log(`  config file:   ${report.configPath}`);
  console.log(`  keypair file:  ${identity.keypairFile} ${ok(identity.keypairFileExists)}`);
  console.log(`  platform:      ${identity.platform}`);
  console.log('');

  console.log(color(useColor, BOLD, 'Identity chain'));
  console.log(`  private key:   ${ok(identity.privateKeyAvailable)} ${color(useColor, DIM, `(source: ${identity.privateKeySource})`)}`);
  console.log(`  derived pub:   ${short(identity.derivedPublicKey)} ${color(useColor, DIM, '(source of truth)')}`);
  console.log(`  cached pub:    ${short(identity.cachedPublicKey)} ${color(useColor, DIM, '(keypair.json cache)')}`);
  if (identity.cacheMatchesDerived === true) {
    console.log(`  cache match:   ${ok(true)} cache matches derived truth`);
  } else if (identity.cacheMatchesDerived === false) {
    console.log(`  cache match:   ${ok(false)} ${color(useColor, RED, 'STALE — cache != derived')}`);
  } else {
    console.log(`  cache match:   ${warn} not comparable (missing one side)`);
  }
  if (identity.keychainService) {
    console.log(`  keychain svc:  ${identity.keychainService}`);
  }
  console.log('');

  console.log(color(useColor, BOLD, 'Project membership cross-check'));
  if (report.membership.length === 0) {
    console.log(color(useColor, DIM, '  (no local projects, or signing key unavailable)'));
  } else {
    for (const row of report.membership) {
      console.log(`  ${ok(row.isMember)} ${row.projectId}`);
    }
  }
  console.log('');

  if (identity.platform === 'darwin') {
    console.log(color(useColor, BOLD, 'Keychain audit (ogp-federation-*)'));
    if (identity.staleKeychainEntries.length === 0) {
      console.log(color(useColor, DIM, '  (none found, or dump-keychain unavailable in this context)'));
    } else {
      for (const e of identity.staleKeychainEntries) {
        const tag = e.isCurrent ? color(useColor, GREEN, 'current') : color(useColor, YELLOW, 'other');
        console.log(`  ${e.service} ${color(useColor, DIM, `[${tag}]`)}`);
      }
    }
    console.log('');
  }

  if (report.errors.length > 0) {
    console.log(color(useColor, BOLD, color(useColor, RED, 'Errors')));
    for (const e of report.errors) console.log(`  ${color(useColor, RED, '✗')} ${e}`);
    console.log('');
  }
  if (report.warnings.length > 0) {
    console.log(color(useColor, BOLD, color(useColor, YELLOW, 'Warnings')));
    for (const w of report.warnings) console.log(`  ${warn} ${w}`);
    console.log('');
  }

  if (report.ok && report.warnings.length === 0) {
    console.log(color(useColor, GREEN, '✓ Identity healthy: private key present, cache matches derived truth, no membership gaps.'));
  } else if (report.ok) {
    console.log(color(useColor, YELLOW, '! Identity is functional but has warnings to review (above).'));
  } else {
    console.log(color(useColor, RED, '✗ Identity has errors that need attention (above).'));
  }
  console.log(color(useColor, DIM, '\nNote: `ogp doctor` is read-only. It does not modify keys, the keychain, or membership.'));
}

export const doctorCommand = new Command('doctor')
  .description('Read-only identity & membership diagnostic (private key -> derived pub -> cache -> membership)')
  .option('--json', 'Output machine-readable JSON instead of the human-readable report')
  .option('--no-color', 'Disable ANSI colors')
  .action((options) => {
    const report = buildReport();
    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      const useColor = options.color !== false && process.stdout.isTTY;
      printHuman(report, useColor);
    }
    // Non-zero exit on hard errors so this is usable in health checks / CI.
    process.exit(report.ok ? 0 : 1);
  });
