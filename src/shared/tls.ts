/**
 * TLS verification policy for outbound HTTPS calls.
 *
 * SECURITY (F-03): The daemon makes outbound HTTPS calls to two kinds of
 * targets:
 *   1. Loopback (https://localhost:18789 for OpenClaw, http://localhost:8644
 *      for Hermes) — typically self-signed certs in dev. Strict verification
 *      would block normal operation.
 *   2. Remote (a Hermes instance running on the public internet, or a remote
 *      OpenClaw gateway). Strict verification MUST apply here so the daemon
 *      doesn't silently accept a forged TLS cert from a network attacker.
 *
 * This helper centralises the policy: relax verification for loopback only,
 * unless an explicit env-var override has been set for a known remote target.
 */

const LOOPBACK_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1']);

/**
 * Decide whether `rejectUnauthorized` should be `false` for an outbound call.
 *
 * @param hostname - the URL.hostname of the target
 * @param insecureEnvVar - optional env var name; if set to '1' allows
 *   relaxed verification for non-loopback hosts. Use this only when the
 *   target is a deliberately self-signed remote that the operator opted
 *   into (e.g. internal Hermes with a private CA they accept the risk of).
 * @returns true if TLS verification should be relaxed
 */
export function shouldRelaxTls(hostname: string, insecureEnvVar?: string): boolean {
  const host = (hostname ?? '').trim().toLowerCase();
  if (LOOPBACK_HOSTNAMES.has(host)) {
    return true;
  }
  if (insecureEnvVar && process.env[insecureEnvVar] === '1') {
    return true;
  }
  return false;
}
