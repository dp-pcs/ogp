#!/usr/bin/env node

import { startServer } from './dist/daemon/server.js';
import { loadConfig } from './dist/shared/config.js';

try {
  const config = loadConfig();
  console.log('✓ Config loaded successfully');
  console.log(`  Platform: ${config.platform || 'openclaw'}`);
  console.log(`  Daemon port: ${config.daemonPort}`);
  console.log(`  Gateway URL: ${config.gatewayUrl}`);
  console.log('');
  console.log('Starting server...');
  startServer(config, false);
} catch (error) {
  console.error('❌ Error starting daemon:', error.message);
  console.error(error.stack);
  process.exit(1);
}
