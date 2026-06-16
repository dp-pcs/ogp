#!/usr/bin/env node

/**
 * Quick test script to verify Hermes notification backend works
 */

import { loadConfig } from './dist/shared/config.js';
import crypto from 'node:crypto';

const testPayload = {
  peerId: 'test-peer-123',
  peerDisplayName: 'Test Peer (OpenClaw)',
  intent: 'message',
  topic: 'testing',
  message: 'Hello from OGP Hermes backend test!',
  priority: 'normal',
  timestamp: new Date().toISOString()
};

const hermesWebhookUrl = 'http://localhost:8644/webhooks/ogp_federation';
const hermesWebhookSecret = 'ogp-test-secret-hermes-2026';

const bodyStr = JSON.stringify(testPayload);
const signature = crypto
  .createHmac('sha256', hermesWebhookSecret)
  .update(bodyStr)
  .digest('hex');

console.log('Testing Hermes webhook backend...');
console.log('Target URL:', hermesWebhookUrl);
console.log('Payload:', JSON.stringify(testPayload, null, 2));
console.log('Signature:', `sha256=${signature}`);
console.log('');

// Test the webhook
import('node:http').then(({ request }) => {
  const url = new URL(hermesWebhookUrl);

  const req = request({
    hostname: url.hostname,
    port: url.port || 8644,
    path: url.pathname,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Hub-Signature-256': `sha256=${signature}`,
      'Content-Length': Buffer.byteLength(bodyStr),
    },
  }, (res) => {
    console.log(`Response status: ${res.statusCode}`);

    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        console.log('✅ SUCCESS: Hermes webhook accepted the message!');
        console.log('Response:', data || '(empty)');
        console.log('');
        console.log('Check your Telegram or configured delivery channel for the message.');
        process.exit(0);
      } else {
        console.log('❌ FAILED: Non-2xx response');
        console.log('Response:', data);
        process.exit(1);
      }
    });
  });

  req.on('error', (error) => {
    console.log('❌ ERROR:', error.message);
    console.log('');
    console.log('Make sure Hermes gateway is running with webhook enabled.');
    process.exit(1);
  });

  req.setTimeout(5000, () => {
    req.destroy();
    console.log('❌ TIMEOUT: No response from Hermes webhook');
    process.exit(1);
  });

  req.write(bodyStr);
  req.end();
});
