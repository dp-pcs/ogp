import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { requireConfig, getConfigDir } from '../shared/config.js';
const TUNNEL_PID_FILE = path.join(getConfigDir(), 'tunnel.pid');
const TUNNEL_LOG_FILE = path.join(getConfigDir(), 'tunnel.log');
export async function expose(method = 'cloudflared', background = false) {
    const config = requireConfig();
    console.log(`Exposing OGP daemon on port ${config.daemonPort}...`);
    if (method === 'cloudflared') {
        await exposeCloudflared(config.daemonPort, background);
    }
    else if (method === 'ngrok') {
        await exposeNgrok(config.daemonPort, background);
    }
}
export function stopExpose() {
    if (!fs.existsSync(TUNNEL_PID_FILE)) {
        console.log('No tunnel is running');
        return;
    }
    try {
        const pidStr = fs.readFileSync(TUNNEL_PID_FILE, 'utf-8').trim();
        const pid = parseInt(pidStr, 10);
        if (isNaN(pid)) {
            console.error('Invalid PID in tunnel.pid file');
            fs.unlinkSync(TUNNEL_PID_FILE);
            return;
        }
        // Check if process is running
        try {
            process.kill(pid, 0);
        }
        catch (error) {
            console.log('Tunnel is not running (stale PID file)');
            fs.unlinkSync(TUNNEL_PID_FILE);
            return;
        }
        // Send SIGTERM
        process.kill(pid, 'SIGTERM');
        fs.unlinkSync(TUNNEL_PID_FILE);
        console.log('Tunnel stopped');
    }
    catch (error) {
        console.error('Failed to stop tunnel:', error);
    }
}
async function exposeCloudflared(port, background) {
    console.log('Starting cloudflared tunnel...');
    console.log('Install cloudflared: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/\n');
    if (background) {
        const logStream = fs.openSync(TUNNEL_LOG_FILE, 'a');
        const proc = spawn('cloudflared', ['tunnel', '--url', `http://localhost:${port}`], {
            detached: true,
            stdio: ['ignore', logStream, logStream]
        });
        proc.unref();
        fs.writeFileSync(TUNNEL_PID_FILE, proc.pid.toString(), 'utf-8');
        console.log(`Cloudflared tunnel started (PID: ${proc.pid})`);
        console.log(`Logs: ${TUNNEL_LOG_FILE}`);
        console.log('Run "ogp expose stop" to stop the tunnel');
    }
    else {
        const proc = spawn('cloudflared', ['tunnel', '--url', `http://localhost:${port}`], {
            stdio: 'inherit'
        });
        proc.on('error', (error) => {
            console.error('Failed to start cloudflared:', error);
            console.log('Make sure cloudflared is installed and in your PATH');
        });
        proc.on('close', (code) => {
            console.log(`cloudflared exited with code ${code}`);
        });
    }
}
async function exposeNgrok(port, background) {
    console.log('Starting ngrok tunnel...');
    console.log('Install ngrok: https://ngrok.com/download\n');
    if (background) {
        const logStream = fs.openSync(TUNNEL_LOG_FILE, 'a');
        const proc = spawn('ngrok', ['http', port.toString()], {
            detached: true,
            stdio: ['ignore', logStream, logStream]
        });
        proc.unref();
        fs.writeFileSync(TUNNEL_PID_FILE, proc.pid.toString(), 'utf-8');
        console.log(`Ngrok tunnel started (PID: ${proc.pid})`);
        console.log(`Logs: ${TUNNEL_LOG_FILE}`);
        console.log('Run "ogp expose stop" to stop the tunnel');
    }
    else {
        const proc = spawn('ngrok', ['http', port.toString()], {
            stdio: 'inherit'
        });
        proc.on('error', (error) => {
            console.error('Failed to start ngrok:', error);
            console.log('Make sure ngrok is installed and in your PATH');
        });
        proc.on('close', (code) => {
            console.log(`ngrok exited with code ${code}`);
        });
    }
}
//# sourceMappingURL=expose.js.map