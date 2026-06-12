import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
const PERSONA_ID_PATTERN = /^[a-z0-9_-]+$/;
/**
 * Sanitize a string into a valid persona id.
 * Lowercases, replaces non-alphanumeric runs with single dashes, trims dashes.
 * Returns `null` if no valid characters remain.
 */
function sanitizePersonaId(input) {
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
export function synthesizePersonas(config) {
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
export function resolveTargetPersona(toAgent, personas) {
    if (!toAgent || toAgent === '') {
        return personas.find(p => p.role === 'primary') ?? null;
    }
    return personas.find(p => p.id === toAgent) ?? null;
}
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
export function effectiveHookAgentId(persona) {
    if (persona.hookAgentId && persona.hookAgentId.length > 0) {
        return persona.hookAgentId;
    }
    return persona.role === 'primary' ? 'main' : persona.id;
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
export function validatePersonas(personas) {
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
    const ids = new Set();
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
 * Get the config directory (computed dynamically based on OGP_HOME)
 */
export function getConfigDir() {
    return process.env.OGP_HOME ?? path.join(os.homedir(), '.ogp');
}
/**
 * Resolve the transport mode for a config. Absent transport block ⇒ 'direct',
 * preserving today's behavior for every existing user (bd-b7em).
 */
export function getTransportMode(config) {
    return config.transport?.mode ?? 'direct';
}
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
export function resolveTransportList(config) {
    const t = config.transport;
    const advertise = t?.advertise;
    if (advertise && advertise.length > 0) {
        // De-dup preserving declaration order.
        const seen = new Set();
        const ordered = [];
        for (const m of advertise) {
            if (!seen.has(m)) {
                seen.add(m);
                ordered.push(m);
            }
        }
        // Hoist `prefer` to the front when it's actually in the advertised set.
        const prefer = t?.prefer;
        if (prefer && seen.has(prefer)) {
            const rest = ordered.filter((m) => m !== prefer);
            return [prefer, ...rest].map((mode) => ({ mode }));
        }
        return ordered.map((mode) => ({ mode }));
    }
    const mode = t?.mode ?? 'direct';
    return [{ mode }];
}
/**
 * Get the config file path (computed dynamically based on OGP_HOME)
 */
export function getConfigPath() {
    return path.join(getConfigDir(), 'config.json');
}
export function ensureConfigDir() {
    const configDir = getConfigDir();
    if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
    }
}
export function loadConfig() {
    try {
        const configFile = getConfigPath();
        if (!fs.existsSync(configFile)) {
            return null;
        }
        const data = fs.readFileSync(configFile, 'utf-8');
        return JSON.parse(data);
    }
    catch (error) {
        console.error('Failed to load config:', error);
        return null;
    }
}
export function saveConfig(config) {
    ensureConfigDir();
    const configFile = getConfigPath();
    fs.writeFileSync(configFile, JSON.stringify(config, null, 2), 'utf-8');
}
export function requireConfig() {
    const config = loadConfig();
    if (!config) {
        console.error('No configuration found. Run "ogp setup" first.');
        process.exit(1);
    }
    return config;
}
//# sourceMappingURL=config.js.map