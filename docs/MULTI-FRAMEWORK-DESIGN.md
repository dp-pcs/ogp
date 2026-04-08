# Multi-Framework Support Design

**Status:** ✅ Implemented in OGP v0.4.0+

## Goal
Make OGP feel like a native integration for multiple AI frameworks (OpenClaw, Hermes, etc.) rather than requiring manual `OGP_HOME` environment variables.

## User Experience

### Setup (First-time)
```bash
$ ogp setup

🔍 Detecting installed AI frameworks...
  ✓ Found OpenClaw at ~/.openclaw/
  ✓ Found Hermes at ~/.hermes/

Which frameworks do you want to enable OGP for?
  [x] OpenClaw (Junior @ OpenClaw)
  [x] Hermes (Apollo @ Hermes)
  [ ] Standalone (no framework)

Gateway configuration:
  OpenClaw → https://ogp.sarcastek.com
  Hermes   → https://hermes.sarcastek.com

✓ OGP configured for 2 frameworks
  OpenClaw: ~/.ogp-openclaw/
  Hermes:   ~/.ogp-hermes/

Tip: Use `ogp --for openclaw <command>` or `ogp --for hermes <command>`
     Or set a default: `ogp config set-default openclaw`
```

### Command Execution

**When only one framework is configured:**
```bash
$ ogp federation list
# Automatically uses the only configured framework
```

**When multiple frameworks are configured:**
```bash
$ ogp federation list
? Which framework? (use arrow keys or type to filter)
  › openclaw
    hermes
    all (run on both)

# OR use flag directly:
$ ogp --for openclaw federation list
$ ogp --for hermes federation list
$ ogp --for all federation list  # Run on both, show combined output
```

**Set a default:**
```bash
$ ogp config set-default openclaw
✓ Default framework: openclaw

$ ogp federation list
# Now automatically uses openclaw
```

### Framework Aliases
```bash
$ ogp alias add oc openclaw
$ ogp alias add ap hermes

$ ogp --for oc federation list   # Uses openclaw
$ ogp --for ap federation list   # Uses hermes
```

## Tab Completion

### Bash/Zsh Completion
```bash
$ ogp fed<TAB>
federation

$ ogp federation <TAB>
list      request   approve   reject    remove    send
agent     scopes    alias

$ ogp --for <TAB>
openclaw  hermes  all

$ ogp federation send ?
Usage: ogp federation send <peer> <intent> <payload>

Available peers:
  - apollo (Apollo @ Hermes)
  - junior (Junior @ OpenClaw)

Example: ogp federation send apollo message '{"text":"hello"}'
```

### `?` Style Help (Cisco IOS-inspired)
```bash
$ ogp ?
Available commands:
  setup       Initialize OGP configuration
  start       Start OGP daemon
  stop        Stop OGP daemon
  status      Show daemon status
  federation  Manage federation
  agent-comms Configure agent-to-agent messaging
  config      Manage configuration

$ ogp federation ?
Available commands:
  list     List all peers
  request  Send federation request
  approve  Approve pending peer
  reject   Reject pending peer
  remove   Remove peer
  send     Send message to peer
  agent    Send agent-comms message
  scopes   View/update scopes
  alias    Manage peer aliases

$ ogp federation send ?
Usage: ogp federation send <peer> <intent> <payload>

Arguments:
  peer     Peer ID, alias, or display name
  intent   Intent type (message, task-request, status-update, agent-comms, project.*)
  payload  JSON payload

Example:
  ogp federation send apollo message '{"text":"Hello from OGP!"}'
```

## Implementation Plan

