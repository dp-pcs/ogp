#!/usr/bin/env node

/**
 * Test sending an OGP message directly to the Hermes OGP daemon
 * to verify the complete notification flow works
 */

import crypto from 'node:crypto';
import { getPrivateKey } from './dist/daemon/keypair.js';
import { signObject } from './dist/shared/signing.js';

const hermesOgpUrl = 'http://localhost:18793';

// Set OGP_HOME to use the OpenClaw instance credentials
process.env.OGP_HOME = process.env.HOME + '/.ogp';

const privateKey = getPrivateKey();

const message = {
  peerId: 'test-openclaw',
  peerDisplayName: 'Test Sender (OpenClaw)',
  intent: 'message',
  topic: 'integration-test',
  message: 'Hello Hermes! This is a test message from OpenClaw OGP daemon to verify the Hermes notification backend works.',
  priority: 'normal',
  timestamp: new Date().toISOString()
};

const signature = signObject(message, privateKey);

console.log('Sending test message to Hermes OGP daemon...');
console.log(`Target: ${hermesOgpUrl}/federation/message`);
console.log('');

const response = await fetch(`${hermesOgpUrl}/federation/message`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    message,
    signature
  })
});

console.log(`Response status: ${response.status}`);

if (response.ok) {
  const result = await response.json();
  console.log('✅ SUCCESS: Message accepted by Hermes OGP daemon');
  console.log('Response:', JSON.stringify(result, null, 2));
  console.log('');
  console.log('Check your Telegram to see if the message was delivered via Hermes!');
} else {
  const errorText = await response.text();
  console.log('❌ FAILED');
  console.log('Response:', errorText);
  process.exit(1);
}
