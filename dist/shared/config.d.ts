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
/**
 * Transport mode — how this daemon is reached by peers (bd-b7em).
 *  - 'direct' (default): public gatewayUrl via tunnel / public IP / port-forward.
 *      Exactly today's behavior; zero change for existing users.
 *  - 'relay': daemon holds a persistent outbound WebSocket to a relay; messages
 *      route peer→relay→peer. No inbound port / tunnel needed. (Phase 2.)
 *  - 'iroh': QUIC P2P with relay fallback. Opt-in pilot. (Phase 3.)
 *
 * The transport is advertised inside the SIGNED rendezvous registration envelope,
 * so the rendezvous can't claim a transport the keyholder didn't choose. E2E
 * Ed25519 signing is preserved in every mode; any relay is untrusted by design.
 */
export type TransportMode = 'direct' | 'relay' | 'iroh';
export interface TransportConfig {
    mode: TransportMode;
    relay?: {
        url: string;
    };
    iroh?: {
        relayUrl?: string;
    };
    /**
     * bd-maas: multi-transport advertisement (opt-in). When set, the daemon
     * advertises EACH of these modes (a peer reaches us on whichever it prefers),
     * instead of the single `mode`. Absent ⇒ fall back to `mode` (one-element list).
     */
    advertise?: TransportMode[];
    /**
     * bd-maas: preferred mode when WE deliver to a peer that advertises several with
     * no preference of its own is handled by the SENDER default (direct-first). This
     * field orders OUR OWN advertised list so peers know which transport we'd rather
     * receive on. Must be a member of `advertise` (or `mode`); otherwise ignored.
     */
    prefer?: TransportMode;
}
/** One entry in a resolved transport advertisement list (bd-maas). */
export interface TransportEntry {
    mode: TransportMode;
}
export type InboundFederationMode = 'forward' | 'summarize' | 'autonomous' | 'approval-required';
export interface InboundFederationPolicy {
    mode: InboundFederationMode;
}
export type FederatedMessageClass = 'agent-work' | 'human-relay' | 'approval-request' | 'status-update';
export type HumanSurfacingMode = 'always' | 'summary-only' | 'important-only' | 'never';
export type RelayHandlingMode = 'deliver' | 'summarize' | 'approval-required';
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
export type ValidationResult = {
    ok: true;
} | {
    ok: false;
    reason: string;
};
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
export declare function synthesizePersonas(config: OGPConfig): AgentPersona[];
/**
 * Resolve which persona an inbound message is targeting.
 *
 * - Empty / undefined / null `toAgent` → return the first primary persona.
 * - Exact id match → return that persona.
 * - No match → return null (caller should reject with 404 unknown-agent).
 * - Empty personas array → return null (no primary to fall back to).
 *
 * Defensive: returns the first primary if multiple exist (validatePersonas should
 * have caught that, but this function never throws).
 */
export declare function resolveTargetPersona(toAgent: string | null | undefined, personas: AgentPersona[]): AgentPersona | null;
/**
 * Compute the effective `hookAgentId` for a persona — the value that gets
 * passed as `body.agentId` in the POST to OpenClaw's `/hooks/agent`.
 *
 * Defaulting (decision #3 in the design doc):
 * - Explicit `persona.hookAgentId` (non-empty) → that value
 * - Primary persona without explicit override → 'main' (back-compat with
 *   pre-v0.7 daemons that hardcoded `agentId: 'main'`)
 * - Specialist persona without explicit override → `persona.id`
 */
export declare function effectiveHookAgentId(persona: AgentPersona): string;
/**
 * Validate a persona array against the v0.7 invariants:
 * 1. Must have at least one persona
 * 2. Exactly one persona has role: 'primary'
 * 3. All persona ids are unique
 * 4. All persona ids match the format /^[a-z0-9_-]+$/
 *
 * Returns `{ ok: true }` if valid, `{ ok: false, reason: <human-readable> }` otherwise.
 */
export declare function validatePersonas(personas: AgentPersona[]): ValidationResult;
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
    displayName: string;
    humanName?: string;
    agentName?: string;
    organization?: string;
    tags?: string[];
    agents?: AgentPersona[];
    email: string;
    stateDir: string;
    agentComms?: AgentCommsConfig;
    rendezvous?: RendezvousConfig;
    transport?: TransportConfig;
    notifyTarget?: string;
    notifyTargets?: Record<string, string>;
    humanDeliveryTarget?: string;
    delegatedAuthority?: DelegatedAuthorityConfig;
    inboundFederationPolicy?: InboundFederationPolicy;
    agentId?: string;
    platform?: 'openclaw' | 'hermes';
    hermesWebhookUrl?: string;
    hermesWebhookSecret?: string;
    healthCheck?: HealthCheckConfig;
    keychainPath?: string;
    keychainPasswordFile?: string;
}
/**
 * Get the config directory (computed dynamically based on OGP_HOME)
 */
export declare function getConfigDir(): string;
/**
 * Resolve the transport mode for a config. Absent transport block ⇒ 'direct',
 * preserving today's behavior for every existing user (bd-b7em).
 */
export declare function getTransportMode(config: Pick<OGPConfig, 'transport'>): TransportMode;
/**
 * Resolve the ordered transport advertisement list (bd-maas). This is the internal
 * source of truth; `mode`/`advertise`/`prefer` are the user-facing knobs over it.
 *
 * Precedence (Option A, settled 2026-06-11):
 *   1. `transport.advertise` set ⇒ that list, de-duplicated, with `prefer` (if a
 *      member) hoisted to the front and the rest in declaration order.
 *   2. else `transport.mode` ⇒ a one-element list (today's behavior, byte-identical).
 *   3. absent ⇒ `[{ mode: 'direct' }]`.
 *
 * Pure — exported for testing. Never throws; ignores an out-of-list `prefer`.
 */
export declare function resolveTransportList(config: Pick<OGPConfig, 'transport'>): TransportEntry[];
/**
 * Get the config file path (computed dynamically based on OGP_HOME)
 */
export declare function getConfigPath(): string;
export declare function ensureConfigDir(): void;
export declare function loadConfig(): OGPConfig | null;
export declare function saveConfig(config: OGPConfig): void;
export declare function requireConfig(): OGPConfig;
//# sourceMappingURL=config.d.ts.map