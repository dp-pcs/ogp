import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const LAUNCH_AGENT_LABEL = 'com.dp-pcs.ogp';
const LAUNCH_AGENT_DIR = path.join(os.homedir(), 'Library', 'LaunchAgents');
const LAUNCH_AGENT_PLIST = path.join(LAUNCH_AGENT_DIR, `${LAUNCH_AGENT_LABEL}.plist`);

async function getOgpBinaryPath(): Promise<string> {
  try {
    // Try to find the ogp binary in PATH
    const result = await execFileAsync('which', ['ogp']);
    return result.stdout.trim();
  } catch (error) {
    // Fallback to npm global bin directory
    const result = await execFileAsync('npm', ['bin', '-g']);
    const npmBin = result.stdout.trim();
    return path.join(npmBin, 'ogp');
  }
}

/**
 * Resolve a node binary path to a *stable*, version-independent location when possible.
 *
 * `process.execPath` on a Homebrew install points at the Cellar versioned path,
 * e.g. `/opt/homebrew/Cellar/node/25.6.1/bin/node`. Pinning that into a LaunchAgent
 * plist breaks the daemon on the next `brew upgrade node` (the versioned dir disappears
 * and dyld can no longer load the moved shared libs) -> launchd exit -6 -> silent outage.
 * This caused the 2026-06-23 ogp.sarcastek.com 502.
 *
 * If `execPath` lives under a Homebrew Cellar dir, prefer the stable `<prefix>/bin/node`
 * symlink (which Homebrew keeps pointing at the current node) when it exists. We only
 * swap to a path that actually exists; otherwise we return the original execPath so we
 * never produce a plist pointing at a missing binary.
 *
 * Exported for unit testing; `fileExists` is injectable so tests stay filesystem-free.
 */
export function stableNodePath(
  execPath: string,
  fileExists: (p: string) => boolean = (p) => fs.existsSync(p),
): string {
  // Match Homebrew Cellar layout: <prefix>/Cellar/node<suffix>/<version>/bin/node
  // <suffix> covers versioned formulae like node@22.
  const cellarMatch = execPath.match(
    /^(.*)\/Cellar\/node(?:@[\w.]+)?\/[^/]+\/bin\/node$/,
  );
  if (cellarMatch) {
    const prefix = cellarMatch[1]; // e.g. /opt/homebrew or /usr/local
    const stable = path.join(prefix, 'bin', 'node');
    if (stable !== execPath && fileExists(stable)) {
      return stable;
    }
  }
  return execPath;
}

function getNodeBinaryPath(): string {
  return stableNodePath(process.execPath);
}

export function generatePlist(nodePath: string, ogpPath: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LAUNCH_AGENT_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${nodePath}</string>
    <string>${ogpPath}</string>
    <string>start</string>
    <string>--background</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <false/>
  <key>StandardOutPath</key>
  <string>${os.homedir()}/.ogp/launchagent.log</string>
  <key>StandardErrorPath</key>
  <string>${os.homedir()}/.ogp/launchagent.log</string>
</dict>
</plist>
`;
}

export async function installLaunchAgent(): Promise<void> {
  if (process.platform !== 'darwin') {
    console.error('LaunchAgent installation is only supported on macOS');
    process.exit(1);
  }

  try {
    // Ensure LaunchAgents directory exists
    if (!fs.existsSync(LAUNCH_AGENT_DIR)) {
      fs.mkdirSync(LAUNCH_AGENT_DIR, { recursive: true });
    }

    // Get the ogp binary path
    const ogpPath = await getOgpBinaryPath();
    const nodePath = getNodeBinaryPath();
    console.log(`Found ogp binary at: ${ogpPath}`);
    console.log(`Found node binary at: ${nodePath}`);

    // Generate and write the plist
    const plistContent = generatePlist(nodePath, ogpPath);
    fs.writeFileSync(LAUNCH_AGENT_PLIST, plistContent, 'utf-8');
    console.log(`Created LaunchAgent plist at: ${LAUNCH_AGENT_PLIST}`);

    // Load the LaunchAgent
    try {
      await execFileAsync('launchctl', ['load', LAUNCH_AGENT_PLIST]);
      console.log('\nLaunchAgent loaded successfully');
      console.log('OGP will now start automatically on login');
    } catch (error) {
      console.error('Failed to load LaunchAgent');
      console.error('You can manually load it with:');
      console.error(`  launchctl load ${LAUNCH_AGENT_PLIST}`);
    }
  } catch (error) {
    console.error('Failed to install LaunchAgent:', error);
    process.exit(1);
  }
}

export async function uninstallLaunchAgent(): Promise<void> {
  if (process.platform !== 'darwin') {
    console.error('LaunchAgent uninstallation is only supported on macOS');
    process.exit(1);
  }

  try {
    // Unload the LaunchAgent if it's loaded
    if (fs.existsSync(LAUNCH_AGENT_PLIST)) {
      try {
        await execFileAsync('launchctl', ['unload', LAUNCH_AGENT_PLIST]);
        console.log('LaunchAgent unloaded');
      } catch (error) {
        console.log('LaunchAgent was not loaded (or already unloaded)');
      }

      // Delete the plist file
      fs.unlinkSync(LAUNCH_AGENT_PLIST);
      console.log(`Deleted: ${LAUNCH_AGENT_PLIST}`);
      console.log('\nOGP will no longer start automatically on login');
    } else {
      console.log('LaunchAgent is not installed');
    }
  } catch (error) {
    console.error('Failed to uninstall LaunchAgent:', error);
    process.exit(1);
  }
}
