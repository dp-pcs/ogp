# OGP Migration Guide

## Overview

The OGP migration system helps users transition from legacy single-framework installations to the new multi-framework meta-configuration system introduced in OGP 0.4.0+.

## What Gets Migrated

The migration system automatically detects and migrates:

1. **OpenClaw installations** at `~/.ogp/`
2. **Hermes installations** at `~/.ogp-hermes/`
3. **Standalone OGP installations** at `~/.ogp/`

## Migration Logic

### Framework Detection

The migration system determines framework type by checking:

1. **Explicit `platform` field** in config.json (takes precedence)
   - `"platform": "openclaw"` → OpenClaw
   - `"platform": "hermes"` → Hermes

2. **Framework-specific fields** (heuristics)
   - Has `hermesWebhookUrl` or `hermesWebhookSecret` → Hermes
   - Has `openclawUrl` and `openclawToken` → OpenClaw
   - Otherwise → Standalone

### Migration Actions

#### Single Installation Scenarios

**Scenario 1: Only `~/.ogp/` exists (OpenClaw)**
```
Actions:
1. Rename ~/.ogp → ~/.ogp-openclaw
2. Create meta config at ~/.ogp-meta/config.json
3. Register OpenClaw framework
4. Set default to 'openclaw'
```

**Scenario 2: Only `~/.ogp/` exists (Standalone)**
```
Actions:
1. Keep ~/.ogp as-is (no rename)
2. Create meta config at ~/.ogp-meta/config.json
3. Register standalone framework
4. Set default to 'standalone'
```

**Scenario 3: Only `~/.ogp-hermes/` exists**
```
Actions:
1. Keep ~/.ogp-hermes as-is
2. Create meta config at ~/.ogp-meta/config.json
3. Register Hermes framework
4. Set default to 'hermes'
```

#### Multi-Installation Scenario

**Scenario 4: Both `~/.ogp/` and `~/.ogp-hermes/` exist**
```
Actions:
1. Rename ~/.ogp → ~/.ogp-openclaw (if OpenClaw)
2. Keep ~/.ogp-hermes as-is
3. Create meta config at ~/.ogp-meta/config.json
4. Register both frameworks
5. Set default to 'openclaw'
```

## Usage

### Programmatic API

```typescript
import {
  detectExistingInstallations,
  executeMigration,
  checkMigrationStatus,
  type MigrationPlan
} from '@dp-pcs/ogp/dist/shared/migration.js';

// Check if migration is needed
const status = checkMigrationStatus();
if (status.migrationNeeded) {
  console.log(status.summary);

  // Get detailed plan
  const plan = detectExistingInstallations();

  // Execute migration
  await executeMigration(plan);
}
```

### Testing Scripts

Two test scripts are provided:

#### 1. Detection Test (Read-only)
```bash
node scripts/test-migration.js
```

Shows what would be migrated without making changes.

#### 2. Execution Test
```bash
# Dry run (shows plan, no changes)
node scripts/test-migration-execute.js --dry-run

# Execute migration
node scripts/test-migration-execute.js
```

## Migration Plan Structure

```typescript
interface MigrationPlan {
  needed: boolean;                    // Is migration required?
  existingInstalls: Array<{
    path: string;                     // e.g., "/Users/alice/.ogp"
    framework: FrameworkType;         // 'openclaw' | 'hermes' | 'standalone'
    config: OGPConfig;                // Full config object
  }>;
  actions: Array<{
    type: 'rename' | 'create-meta' | 'register';
    from?: string;                    // Source path (for rename)
    to?: string;                      // Target path (for rename)
    framework?: FrameworkType;        // Framework being operated on
    description: string;              // Human-readable description
  }>;
}
```

## Safety Features

1. **Backup Creation**: Before renaming, creates timestamped backup
   ```
   ~/.ogp.backup-1712345678901
   ```

2. **Rollback on Error**: If rename fails, automatically restores from backup

3. **Validation**: Checks target doesn't exist before renaming

4. **Idempotency**: Safe to run multiple times - detects if already migrated

## Post-Migration

After migration, users have:

1. **Meta Config** at `~/.ogp-meta/config.json`
   ```json
   {
     "version": "1.0.0",
     "frameworks": [
       {
         "id": "openclaw",
         "name": "OpenClaw",
         "enabled": true,
         "configDir": "/Users/alice/.ogp-openclaw",
         "daemonPort": 18790,
         "gatewayUrl": "https://alice.example.com",
         "displayName": "Alice @ OpenClaw",
         "platform": "openclaw"
       },
       {
         "id": "hermes",
         "name": "Hermes",
         "enabled": true,
         "configDir": "/Users/alice/.ogp-hermes",
         "daemonPort": 18793,
         "gatewayUrl": "https://hermes.alice.example.com",
         "displayName": "Alice @ Hermes",
         "platform": "hermes"
       }
     ],
     "default": "openclaw"
   }
   ```

2. **Framework-specific configs** preserved in their directories

3. **All existing data** (peers.json, keypair.json, etc.) intact

## Integration with Setup Flow

The migration will be integrated into the setup flow:

```bash
ogp setup
```

Will:
1. Detect existing installations
2. Show migration plan
3. Prompt user to confirm
4. Execute migration if approved
5. Continue with multi-framework setup