### Phase 1: Framework Detection & Storage
**File:** `src/shared/frameworks.ts`
```typescript
export interface Framework {
  id: string;           // 'openclaw' | 'hermes' | 'standalone'
  name: string;         // Display name
  detected: boolean;    // Auto-detected during setup
  enabled: boolean;     // User selected during setup
  configDir: string;    // e.g., ~/.ogp-openclaw/
  daemonPort: number;   // e.g., 18790
  gatewayUrl?: string;  // User-provided during setup
}

export function detectFrameworks(): Framework[] {
  return [
    {
      id: 'openclaw',
      name: 'OpenClaw',
      detected: fs.existsSync(expandTilde('~/.openclaw')) || commandExists('openclaw'),
      enabled: false,
      configDir: '~/.ogp-openclaw',
      daemonPort: 18790
    },
    {
      id: 'hermes',
      name: 'Hermes',
      detected: fs.existsSync(expandTilde('~/.hermes')) || commandExists('hermes'),
      enabled: false,
      configDir: '~/.ogp-hermes',
      daemonPort: 18793
    },
    {
      id: 'standalone',
      name: 'Standalone (no framework)',
      detected: true,
      enabled: false,
      configDir: '~/.ogp',
      daemonPort: 18790
    }
  ];
}
```

**File:** `~/.ogp-meta/config.json`
```json
{
  "frameworks": [
    {
      "id": "openclaw",
      "enabled": true,
      "configDir": "~/.ogp-openclaw",
      "daemonPort": 18790,
      "gatewayUrl": "https://ogp.sarcastek.com",
      "displayName": "Junior @ OpenClaw"
    },
    {
      "id": "hermes",
      "enabled": true,
      "configDir": "~/.ogp-hermes",
      "daemonPort": 18793,
      "gatewayUrl": "https://hermes.sarcastek.com",
      "displayName": "Apollo @ Hermes"
    }
  ],
  "default": "openclaw",
  "aliases": {
    "oc": "openclaw",
    "ap": "hermes"
  }
}
```

### Phase 2: CLI Flag & Auto-selection
**File:** `src/cli.ts`
```typescript
program
  .option('--for <framework>', 'Select framework (openclaw, hermes, all)')
  .hook('preAction', (thisCommand, actionCommand) => {
    const meta = loadMetaConfig();
    let selectedFramework = thisCommand.opts().for;

    if (!selectedFramework) {
      const enabled = meta.frameworks.filter(f => f.enabled);
      if (enabled.length === 0) {
        console.error('No frameworks configured. Run `ogp setup` first.');
        process.exit(1);
      } else if (enabled.length === 1) {
        selectedFramework = enabled[0].id;
      } else if (meta.default) {
        selectedFramework = meta.default;
      } else {
        // Interactive prompt
        selectedFramework = await selectFramework(enabled);
      }
    }

    // Resolve alias
    selectedFramework = meta.aliases[selectedFramework] || selectedFramework;

    // Set OGP_HOME for selected framework
    const framework = meta.frameworks.find(f => f.id === selectedFramework);
    if (!framework) {
      console.error(`Framework not found: ${selectedFramework}`);
      process.exit(1);
    }

    process.env.OGP_HOME = expandTilde(framework.configDir);
  });
```

### Phase 3: Tab Completion
**File:** `scripts/install-completion.sh`
```bash
#!/bin/bash
# Generate completion script for bash/zsh

if [ -n "$BASH_VERSION" ]; then
  # Bash completion
  cat > ~/.ogp-completion.bash <<'EOF'
_ogp_completion() {
  local cur prev opts
  COMPREPLY=()
  cur="${COMP_WORDS[COMP_CWORD]}"
  prev="${COMP_WORDS[COMP_CWORD-1]}"

  # Top-level commands
  if [ $COMP_CWORD -eq 1 ]; then
    opts="setup start stop status federation agent-comms config"
    COMPREPLY=( $(compgen -W "${opts}" -- ${cur}) )
    return 0
  fi

  # --for flag completion
  if [ "$prev" = "--for" ]; then
    frameworks=$(ogp config list-frameworks --quiet)
    COMPREPLY=( $(compgen -W "${frameworks}" -- ${cur}) )
    return 0
  fi

  # federation subcommands
  if [ "${COMP_WORDS[1]}" = "federation" ]; then
    opts="list request approve reject remove send agent scopes alias"
    COMPREPLY=( $(compgen -W "${opts}" -- ${cur}) )
    return 0
  fi
}

complete -F _ogp_completion ogp
EOF
  echo "source ~/.ogp-completion.bash" >> ~/.bashrc
  echo "✓ Bash completion installed. Restart your shell or run: source ~/.bashrc"

elif [ -n "$ZSH_VERSION" ]; then
  # Zsh completion (similar structure)
  echo "✓ Zsh completion not yet implemented"
fi
```

