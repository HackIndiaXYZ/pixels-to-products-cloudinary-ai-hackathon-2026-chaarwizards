/**
 * Zod schemas mirroring the persisted shapes in
 * `docs/architecture/DATABASE_SCHEMA.md`, plus the inferred domain types.
 *
 * These schemas are the single runtime trust boundary shared across services
 * (AGENTS.md §4): the API validates HTTP input against them, workers validate
 * queue messages, and every consumer imports the inferred type rather than
 * re-declaring it. Enum values come from `./enums` so a schema can never drift
 * from the database `CHECK` constraint.
 *
 * Zod strips unknown object keys by default, so a payload carrying an extra
 * field parses to a clean object rather than smuggling the field downstream.
 */
import { z } from 'zod';
import {
  ASSET_LIFECYCLE_STATES,
  ASSET_PHASES,
  ASSET_TYPES,
  AUDIT_ACTOR_TYPES,
  EVIDENCE_PACKAGE_STATES,
  GPS_PROVIDERS,
  MANIFEST_ROLES,
  MODEL_STATUSES,
  ORG_TYPES,
  ROLES,
  SIGNATURE_TIERS,
} from './enums.js';

const uuid = z.uuid();
const isoDateTime = z.iso.datetime({ offset: true });
const isoDate = z.iso.date();

/** `orgs`. */
export const OrgSchema = z.object({
  id: uuid,
  name: z.string().min(1),
  type: z.enum(ORG_TYPES).nullable().optional(),
  settings: z.record(z.string(), z.unknown()).default({}),
  quota_bytes: z.number().int().nonnegative(),
  bytes_used: z.number().int().nonnegative(),
  retention_years: z.number().int().positive(),
  created_at: isoDateTime,
});
export type Org = z.infer<typeof OrgSchema>;

/**
 * One entry in `projects.config.observation_types[]`. `model` and `gps_radius`
 * are mandatory — the Phase 1 config gate rejects an entry missing either
 * (BUILD_ORDER Phase 1), because an observation type with no model has no way to
 * produce a metric and one with no radius cannot be clustered for pairing.
 */
export const ObservationTypeConfigSchema = z.object({
  type: z.string().min(1),
  label: z.string().min(1).optional(),
  model: z.string().min(1),
  gps_radius: z.number().positive(),
  phase_field: z.string().min(1).optional(),
});
export type ObservationTypeConfig = z.infer<typeof ObservationTypeConfigSchema>;

/** `projects.config`. */
export const ProjectConfigSchema = z.object({
  observation_types: z.array(ObservationTypeConfigSchema).default([]),
  metrics_schema: z.record(z.string(), z.string()).optional(),
  report_template: z.string().min(1).optional(),
});
export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;

/** `projects`. */
export const ProjectSchema = z.object({
  id: uuid,
  org_id: uuid,
  name: z.string().min(1),
  sector: z.string().nullable().optional(),
  start_date: isoDate.nullable().optional(),
  end_date: isoDate.nullable().optional(),
  config: ProjectConfigSchema.default({ observation_types: [] }),
  parent_project_id: uuid.nullable().optional(),
  created_at: isoDateTime,
});
export type Project = z.infer<typeof ProjectSchema>;

/** `assets` — evidence row. Integrity columns are immutable after insert (§3.1). */
export const AssetSchema = z.object({
  id: uuid,
  project_id: uuid,
  org_id: uuid,
  cloudinary_public_id: z.string().min(1),
  cloudinary_asset_id: z.string().nullable().optional(),
  asset_type: z.enum(ASSET_TYPES).nullable().optional(),

  // Device capture provenance (immutable).
  device_capture_timestamp: isoDateTime,
  device_commit_hash: z.string().min(1),
  device_id: z.string().min(1),
  device_public_key: z.string().min(1),
  capture_signature: z.string().min(1),

  // GPS.
  gps_accuracy_meters: z.number().nullable().optional(),
  gps_altitude: z.number().nullable().optional(),
  gps_provider: z.enum(GPS_PROVIDERS).nullable().optional(),
  gps_timestamp: isoDateTime.nullable().optional(),

  // Caption (optional, signed).
  caption: z.string().nullable().optional(),
  caption_signature: z.string().nullable().optional(),
  caption_language: z.string().nullable().optional(),
  caption_created_at: isoDateTime.nullable().optional(),

  // Frozen EXIF + hashes.
  exif: z.record(z.string(), z.unknown()).nullable().optional(),
  exif_hash: z.string().min(1),
  sha256_hash: z.string().min(1),

  // Integrity timing (§3.7).
  upload_started_at: isoDateTime.nullable().optional(),
  ntp_offset_seconds: z.number().nullable().optional(),
  signature_tier: z.enum(SIGNATURE_TIERS).nullable().optional(),
  server_received_at: isoDateTime.nullable().optional(),
  cloudinary_created_at: isoDateTime.nullable().optional(),

  // Observation context.
  observation_type: z.string().nullable().optional(),
  phase: z.enum(ASSET_PHASES).nullable().optional(),
  app_version: z.string().nullable().optional(),

  upload_status: z.enum(ASSET_LIFECYCLE_STATES).default('pending'),
  created_at: isoDateTime,
});
export type Asset = z.infer<typeof AssetSchema>;

