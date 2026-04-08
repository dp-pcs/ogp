#!/usr/bin/env node

/**
 * Test script for executing migration
 * Usage: node scripts/test-migration-execute.js [--dry-run]
 *
 * Use --dry-run to see what would happen without actually executing
 */

import { detectExistingInstallations, executeMigration } from '../dist/shared/migration.js';
import { loadMetaConfig } from '../dist/shared/meta-config.js';

const dryRun = process.argv.includes('--dry-run');

console.log('=== OGP Migration Execution Test ===\n');

if (dryRun) {
  console.log('DRY RUN MODE - No changes will be made\n');
}

// Detect existing installations
const plan = detectExistingInstallations();

if (!plan.needed) {
  console.log('No migration needed.');
  process.exit(0);
}

console.log('Detected Installations:');
for (const install of plan.existingInstalls) {
  console.log(`  - ${install.path} (${install.framework})`);
}
console.log('');

console.log('Migration Plan:');
for (const action of plan.actions) {
  console.log(`  ${action.type.toUpperCase()}: ${action.description}`);
  if (action.from && action.to) {
    console.log(`    ${action.from} -> ${action.to}`);
  }
}
console.log('');

if (dryRun) {
  console.log('Dry run complete. Use without --dry-run to execute migration.');
  process.exit(0);
}

// Execute migration
console.log('Executing migration...\n');
try {
  await executeMigration(plan);
  console.log('\n✓ Migration completed successfully!\n');

  // Load and display the new meta config
  const metaConfig = loadMetaConfig();
  console.log('Meta Configuration:');
  console.log(`  Version: ${metaConfig.version}`);
  console.log(`  Default Framework: ${metaConfig.default}`);
  console.log('  Frameworks:');
  for (const framework of metaConfig.frameworks) {
    console.log(`    - ${framework.id} (${framework.name})`);
    console.log(`      Enabled: ${framework.enabled}`);
    console.log(`      Config Dir: ${framework.configDir}`);
    console.log(`      Daemon Port: ${framework.daemonPort}`);
    console.log(`      Display Name: ${framework.displayName}`);
    console.log('');
  }
} catch (error) {
  console.error('\n✗ Migration failed:', error.message);
  process.exit(1);
}

console.log('=== Test Complete ===');