### Phase 4: `?` Style Help
**File:** `src/cli.ts`
```typescript
// Intercept '?' as a special argument
program.hook('preAction', (thisCommand, actionCommand) => {
  const args = process.argv;
  const hasQuestionMark = args.includes('?');

  if (hasQuestionMark) {
    // Show context-sensitive help
    const commandChain = args.slice(2).filter(a => a !== '?');
    showContextHelp(commandChain);
    process.exit(0);
  }
});

function showContextHelp(commandChain: string[]) {
  if (commandChain.length === 0) {
    // ogp ?
    console.log('Available commands:');
    program.commands.forEach(cmd => {
      console.log(`  ${cmd.name().padEnd(15)} ${cmd.description()}`);
    });
  } else if (commandChain[0] === 'federation') {
    // ogp federation ?
    const fedCmd = program.commands.find(c => c.name() === 'federation');
    console.log('Available federation commands:');
    fedCmd?.commands.forEach(cmd => {
      console.log(`  ${cmd.name().padEnd(15)} ${cmd.description()}`);
    });
  } else if (commandChain[0] === 'federation' && commandChain[1] === 'send') {
    // ogp federation send ?
    console.log('Usage: ogp federation send <peer> <intent> <payload>');
    console.log('');
    console.log('Arguments:');
    console.log('  peer     Peer ID, alias, or display name');
    console.log('  intent   Intent type (message, task-request, status-update, agent-comms, project.*)');
    console.log('  payload  JSON payload');
    console.log('');
    console.log('Example:');
    console.log('  ogp federation send apollo message \'{"text":"Hello from OGP!"}\'');
  }
}
```

## Migration Path

### For Existing Users
1. Detect existing `~/.ogp/` and `~/.ogp-hermes/` directories
2. Auto-create `~/.ogp-meta/config.json` with both frameworks enabled
3. Rename directories:
   - `~/.ogp/` → `~/.ogp-openclaw/` (if OpenClaw detected)
   - Keep `~/.ogp-hermes/` as-is
4. Show migration notice on first run

### Backward Compatibility
- Still respect `OGP_HOME` environment variable if set (takes precedence over `--for`)
- Old commands work as-is if only one framework is configured
- `ogp start` without `--for` starts daemon for current framework context

## Benefits

1. **Native feel**: No more `OGP_HOME=~/.ogp-hermes ogp ...` commands
2. **Discoverability**: `?` help makes it easy for new users
3. **Power user friendly**: Tab completion, aliases, defaults
4. **Clean separation**: Each framework has isolated state/config
5. **Multi-framework operations**: `--for all` runs commands across all frameworks

## Implementation Notes

### Resolved Design Questions

1. **Custom framework definitions:** Not yet supported in v0.4.0. Future enhancement for users with multiple instances of the same framework.

2. **Daemon lifecycle:** Implemented as Option B - `ogp start` starts daemon for current/default context, `ogp --for all start` starts all configured framework daemons.

3. **Framework config location:** Framework-specific configs remain in their own directories (`~/.ogp-openclaw/`, `~/.ogp-hermes/`), with meta-config centralized at `~/.ogp-meta/config.json`.

### See Also

- [Getting Started Guide](./GETTING-STARTED.md) - Complete setup and usage guide
- [CLI Reference](./CLI-REFERENCE.md) - Full command documentation
- [Migration Guide](./MIGRATION.md) - Upgrading from single to multi-framework
- [Implementation Details](./MULTI-FRAMEWORK-IMPL.md) - Technical implementation notes
