# OGP Test Suite

This directory contains comprehensive unit tests for the OGP multi-framework support features.

## Test Framework

The project uses [Vitest](https://vitest.dev/) as its test framework. Vitest provides:
- Fast execution with native ESM support
- TypeScript support out of the box
- Compatible API with Jest
- Built-in coverage reporting with v8

## Running Tests

```bash
# Run all tests
npm test

# Run tests with coverage report
npm run test:coverage

# Run tests in watch mode
npm test -- --watch

# Run specific test file
npm test -- test/meta-config.test.ts
```

## Test Files

### `meta-config.test.ts`
Tests for the meta configuration system that manages multiple OGP framework installations.

**Coverage:**
- Loading meta config (file exists, file missing, invalid JSON)
- Saving meta config (valid data, creates directory if missing)
- Schema validation (missing fields, invalid types)
- Default values when config doesn't exist
- Optional fields (gatewayUrl, displayName, platform)
- Aliases configuration

**Key test cases:**
- ✓ Returns default config when file doesn't exist
- ✓ Loads and parses valid config file
- ✓ Throws error for invalid JSON
- ✓ Validates required fields: version, frameworks
- ✓ Validates framework fields: id, name, enabled, configDir, daemonPort
- ✓ Creates directory structure on save
- ✓ Prevents saving invalid config

### `framework-detection.test.ts`
Tests for automatic detection of installed AI frameworks (OpenClaw, Hermes, Standalone).

**Coverage:**
- Detection via directory existence
- Detection via command availability
- Port assignment correctness
- Cross-platform command detection (which vs where)
- Preferred framework selection priority

**Key test cases:**
- ✓ Detects OpenClaw when ~/.openclaw exists or command exists
- ✓ Detects Hermes when ~/.hermes exists or command exists
- ✓ Always detects standalone as fallback
- ✓ Assigns correct ports (OpenClaw: 18790, Hermes: 18793)
- ✓ Uses 'where' on Windows, 'which' on Unix
- ✓ Prefers OpenClaw > Hermes > Standalone
- ✓ Returns framework by ID or null if not found

### `framework-selection.test.ts`
Tests for framework selection logic based on --for flag and configuration.

**Coverage:**
- --for flag behavior (explicit selection)
- Alias resolution
- Default framework selection
- Auto-selection with single framework
- OGP_HOME backward compatibility
- Error cases (framework not found, disabled, none configured)
- Multi-framework scenarios

**Key test cases:**
- ✓ Sets OGP_FOR_ALL when --for all is used
- ✓ Selects framework by ID with --for flag
- ✓ Resolves aliases (e.g., 'oc' → 'openclaw')
- ✓ Throws error when framework not found
- ✓ Throws error when framework is disabled
- ✓ Auto-selects single enabled framework
- ✓ Uses default framework when multiple enabled
- ✓ Respects existing OGP_HOME (backward compatibility)
- ✓ Throws error when multiple frameworks but no default

**Priority order tested:**
1. --for flag (highest)
2. Single enabled framework
3. Default framework in meta config
4. Existing OGP_HOME environment variable
5. Error if multiple frameworks with no default

### `migration.test.ts`
Tests for detecting and migrating existing OGP installations to the new multi-framework system.

**Coverage:**
- Detection of existing installations
- Framework type detection from config
- Migration plan generation
- Execution of migration actions (rename, register, create-meta)
- Backup creation and rollback on error
- Default framework selection after migration

**Key test cases:**
- ✓ Returns no migration when meta config exists
- ✓ Detects OpenClaw installation at ~/.ogp
- ✓ Detects Hermes installation at ~/.ogp-hermes
- ✓ Detects standalone based on heuristics
- ✓ Handles both OpenClaw and Hermes together
- ✓ Generates rename action for OpenClaw at ~/.ogp
- ✓ Keeps standalone at ~/.ogp (no rename)
- ✓ Executes rename operations
- ✓ Creates backup before rename
- ✓ Throws error if target already exists
- ✓ Registers frameworks in meta config
- ✓ Sets default to OpenClaw if present, else Hermes

## Coverage Report

Current coverage (as of last run):

```
File               | % Stmts | % Branch | % Funcs | % Lines
-------------------|---------|----------|---------|--------
All files          |   93.71 |    88.99 |     100 |   93.46
framework-detection|     100 |      100 |     100 |     100
meta-config        |     100 |      100 |     100 |     100
migration          |   90.09 |    82.08 |     100 |   89.79
```

## Mocking Strategy

Tests use Vitest's built-in mocking capabilities:

- **File system operations** (`node:fs`): Mocked to avoid actual file I/O
- **Command execution** (`node:child_process`): Mocked to simulate command availability
- **Environment variables** (`node:os`, `process.env`): Mocked for consistent test environment

Mocks are configured before module imports to ensure proper initialization.

## Test Organization

Each test file follows this structure:

1. **Mock setup** - Configure mocks before imports
2. **Imports** - Import modules under test
3. **Test suites** - Organize tests by functionality
4. **beforeEach/afterEach** - Reset mocks and state between tests
5. **Test cases** - Individual test assertions

## Adding New Tests

When adding new tests:

1. Create a new `.test.ts` file in the `test/` directory
2. Set up mocks before imports if needed
3. Use descriptive test names that explain what's being tested
4. Follow the existing patterns for consistency
5. Run tests to ensure they pass
6. Check coverage to ensure adequate test coverage

## Continuous Integration

Tests should be run:
- Before committing changes
- In CI/CD pipeline
- Before releasing new versions

Minimum coverage threshold: 90% for all files.
