#!/usr/bin/env node

/**
 * Test the Hermes notification backend directly
 *
 * Run with: OGP_HOME=~/.ogp-hermes node test-hermes-notify.mjs
 */

// Import modules after ensuring OGP_HOME is set
const { loadConfig } = await import('./dist/shared/config.js');
const { notifyLocalAgent } = await import('./dist/daemon/notify.js');

const config = loadConfig();

console.log('✓ Loaded config');
console.log(`  Config path: ${process.env.OGP_HOME || '~/.ogp'}`);
console.log(`  Platform: ${config.platform || 'openclaw (default)'}`);
console.log(`  Hermes webhook: ${config.hermesWebhookUrl || 'not configured'}`);
console.log('');

const testPayload = {
  text: 'Hello! This is an end-to-end test of the Hermes notification backend from the OGP daemon.',
  peerId: 'test-peer-123',
  peerDisplayName: 'Test Peer (Integration Test)',
  intent: 'message',
  topic: 'testing',
  priority: 'normal',
};

console.log('Sending notification via platform backend...');

try {
  const result = await notifyLocalAgent(testPayload);

  if (result) {
    console.log('✅ SUCCESS: Notification delivered!');
    console.log('');
    console.log('Check your Telegram (or configured Hermes delivery channel) for the message.');
  } else {
    console.log('❌ FAILED: Notification delivery returned false');
    process.exit(1);
  }
} catch (error) {
  console.error('❌ ERROR:', error.message);
  console.error(error.stack);
  process.exit(1);
}
