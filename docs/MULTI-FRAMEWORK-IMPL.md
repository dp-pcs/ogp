# Multi-Framework Implementation Plan

**Status:** ✅ Implemented in OGP v0.4.0+

> Historical note, April 9, 2026: this file is primarily an implementation log.
> Some unchecked items below were not maintained after features landed.
> In particular, completion and `?` help are present in the codebase even though later checklist sections still show them as pending.
> Do not use this file as the canonical active backlog.

This document tracks the implementation status of multi-framework support.

## Phase 1: Core Infrastructure ✅ COMPLETED

### 1.1 Meta Configuration ✅
- [x] Create `~/.ogp-meta/` directory structure
- [x] Implement `loadMetaConfig()` and `saveMetaConfig()` functions
- [x] Define `Framework` interface and schema
- [x] Add framework detection logic (check for `~/.openclaw/`, `~/.hermes/`, command existence)

**Files created:**
- `src/shared/meta-config.ts` - Meta config management
- `src/shared/framework-detection.ts` - Auto-detect installed frameworks

### 1.2 Migration for Existing Users ✅
- [x] Detect existing `~/.ogp/` and `~/.ogp-hermes/` installations
- [x] Auto-create meta config from existing installations
- [x] Show migration notice with new command patterns

**Files modified:**
- `src/cli.ts` - Add migration check on startup
- `src/shared/migration.ts` - Migration logic

### 1.3 `--for` Flag ✅
- [x] Add global `--for <framework>` option to CLI
- [x] Implement framework selection logic (auto-select, prompt, or explicit)
- [x] Set `OGP_HOME` based on selected framework
- [x] Handle `all` value for multi-framework operations

**Files modified:**
- `src/cli.ts` - Add `preAction` hook for framework selection

## Phase 2: Setup Wizard ✅ COMPLETED

### 2.1 Interactive Setup ✅
- [x] Rewrite `ogp setup` to be framework-aware
- [x] Show detected frameworks with checkboxes
- [x] Prompt for gateway URL per framework
- [x] Prompt for display name per framework
- [x] Save to meta config

**Files modified:**
- `src/cli/setup.ts` - Interactive framework setup

### 2.2 Config Management Commands ✅
- [x] `ogp config list` - Show all configured frameworks
- [x] `ogp config set-default <framework>` - Set default framework
- [x] `ogp config enable <framework>` - Enable a framework
- [x] `ogp config disable <framework>` - Disable a framework
- [x] `ogp config show` - Show current configuration

**Files created:**
- `src/cli/config.ts` - Config management commands

## Phase 3: Tab Completion ⏳ IN PROGRESS

### 3.1 Completion Script Generation
- [ ] Create bash completion script template
- [ ] Create zsh completion script template
- [ ] Implement `ogp completion install` command
- [ ] Add completion for top-level commands
- [ ] Add completion for `--for` flag (framework names + aliases)
- [ ] Add completion for peer names/aliases

**Files to create:**
- `scripts/completion.bash` - Bash completion template
- `scripts/completion.zsh` - Zsh completion template
- `src/cli/completion.ts` - Completion installer

**Status:** Documented but not yet implemented in code.

### 3.2 Dynamic Completions
- [ ] `ogp config list --quiet` - Output framework IDs for completion
- [ ] `ogp federation list --quiet` - Output peer names/aliases for completion

## Phase 4: `?` Style Help ⏳ IN PROGRESS

### 4.1 Help Interceptor
- [ ] Add `preAction` hook to detect `?` in arguments
- [ ] Implement context-sensitive help based on command chain
- [ ] Show available subcommands
- [ ] Show usage examples
- [ ] Show available peers (for federation commands)

**Files to modify:**
- `src/cli.ts` - Add `?` interceptor
- `src/shared/help.ts` - Context-sensitive help formatter

**Status:** Documented but not yet implemented in code.

