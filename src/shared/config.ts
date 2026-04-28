import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

/**
 * Response level for agent-comms
 */
export type ResponseLevel = 'full' | 'summary' | 'escalate' | 'deny' | 'off';

/**
 * Topic policy configuration
 */
export interface TopicPolicy {
  level: ResponseLevel;
  notes?: string;
}

/**
 * Response policy mapping topics to policies
 */
export interface ResponsePolicy {
  [topic: string]: TopicPolicy;
}

/**
 * Agent-comms configuration
 */
export interface AgentCommsConfig {
  globalPolicy: ResponsePolicy;
  defaultLevel: ResponseLevel;
  activityLog: boolean;
}

export interface RendezvousConfig {
  enabled: boolean;
  url: string;
  publicUrl?: string;
}

export type InboundFederationMode =
  | 'forward'
  | 'summarize'
  | 'autonomous'
  | 'approval-required';

export interface InboundFederationPolicy {
  mode: InboundFederationMode;
}

export type FederatedMessageClass =
  | 'agent-work'
  | 'human-relay'
  | 'approval-request'
  | 'status-update';

export type HumanSurfacingMode =
  | 'always'
  | 'summary-only'
  | 'important-only'
  | 'never';

export type RelayHandlingMode =
  | 'deliver'
  | 'summarize'
  | 'approval-required';

/**
 * Rule describing how the local agent may handle a class of federated work.
 * All fields are optional so more specific scopes can override only what changes.
 */
export interface DelegatedAuthorityRule {
  mode?: InboundFederationMode;
  relayMode?: RelayHandlingMode;
  surfaceToHuman?: HumanSurfacingMode;
  allowDirectPeerReply?: boolean;
  notes?: string;
}

/**
 * Policy scope with a default rule plus more specific overrides.
 */
export interface DelegatedAuthorityScope {
  defaultRule: DelegatedAuthorityRule;
  classRules?: Partial<Record<FederatedMessageClass, DelegatedAuthorityRule>>;
  topicRules?: Record<string, DelegatedAuthorityRule>;
}

/**
 * Peer-specific delegated authority override.
 * The key in delegatedAuthority.peers is expected to be the peer ID.
 */
export interface DelegatedAuthorityPeerOverride extends DelegatedAuthorityScope {
  trust?: 'default' | 'trusted' | 'restricted';
}

/**
 * First-class governance model for inbound federated work.
 * This coexists with legacy inboundFederationPolicy during migration.
 */
export interface DelegatedAuthorityConfig {
  global: DelegatedAuthorityScope;
  peers?: Record<string, DelegatedAuthorityPeerOverride>;
}

/**
 * B0032 v0.7.0 — Multi-agent personas
 *
 * A daemon may host multiple addressable agent personas under one Ed25519
 * keypair. Personas are routing metadata, not separate cryptographic
 * identities. See docs/MULTI-AGENT-PERSONAS-DESIGN.md for the full design.
 */
export type AgentPersonaRole = 'primary' | 'specialist';

export interface AgentPersona {
  /** Stable persona identifier. Lowercase, alphanumeric + dash/underscore. Used as routing key. */
  id: string;
  /** Human-readable name. May contain spaces, capitals. */
  displayName: string;
  /**
   * `primary` — the default routing target when an inbound message has no `toAgent` field.
   * Exactly one persona MUST be primary. Other personas are `specialist`.
   */
  role: AgentPersonaRole;
  /** Optional emoji or URL for chat UIs. Pure presentation; not enforced. */
  displayIcon?: string;
  /** Optional free-text description surfaced by `ogp federation peers --show-agents`. */
  description?: string;
  /** Optional capability hints for discoverability. Not enforced. */
  skills?: string[];
  /**
   * Override the framework `agentId` for this persona.
   * Defaults: primary → `'main'` (back-compat with legacy `agentId: 'main'` hook calls),
   * specialist → `id`.
   */
  hookAgentId?: string;
}

