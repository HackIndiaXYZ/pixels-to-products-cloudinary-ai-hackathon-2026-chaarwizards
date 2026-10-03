/**
 * Canonical state enumerations shared across services.
 *
 * Each set is declared once as a `readonly` tuple so it can back both a Zod
 * `z.enum(...)` (runtime validation) and a TypeScript union (compile-time
 * safety) without drift. Values mirror the `CHECK` constraints in
 * `docs/architecture/DATABASE_SCHEMA.md`; changing one here without changing the
 * migration is a bug.
 */

/** `assets.upload_status` — capture lifecycle as persisted by the API. */
export const ASSET_LIFECYCLE_STATES = ['pending', 'verified', 'flagged'] as const;
export type AssetLifecycleState = (typeof ASSET_LIFECYCLE_STATES)[number];

/** `assets.asset_type`. */
export const ASSET_TYPES = ['image', 'video'] as const;
export type AssetType = (typeof ASSET_TYPES)[number];

/** `assets.phase` — before/after capture phase. */
export const ASSET_PHASES = ['before', 'after'] as const;
export type AssetPhase = (typeof ASSET_PHASES)[number];

/**
 * Three-state integrity verdict (`integrity_state` in Postgres, system invariants).
 * Only `fail` blocks a report; `unknown` must never be surfaced as `pass`.
 */
export const VERIFICATION_STATES = ['pass', 'fail', 'unknown'] as const;
export type VerificationState = (typeof VERIFICATION_STATES)[number];

/**
 * Provenance of the capture signature. A server-side fallback is honestly
 * `server`; it must never be mislabelled as `device` .
 */
export const SIGNATURE_TIERS = ['device', 'server'] as const;
export type SignatureTier = (typeof SIGNATURE_TIERS)[number];

/** Background job lifecycle for pairing / enrichment / detection workers. */
export const JOB_STATES = ['queued', 'active', 'completed', 'failed', 'retrying'] as const;
export type JobState = (typeof JOB_STATES)[number];

/** `orgs.type`. */
export const ORG_TYPES = ['government', 'ngo', 'partner', 'funder'] as const;
export type OrgType = (typeof ORG_TYPES)[number];

/** Role model , resolved from the verified JWT only. */
export const ROLES = ['platform_admin', 'org_admin', 'member', 'viewer'] as const;
export type Role = (typeof ROLES)[number];

/** Roles an invite token may grant — never `platform_admin`. */
export const INVITE_ROLES = ['org_admin', 'member', 'viewer'] as const;
export type InviteRole = (typeof INVITE_ROLES)[number];

/** `model_registry.status` . */
export const MODEL_STATUSES = ['trained', 'prebuilt', 'unsupported'] as const;
export type ModelStatus = (typeof MODEL_STATUSES)[number];

/**
 * `change_events.status` (Phase 7). `detected` carries a CV metric; `failed`
 * persists a detection that could not run, with a reason (§3.6 — never a silent
 * drop); `manual` is a human-declared link (no CV metric); `split` is a manual
 * unlink.
 */
export const CHANGE_EVENT_STATUSES = ['detected', 'failed', 'manual', 'split'] as const;
export type ChangeEventStatus = (typeof CHANGE_EVENT_STATUSES)[number];

/** GPS fix provider recorded at capture. */
export const GPS_PROVIDERS = ['gps', 'network', 'fused', 'passive'] as const;
export type GpsProvider = (typeof GPS_PROVIDERS)[number];

/** `evidence_packages.status`. */
export const EVIDENCE_PACKAGE_STATES = ['draft', 'finalized', 'exported'] as const;
export type EvidencePackageState = (typeof EVIDENCE_PACKAGE_STATES)[number];

/** `report_manifest_entries.role`. */
export const MANIFEST_ROLES = ['photo', 'diff', 'map', 'chart', 'video_clip', 'qr'] as const;
export type ManifestRole = (typeof MANIFEST_ROLES)[number];

/** `audit_logs.actor_type`. */
export const AUDIT_ACTOR_TYPES = ['system', 'user', 'ml_model', 'device'] as const;
export type AuditActorType = (typeof AUDIT_ACTOR_TYPES)[number];
