#!/usr/bin/env node

/**
 * Test script for migration detection
 * Usage: node scripts/test-migration.js
 */

import { detectExistingInstallations, checkMigrationStatus } from '../dist/shared/migration.js';

console.log('=== OGP Migration Detection Test ===\n');

// Check migration status
const status = checkMigrationStatus();
console.log('Migration Status:');
console.log(`  Needed: ${status.migrationNeeded}`);
console.log(`  Summary: ${status.summary}\n`);

if (status.plan) {
  const plan = status.plan;

  console.log('Detected Installations:');
  for (const install of plan.existingInstalls) {
    console.log(`  - ${install.path}`);
    console.log(`    Framework: ${install.framework}`);
    console.log(`    Display Name: ${install.config.displayName}`);
    console.log(`    Daemon Port: ${install.config.daemonPort}`);
    console.log(`    Platform: ${install.config.platform || '(not set)'}`);
    console.log('');
  }

  console.log('Migration Actions:');
  for (const action of plan.actions) {
    console.log(`  ${action.type.toUpperCase()}: ${action.description}`);
    if (action.from && action.to) {
      console.log(`    ${action.from} -> ${action.to}`);
    }
  }
} else {
  console.log('No migration plan needed.');
}

console.log('\n=== Test Complete ===');