/** `asset_derivatives` — append-only Cloudinary lineage (§3.1). */
export const AssetDerivativeSchema = z.object({
  id: uuid,
  parent_asset_id: uuid,
  org_id: uuid,
  transformation: z.string().min(1),
  kind: z.string().nullable().optional(),
  public_id: z.string().min(1),
  is_generative: z.boolean().default(false),
  cloudinary_asset_id: z.string().nullable().optional(),
  cloudinary_version: z.string().nullable().optional(),
  byte_size: z.number().int().nonnegative().nullable().optional(),
  sha256_hash: z.string().nullable().optional(),
  created_at: isoDateTime,
});
export type AssetDerivative = z.infer<typeof AssetDerivativeSchema>;

/** `observations`. */
export const ObservationSchema = z.object({
  id: uuid,
  asset_id: uuid.nullable().optional(),
  project_id: uuid.nullable().optional(),
  org_id: uuid.nullable().optional(),
  observer_id: uuid.nullable().optional(),
  observation_type: z.string().nullable().optional(),
  metrics: z.record(z.string(), z.unknown()).nullable().optional(),
  notes: z.string().nullable().optional(),
  created_at: isoDateTime,
});
export type Observation = z.infer<typeof ObservationSchema>;

/**
 * `change_events`. `model_version` is required (NOT NULL in the DB): a metric
 * must always carry the provenance of the versioned model that produced it
 * (AGENTS.md §3.2).
 */
export const ChangeEventSchema = z.object({
  id: uuid,
  project_id: uuid.nullable().optional(),
  org_id: uuid.nullable().optional(),
  before_asset_id: uuid.nullable().optional(),
  after_asset_id: uuid.nullable().optional(),
  change_type: z.string().nullable().optional(),
  change_metrics: z.record(z.string(), z.unknown()),
  detection_method: z.string().nullable().optional(),
  model_version: z.string().min(1),
  confidence: z.number().nullable().optional(),
  diff_asset_cloudinary_id: z.string().nullable().optional(),
  gps_distance_meters: z.number().nullable().optional(),
  time_difference_hours: z.number().nullable().optional(),
  created_at: isoDateTime,
});
export type ChangeEvent = z.infer<typeof ChangeEventSchema>;

/** One inlined element of a finalized report (`report_manifest_entries`). */
export const ReportManifestEntrySchema = z.object({
  id: z.number().int().nonnegative(),
  evidence_package_id: uuid,
  org_id: uuid,
  ordinal: z.number().int().nonnegative(),
  role: z.enum(MANIFEST_ROLES),
  cloudinary_public_id: z.string().nullable().optional(),
  derivative_public_id: z.string().nullable().optional(),
  sha256_hash: z.string().nullable().optional(),
  byte_size: z.number().int().nonnegative().nullable().optional(),
  verified_at: isoDateTime.nullable().optional(),
  created_at: isoDateTime,
});
export type ReportManifestEntry = z.infer<typeof ReportManifestEntrySchema>;

/**
 * `evidence_packages` — the donor/audit report record. Named `Report` in the
 * domain vocabulary; the manifest entries are its integrity appendix.
 */
export const ReportSchema = z.object({
  id: uuid,
  project_id: uuid.nullable().optional(),
  org_id: uuid.nullable().optional(),
  name: z.string().nullable().optional(),
  asset_ids: z.array(uuid).default([]),
  change_event_ids: z.array(uuid).default([]),
  report_cloudinary_url: z.string().nullable().optional(),
  audit_trail: z.record(z.string(), z.unknown()).nullable().optional(),
  status: z.enum(EVIDENCE_PACKAGE_STATES).default('draft'),
  generated_at: isoDateTime,
});
export type Report = z.infer<typeof ReportSchema>;

/** `audit_logs` — append-only tamper-evident chain (AGENTS.md §3.8). */
export const AuditLogSchema = z.object({
  id: z.number().int().nonnegative(),
  asset_id: uuid.nullable().optional(),
  change_event_id: uuid.nullable().optional(),
  evidence_package_id: uuid.nullable().optional(),
  action: z.string().min(1),
  actor_type: z.enum(AUDIT_ACTOR_TYPES).nullable().optional(),
  actor_id: z.string().nullable().optional(),
  details: z.record(z.string(), z.unknown()).nullable().optional(),
  previous_hash: z.string().nullable().optional(),
  current_hash: z.string().min(1),
  hashed_at: isoDateTime,
  details_canonical: z.string().nullable().optional(),
  created_at: isoDateTime,
});
export type AuditLog = z.infer<typeof AuditLogSchema>;

/** `model_registry` — provenance for every metric-producing model (§3.2/§3.3). */
export const ModelRegistryEntrySchema = z.object({
  id: uuid,
  key: z.string().min(1),
  version: z.string().min(1),
  sector: z.string().min(1),
  weights_uri: z.string().nullable().optional(),
  status: z.enum(MODEL_STATUSES),
  metrics: z.record(z.string(), z.unknown()).default({}),
  created_at: isoDateTime,
});
export type ModelRegistryEntry = z.infer<typeof ModelRegistryEntrySchema>;

/** Role model (AGENTS.md §3.10), for validating a decoded JWT claim set. */
export const RoleSchema = z.enum(ROLES);