export type ValidationResult =
  | { ok: true }
  | { ok: false; reason: string };

const PERSONA_ID_PATTERN = /^[a-z0-9_-]+$/;

/**
 * Sanitize a string into a valid persona id.
 * Lowercases, replaces non-alphanumeric runs with single dashes, trims dashes.
 * Returns `null` if no valid characters remain.
 */
function sanitizePersonaId(input: string): string | null {
  const cleaned = input
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned.length > 0 ? cleaned : null;
}

/**
 * Synthesize the persona list for a config.
 *
 * If `config.agents` is defined and non-empty, returns it as-is.
 *
 * Otherwise synthesizes a single primary persona from legacy fields:
 * - `agentName` provides the displayName and (sanitized) id
 * - falls back to `displayName` if `agentName` is missing
 * - final fallback is id `'main'` so we never produce an empty id
 *
 * The synthesized primary always defaults `hookAgentId` to `'main'` to preserve
 * compatibility with pre-v0.7 daemons that hardcoded `agentId: 'main'` in
 * OpenClaw hook calls.
 */
export function synthesizePersonas(config: OGPConfig): AgentPersona[] {
  if (config.agents && config.agents.length > 0) {
    return config.agents;
  }

  const sourceName = config.agentName?.trim() || config.displayName?.trim() || '';
  const synthesizedId = sanitizePersonaId(sourceName) ?? 'main';
  const synthesizedDisplayName = sourceName || 'Agent';

  return [
    {
      id: synthesizedId,
      displayName: synthesizedDisplayName,
      role: 'primary',
      hookAgentId: 'main'
    }
  ];
}

/**
 * Validate a persona array against the v0.7 invariants:
 * 1. Must have at least one persona
 * 2. Exactly one persona has role: 'primary'
 * 3. All persona ids are unique
 * 4. All persona ids match the format /^[a-z0-9_-]+$/
 *
 * Returns `{ ok: true }` if valid, `{ ok: false, reason: <human-readable> }` otherwise.
 */
export function validatePersonas(personas: AgentPersona[]): ValidationResult {
  if (personas.length === 0) {
    return { ok: false, reason: 'persona array is empty (require at least one primary persona)' };
  }

  const primaryCount = personas.filter(p => p.role === 'primary').length;
  if (primaryCount === 0) {
    return { ok: false, reason: 'no primary persona found (exactly one persona must have role: "primary")' };
  }
  if (primaryCount > 1) {
    return { ok: false, reason: `multiple primary personas found (${primaryCount}); exactly one persona must have role: "primary"` };
  }

  const ids = new Set<string>();
  for (const persona of personas) {
    if (!PERSONA_ID_PATTERN.test(persona.id)) {
      return {
        ok: false,
        reason: `invalid persona id format '${persona.id}' (must match /^[a-z0-9_-]+$/)`
      };
    }
    if (ids.has(persona.id)) {
      return { ok: false, reason: `duplicate persona id '${persona.id}' (ids must be unique)` };
    }
    ids.add(persona.id);
  }

  return { ok: true };
}

/**
 * Health check configuration for peer heartbeat monitoring
 */
export interface HealthCheckConfig {
  /** Interval between health checks in milliseconds (default: 300000 = 5 minutes) */
  intervalMs?: number;
  /** Timeout for each health check request in milliseconds (default: 10000 = 10 seconds) */
  timeoutMs?: number;
  /** Number of consecutive failures before marking peer unhealthy (default: 3) */
  maxConsecutiveFailures?: number;
  /**
   * Recency multiplier (Issue #3): how many heartbeat intervals back counts as
   * "recent" inbound contact when deriving healthState. Default: 2.
   */
  recencyMultiplier?: number;
}