### 4.2 Enhanced Help for Key Commands
- [ ] `ogp ?` - Top-level commands
- [ ] `ogp federation ?` - Federation subcommands
- [ ] `ogp federation send ?` - Send command usage + peer list
- [ ] `ogp federation agent ?` - Agent-comms usage + peer list
- [ ] `ogp agent-comms ?` - Agent-comms subcommands

## Phase 5: Multi-Framework Operations ✅ COMPLETED

### 5.1 `--for all` Support ✅
- [x] Run command on all enabled frameworks sequentially
- [x] Aggregate results with framework labels
- [x] Handle errors gracefully (continue on failure)

**Implementation:** Commands support `--for all` with framework-labeled output.

### 5.2 Daemon Lifecycle ✅
- [x] `ogp start` - Start daemon for current framework
- [x] `ogp --for all start` - Start daemons for all enabled frameworks
- [x] `ogp stop` - Stop daemon for current framework
- [x] `ogp --for all stop` - Stop all framework daemons
- [x] `ogp status` - Show status for current framework
- [x] `ogp --for all status` - Show status for all frameworks

**Files modified:**
- `src/cli.ts` - Updated start/stop/status commands

## Testing Plan

### Unit Tests ✅
- [x] Framework detection logic
- [x] Meta config load/save
- [x] Framework selection (auto, prompt, explicit)
- [x] Migration logic

### Integration Tests ✅
- [x] Setup wizard with multiple frameworks
- [x] Command execution with `--for` flag
- [x] Default framework behavior
- [x] `--for all` aggregation

### Manual Testing ✅
- [x] Fresh install on clean machine
- [x] Migration from existing single-framework setup
- [x] Migration from existing multi-framework setup
- [ ] Tab completion (bash and zsh) - Pending implementation
- [ ] `?` help in various contexts - Pending implementation

## Documentation ✅ COMPLETED

### User-Facing Docs ✅
- [x] Update README with multi-framework examples
- [x] Create GETTING-STARTED guide with framework setup
- [x] Update all examples to show `--for` flag usage
- [x] Add tab completion installation instructions
- [x] Create CLI-REFERENCE with complete command documentation

**Files created/updated:**
- `README.md` - Updated with multi-framework examples
- `docs/GETTING-STARTED.md` - Comprehensive setup and usage guide
- `docs/CLI-REFERENCE.md` - Complete command reference
- `docs/MIGRATION.md` - Migration guide for existing users

### Developer Docs ✅
- [x] Document meta config schema
- [x] Document framework detection logic
- [x] Document migration path for existing users

## Success Metrics

1. ✅ New users can set up OGP for multiple frameworks in < 2 minutes
2. ✅ Existing users can migrate without manual config editing
3. ⏳ Tab completion works for all major commands (documented, pending implementation)
4. ⏳ `?` help provides useful context at every level (documented, pending implementation)
5. ✅ Zero breaking changes for single-framework users

## Breaking Changes (None!)

- ✅ Old `OGP_HOME` environment variable still works (takes precedence)
- ✅ Single-framework setups work exactly as before (auto-selected)
- ✅ All existing commands maintain backward compatibility

## Future Enhancements (Post-v1.0)

- [ ] Framework aliases (`ogp alias add oc openclaw`)
- [ ] Custom framework definitions (for multiple OpenClaw instances)
- [ ] Framework-specific config overrides
- [ ] Cross-framework federation status view
- [ ] Framework health monitoring dashboard
- [ ] Tab completion implementation (currently documented)
- [ ] `?` style help implementation (currently documented)

## See Also

- [Getting Started Guide](./GETTING-STARTED.md) - Complete setup and workflows
- [CLI Reference](./CLI-REFERENCE.md) - Full command documentation
- [Migration Guide](./MIGRATION.md) - Upgrading to multi-framework
- [Design Document](./MULTI-FRAMEWORK-DESIGN.md) - Design principles
