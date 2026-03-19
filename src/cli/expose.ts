import { spawn } from 'node:child_process';
import { requireConfig } from '../shared/config.js';

export async function expose(method: 'cloudflared' | 'ngrok' = 'cloudflared'): Promise<void> {
  const config = requireConfig();

  console.log(`Exposing OGP daemon on port ${config.daemonPort}...`);

  if (method === 'cloudflared') {
    await exposeCloudflared(config.daemonPort);
  } else if (method === 'ngrok') {
    await exposeNgrok(config.daemonPort);
  }
}

async function exposeCloudflared(port: number): Promise<void> {
  console.log('Starting cloudflared tunnel...');
  console.log('Install cloudflared: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/\n');

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

async function exposeNgrok(port: number): Promise<void> {
  console.log('Starting ngrok tunnel...');
  console.log('Install ngrok: https://ngrok.com/download\n');

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
