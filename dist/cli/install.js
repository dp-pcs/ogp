import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execFileAsync = promisify(execFile);
const LAUNCH_AGENT_LABEL = 'com.dp-pcs.ogp';
const LAUNCH_AGENT_DIR = path.join(os.homedir(), 'Library', 'LaunchAgents');
const LAUNCH_AGENT_PLIST = path.join(LAUNCH_AGENT_DIR, `${LAUNCH_AGENT_LABEL}.plist`);
async function getOgpBinaryPath() {
    try {
        // Try to find the ogp binary in PATH
        const result = await execFileAsync('which', ['ogp']);
        return result.stdout.trim();
    }
    catch (error) {
        // Fallback to npm global bin directory
        const result = await execFileAsync('npm', ['bin', '-g']);
        const npmBin = result.stdout.trim();
        return path.join(npmBin, 'ogp');
    }
}
function generatePlist(ogpPath) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LAUNCH_AGENT_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
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
export async function installLaunchAgent() {
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
        console.log(`Found ogp binary at: ${ogpPath}`);
        // Generate and write the plist
        const plistContent = generatePlist(ogpPath);
        fs.writeFileSync(LAUNCH_AGENT_PLIST, plistContent, 'utf-8');
        console.log(`Created LaunchAgent plist at: ${LAUNCH_AGENT_PLIST}`);
        // Load the LaunchAgent
        try {
            await execFileAsync('launchctl', ['load', LAUNCH_AGENT_PLIST]);
            console.log('\nLaunchAgent loaded successfully');
            console.log('OGP will now start automatically on login');
        }
        catch (error) {
            console.error('Failed to load LaunchAgent');
            console.error('You can manually load it with:');
            console.error(`  launchctl load ${LAUNCH_AGENT_PLIST}`);
        }
    }
    catch (error) {
        console.error('Failed to install LaunchAgent:', error);
        process.exit(1);
    }
}
export async function uninstallLaunchAgent() {
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
            }
            catch (error) {
                console.log('LaunchAgent was not loaded (or already unloaded)');
            }
            // Delete the plist file
            fs.unlinkSync(LAUNCH_AGENT_PLIST);
            console.log(`Deleted: ${LAUNCH_AGENT_PLIST}`);
            console.log('\nOGP will no longer start automatically on login');
        }
        else {
            console.log('LaunchAgent is not installed');
        }
    }
    catch (error) {
        console.error('Failed to uninstall LaunchAgent:', error);
        process.exit(1);
    }
}
//# sourceMappingURL=install.js.map