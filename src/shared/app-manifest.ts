/**
 * OGP App manifest (`ogp-app.json`) schema + validation.
 *
 * An App is a declarative bundle that references the OGP capabilities it uses
 * (intents/projects/skills) and declares where its own output lives. The
 * manifest ships in the App's own repo; OGP reads and validates it on install
 * and when advertising/browsing over federation.
 *
 * Spec: docs/superpowers/specs/2026-06-13-ogp-apps-layer-spec.md
 *
 * This module is PURE — no filesystem or network I/O — so it is trivially
 * testable and reusable from both the CLI (install) and the daemon (advertise).
 */

/** A skill the App installs (and runs) so that "install = usable". */
export interface AppSkillInstall {
  /** Skill name as it will appear once installed (e.g. "signal-contribute"). */
  name: string;
  /** Repo-relative path to the install script. Must not escape the repo root. */
  install: string;
}

export interface AppPublisher {
  name: string;
  /** ed25519 public key, hex-encoded. Used to verify advertised manifests. */
  key: string;
}

/** The validated shape of an `ogp-app.json` file. */
export interface AppManifest {
  schemaVersion: number;
  id: string;
  name: string;
  description?: string;
  version: string;
  uses_intents: string[];
  uses_projects?: string[];
  installs_skills?: AppSkillInstall[];
  /** Honesty field: the external surface this App owns (a site, API, etc.). */
  published_output?: string;
  /** Optional health surface. */
  status_endpoint?: string | null;
  publisher?: AppPublisher;
  /** Forward-compat: unknown top-level fields are preserved opaque. */
  [extra: string]: unknown;
}

/**
 * P5: How an App is advertised to peers. Includes the full manifest plus the
 * publisher's public key so browsers can verify the source before install.
 */
export interface AppAdvertisement {
  manifest: AppManifest;
  publisherKey: string;
  advertisedAt: string;
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  /** The normalized manifest, present only when ok === true. */
  manifest?: AppManifest;
}

/** The schemaVersion this OGP build understands. */
export const APP_MANIFEST_SCHEMA_VERSION = 1;

const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;       // kebab-case
const HEX_RE = /^[0-9a-f]+$/i;
const MAX_ID_LEN = 64;

/** A relative path is "safe" if it stays inside the repo root: not absolute,
 *  no `..` segment, no leading slash, no Windows drive/UNC prefix. */
export function isSafeRelativePath(p: string): boolean {
  if (typeof p !== 'string' || p.length === 0) return false;
  if (p.startsWith('/') || p.startsWith('\\')) return false;       // absolute (posix/UNC)
  if (/^[a-zA-Z]:/.test(p)) return false;                          // windows drive
  // Reject any `..` path segment (handles a/../b, ../a, a/.., and backslash variants).
  const segments = p.split(/[/\\]/);
  if (segments.some((s) => s === '..')) return false;
  return true;
}

/**
 * Validate a parsed `ogp-app.json` object against the spec. Returns every
 * failing rule rather than throwing on the first, so callers can show a
 * complete error list. Never throws.
 */
export function validateManifest(raw: unknown): ValidationResult {
  const errors: string[] = [];

  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, errors: ['manifest must be a JSON object'] };
  }
  const m = raw as Record<string, unknown>;

  // schemaVersion
  if (typeof m.schemaVersion !== 'number' || !Number.isInteger(m.schemaVersion)) {
    errors.push('schemaVersion is required and must be an integer');
  } else if (m.schemaVersion !== APP_MANIFEST_SCHEMA_VERSION) {
    errors.push(
      `unsupported schemaVersion ${m.schemaVersion} (this build supports ${APP_MANIFEST_SCHEMA_VERSION})`
    );
  }

  // id
  if (typeof m.id !== 'string' || m.id.length === 0) {
    errors.push('id is required');
  } else {
    if (m.id.length > MAX_ID_LEN) errors.push(`id must be <= ${MAX_ID_LEN} characters`);
    if (!ID_RE.test(m.id)) errors.push('id must be kebab-case ([a-z0-9] segments joined by "-")');
  }

  // name
  if (typeof m.name !== 'string' || m.name.length === 0) {
    errors.push('name is required');
  }

  // version
  if (typeof m.version !== 'string' || m.version.length === 0) {
    errors.push('version is required');
  }

  // uses_intents
  if (!Array.isArray(m.uses_intents) || m.uses_intents.length === 0) {
    errors.push('uses_intents is required and must be a non-empty array');
  } else if (!m.uses_intents.every((i) => typeof i === 'string' && i.length > 0)) {
    errors.push('uses_intents must contain only non-empty strings');
  }

  // uses_projects (optional)
  if (m.uses_projects !== undefined) {
    if (!Array.isArray(m.uses_projects) || !m.uses_projects.every((p) => typeof p === 'string' && p.length > 0)) {
      errors.push('uses_projects must be an array of non-empty strings');
    }
  }

  // installs_skills (optional)
  if (m.installs_skills !== undefined) {
    if (!Array.isArray(m.installs_skills)) {
      errors.push('installs_skills must be an array');
    } else {
      m.installs_skills.forEach((s, idx) => {
        if (s === null || typeof s !== 'object' || Array.isArray(s)) {
          errors.push(`installs_skills[${idx}] must be an object`);
          return;
        }
        const skill = s as Record<string, unknown>;
        if (typeof skill.name !== 'string' || skill.name.length === 0) {
          errors.push(`installs_skills[${idx}].name is required`);
        }
        if (typeof skill.install !== 'string' || skill.install.length === 0) {
          errors.push(`installs_skills[${idx}].install is required`);
        } else if (!isSafeRelativePath(skill.install)) {
          errors.push(`installs_skills[${idx}].install must be a repo-relative path (no "..", no absolute paths)`);
        }
      });
    }
  }

  // published_output (optional)
  if (m.published_output !== undefined && typeof m.published_output !== 'string') {
    errors.push('published_output must be a string URL');
  }

  // publisher (optional, but if present must be well-formed)
  if (m.publisher !== undefined) {
    if (m.publisher === null || typeof m.publisher !== 'object' || Array.isArray(m.publisher)) {
      errors.push('publisher must be an object');
    } else {
      const pub = m.publisher as Record<string, unknown>;
      if (typeof pub.name !== 'string' || pub.name.length === 0) {
        errors.push('publisher.name is required when publisher is present');
      }
      if (typeof pub.key !== 'string' || pub.key.length === 0) {
        errors.push('publisher.key is required when publisher is present');
      } else if (!HEX_RE.test(pub.key)) {
        errors.push('publisher.key must be a hex-encoded ed25519 public key');
      }
    }
  }

  if (errors.length > 0) return { ok: false, errors };

  // Valid: return the object as a typed manifest. Unknown fields are preserved
  // opaque via the index signature (forward-compat).
  return { ok: true, errors: [], manifest: m as AppManifest };
}