export interface OGPConfig {
  daemonPort: number;
  openclawUrl: string;
  openclawToken: string;
  openclawHooksToken?: string;
  gatewayUrl: string;
  // Identity fields
  displayName: string;        // Legacy: kept for backward compatibility
  humanName?: string;         // Human operator name (e.g., "David Proctor")
  agentName?: string;         // Legacy: synthesized into one primary persona when `agents` is unset
  organization?: string;      // Organization (e.g., "Trilogy", "AICOE")
  tags?: string[];           // Flexible tags (e.g., ["work", "production", "client-trilogy"])
  // B0032 v0.7.0: Multi-agent personas. When set and non-empty, replaces legacy
  // single-agent identity with N addressable personas under one keypair.
  // Use `synthesizePersonas(config)` for the runtime fallback that handles both shapes.
  agents?: AgentPersona[];
  email: string;
  stateDir: string;
  // Agent-comms configuration (optional)
  agentComms?: AgentCommsConfig;
  // Rendezvous configuration (optional)
  rendezvous?: RendezvousConfig;
  // Legacy: single notification target for all agents (backward compatibility)
  notifyTarget?: string;
  // Per-agent notification targets: { "main": "telegram:...", "scribe": "telegram:..." }
  notifyTargets?: Record<string, string>;
  // Explicit human-facing delivery target for OGP-triggered followups.
  // Examples: "telegram:123456789" or "agent:main:telegram:direct:123456789"
  humanDeliveryTarget?: string;
  // First-class governance model for delegated human/agent authority.
  // Preferred long-term representation for inbound federated behavior.
  delegatedAuthority?: DelegatedAuthorityConfig;
  // Policy describing how the local agent should handle inbound federated requests.
  // Legacy coarse-grained field retained for backward compatibility while the
  // delegatedAuthority model is rolled out through setup/runtime.
  inboundFederationPolicy?: InboundFederationPolicy;
  // BUILD-115: Agent-specific notification routing — which agent owns this gateway
  agentId?: string;

  // Platform selection (optional, defaults to 'openclaw' for backward compatibility)
  platform?: 'openclaw' | 'hermes';

  // Hermes-specific configuration (optional, only used when platform === 'hermes')
  hermesWebhookUrl?: string;
  hermesWebhookSecret?: string;

  // Health check configuration (optional)
  healthCheck?: HealthCheckConfig;

  // macOS dedicated-keychain support for headless deployments.
  // When set, all `security` invocations target this keychain instead of the
  // login keychain. If keychainPasswordFile is also set, the keychain is
  // unlocked at daemon start using the password read from that file.
  // Env vars OGP_KEYCHAIN_PATH and OGP_KEYCHAIN_PASSWORD_FILE override these.
  keychainPath?: string;
  keychainPasswordFile?: string;
}

/**
 * Get the config directory (computed dynamically based on OGP_HOME)
 */
export function getConfigDir(): string {
  return process.env.OGP_HOME ?? path.join(os.homedir(), '.ogp');
}

/**
 * Get the config file path (computed dynamically based on OGP_HOME)
 */
export function getConfigPath(): string {
  return path.join(getConfigDir(), 'config.json');
}

export function ensureConfigDir(): void {
  const configDir = getConfigDir();
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
}

export function loadConfig(): OGPConfig | null {
  try {
    const configFile = getConfigPath();
    if (!fs.existsSync(configFile)) {
      return null;
    }
    const data = fs.readFileSync(configFile, 'utf-8');
    return JSON.parse(data) as OGPConfig;
  } catch (error) {
    console.error('Failed to load config:', error);
    return null;
  }
}

export function saveConfig(config: OGPConfig): void {
  ensureConfigDir();
  const configFile = getConfigPath();
  fs.writeFileSync(configFile, JSON.stringify(config, null, 2), 'utf-8');
}

export function requireConfig(): OGPConfig {
  const config = loadConfig();
  if (!config) {
    console.error('No configuration found. Run "ogp setup" first.');
    process.exit(1);
  }
  return config;
}
