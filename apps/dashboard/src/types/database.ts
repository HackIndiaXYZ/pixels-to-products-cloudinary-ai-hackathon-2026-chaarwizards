/* Panchnama AI — Postgres types, transcribed from the supplied migration ground truth.
   Nothing here is invented: every column name, nullability, and CHECK constraint mirrors the schema. */

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

/* Postgres `bigint` is returned by PostgREST as a JSON number or, for values beyond
   2^53, as a string. Both are accepted wherever a bigint column is read. */
export type BigInt = number | string;

/* ── enum unions ─────────────────────────────────────────────────────────── */

export type IntegrityState = 'pass' | 'fail' | 'unknown';

export type AssetVerification = 'pending' | 'passed' | 'failed' | 'unknown';
export type UploadStatus = 'pending' | 'verified' | 'flagged';
export type AssetType = 'image' | 'video';
export type ProjectPhase = 'before' | 'after';
export type GpsProvider = 'gps' | 'network' | 'fused' | 'passive';
export type SignatureTier = 'device' | 'server';
export type OrgType = 'government' | 'ngo' | 'partner' | 'funder';
export type InviteRole = 'org_admin' | 'member' | 'viewer';
export type Role = 'platform_admin' | 'org_admin' | 'member' | 'viewer';
export type DetectionMethod = 'cv_model_forestry' | 'manual';
export type EvidencePackageStatus = 'draft' | 'finalized' | 'exported';
export type ManifestRole = 'photo' | 'diff' | 'map' | 'chart' | 'video_clip' | 'qr';
export type AuditAction =
  | 'upload'
  | 'transform'
  | 'tag'
  | 'pair'
  | 'detect'
  | 'package'
  | 'export'
  | 'verify';
export type AuditActorType = 'system' | 'user' | 'ml_model' | 'device';
export type ModelStatus = 'trained' | 'prebuilt' | 'unsupported';
export type SyncLastStatus = 'ok' | 'partial' | 'failed';

/* ── PostGIS ─────────────────────────────────────────────────────────────── */

export interface GeoPoint {
  type: 'Point';
  coordinates: [number, number];
}

/** `projects.geometry` is a PostGIS polygon column. PostgREST serves a geometry column as a GeoJSON
 *  object, and the same value can also arrive JSON-encoded, so the column is kept verbatim in
 *  either form. It is projected to a map waypoint by `toProjectWaypointModel` in `lib/models`;
 *  nothing here asserts a coordinate that the row did not carry. */
export type ProjectGeometry = string | JsonObject | null;

/* ── orgs ────────────────────────────────────────────────────────────────── */

export interface Org {
  id: string;
  name: string;
  type: OrgType;
  settings: JsonObject;
  quota_bytes: BigInt | null;
  bytes_used: BigInt | null;
  retention_years: number | null;
  created_at: string;
}

/* ── invite_tokens ───────────────────────────────────────────────────────── */

export interface InviteToken {
  id: string;
  org_id: string;
  email: string;
  role: InviteRole;
  token_hash: string;
  expires_at: string;
  used_at: string | null;
  redeemed_by: string | null;
}

/* ── projects ────────────────────────────────────────────────────────────── */

export interface Project {
  id: string;
  org_id: string;
  name: string;
  sector: string;
  geometry: ProjectGeometry;
  start_date: string | null;
  end_date: string | null;
  config: JsonObject;
  parent_project_id: string | null;
}

/* ── assets ──────────────────────────────────────────────────────────────── */

export interface Asset {
  id: string;
  project_id: string;
  org_id: string;
  cloudinary_public_id: string;
  cloudinary_asset_id: string | null;
  asset_type: AssetType;
  device_capture_timestamp: string;
  device_commit_hash: string;
  device_id: string;
  device_public_key: string;
  capture_signature: string;
  device_monotonic_ms: BigInt | null;
  ntp_offset_seconds: number | null;
  gps_point: GeoPoint | null;
  gps_accuracy_meters: number | null;
  gps_altitude: number | null;
  gps_provider: GpsProvider | null;
  gps_timestamp: string | null;
  caption: string | null;
  caption_signature: string | null;
  caption_language: string | null;
  caption_created_at: string | null;
  exif: JsonObject | null;
  exif_hash: string;
  sha256_hash: string;
  duration_seconds: number | null;
  keyframe_timestamps: number[] | null;
  keyframe_cloudinary_ids: string[] | null;
  thumbnail_cloudinary_id: string | null;
  ai_tags: JsonValue;
  custom_metadata: JsonObject | null;
  phash: string | null;
  dominant_colors: string[] | null;
  cloudinary_quality_score: number | null;
  face_count: number | null;
  cloudinary_metadata_at: string | null;
  observation_type: string | null;
  phase: ProjectPhase | null;
  app_version: string | null;
  notes: string | null;
  server_upload_timestamp: string | null;
  server_received_at: string | null;
  upload_started_at: string | null;
  signature_tier: SignatureTier | null;
  verification: AssetVerification;
  verified_at: string | null;
  quarantined_at: string | null;
  exif_verified_at: string | null;
  caption_verified_at: string | null;
  upload_status: UploadStatus;
  created_at: string;
}

/* ── observations ────────────────────────────────────────────────────────── */

export interface Observation {
  id: string;
  asset_id: string;
  project_id: string;
  org_id: string;
  observer_id: string | null;
  observation_type: string | null;
  metrics: JsonObject;
  notes: string | null;
  created_at: string;
}

/* ── change_events ───────────────────────────────────────────────────────── */

export interface ChangeEvent {
  id: string;
  project_id: string;
  org_id: string;
  before_asset_id: string | null;
  after_asset_id: string | null;
  change_type: string | null;
  change_metrics: JsonObject;
  detection_method: DetectionMethod | null;
  model_version: string;
  confidence: number | null;
  diff_asset_cloudinary_id: string | null;
  gps_distance_meters: number | null;
  time_difference_hours: number | null;
  created_at: string;
}

/** A "paired" change event has both `before_asset_id` and `after_asset_id` non-null. */
export function isPairedChangeEvent(event: ChangeEvent): boolean {
  return event.before_asset_id !== null && event.after_asset_id !== null;
}

/* ── evidence_packages (the report record; there is no `reports` table) ───── */

export interface EvidencePackage {
  id: string;
  project_id: string;
  org_id: string;
  name: string;
  asset_ids: string[];
  change_event_ids: string[];
  report_cloudinary_url: string | null;
  report_html_url: string | null;
  template_id: string | null;
  template_version: string | null;
  byte_size: BigInt | null;
  audit_trail: JsonObject | null;
  status: EvidencePackageStatus;
  generated_at: string | null;
}

/* ── report_manifest_entries (the SHA-256 evidence manifest) ──────────────── */

export interface ReportManifestEntry {
  id: string;
  evidence_package_id: string;
  org_id: string;
  ordinal: number;
  role: ManifestRole;
  cloudinary_public_id: string;
  derivative_public_id: string | null;
  sha256_hash: string;
  byte_size: BigInt | null;
  verified_at: string | null;
  created_at: string;
}

/* ── audit_logs (hash-chained, partitioned by hashed_at) ─────────────────── */

export interface AuditLog {
  id: string;
  asset_id: string | null;
  change_event_id: string | null;
  evidence_package_id: string | null;
  action: AuditAction;
  actor_type: AuditActorType;
  actor_id: string | null;
  details: JsonObject | null;
  previous_hash: string | null;
  current_hash: string;
  hashed_at: string;
  details_canonical: string | null;
  created_at: string;
}

/* ── asset_derivatives (the lineage graph) ───────────────────────────────── */

export interface AssetDerivative {
  id: string;
  parent_asset_id: string;
  org_id: string;
  transformation: string;
  kind: string | null;
  public_id: string;
  is_generative: boolean;
  cloudinary_asset_id: string | null;
  cloudinary_version: string | null;
  byte_size: BigInt | null;
  sha256_hash: string | null;
  created_at: string;
}

/* ── model_registry (reference data, not tenant data) ────────────────────── */

export interface ModelRegistryEntry {
  id: string;
  key: string;
  version: string;
  sector: string;
  weights_uri: string | null;
  status: ModelStatus;
  metrics: JsonObject | null;
  created_at: string;
}

/* ── sync_state ──────────────────────────────────────────────────────────── */

export interface SyncState {
  id: string;
  org_id: string;
  scope: string;
  cursor: string | null;
  last_run_at: string | null;
  last_status: SyncLastStatus | null;
  details: JsonObject | null;
  created_at: string;
  updated_at: string | null;
}

/* ── report_templates ────────────────────────────────────────────────────────
   Referenced by evidence_packages.template_id. The table ships with no seed rows and
   the brief inlines no column list for it, so no column is asserted here beyond the
   primary key the foreign key proves. Unmodelled columns are read as JsonValue and the
   template picker renders its empty state regardless. */
export interface ReportTemplate {
  id: string;
  [column: string]: JsonValue;
}

/* ── RPC surface ─────────────────────────────────────────────────────────── */

export interface SearchAssetsArgs {
  p_q?: string | null;
  p_bbox?: [number, number, number, number] | null;
  p_date_from?: string | null;
  p_date_to?: string | null;
  p_tags?: string[] | null;
  p_gps_accuracy_max?: number | null;
  p_asset_type?: AssetType | null;
  p_phase?: ProjectPhase | null;
  p_limit?: number;
  p_offset?: number;
}

/** Row shape of `search_assets`. It deliberately has no `verification` column. */
export interface SearchAssetsRow {
  id: string;
  project_id: string;
  cloudinary_public_id: string;
  asset_type: AssetType;
  device_capture_timestamp: string;
  gps_point: GeoPoint | null;
  gps_accuracy_meters: number | null;
  gps_provider: GpsProvider | null;
  caption: string | null;
  ai_tags: JsonValue;
  observation_type: string | null;
  phase: ProjectPhase | null;
  upload_status: UploadStatus;
}

export interface SearchAssetsResult {
  data: SearchAssetsRow[];
  total_matched: number;
  truncated: boolean;
  facet_counts: { phase: Record<string, number> };
  next_cursor: number | null;
}

export const SEARCH_ASSETS_LIMIT_MAX = 100;
export const SEARCH_ASSETS_HARD_ROW_CAP = 1000;

/** `asset_integrity` after the API route strips `crypto_inputs`. */
export interface AssetIntegrity {
  asset_id: string;
  device_capture_timestamp: string | null;
  server_upload_timestamp: string | null;
  server_received_at: string | null;
  clock_drift_seconds: number | null;
  gps_accuracy_meters: number | null;
  gps_provider: GpsProvider | null;
  upload_status: UploadStatus | null;
  caption_present: boolean | null;
  caption_signature_present: boolean | null;
  audit_chain_intact: boolean | null;
  sha256_matches_commit: boolean | null;
}

export interface AuditChainResult {
  /** `null` when the RPC could not determine a verdict. A missing verdict is `unknown`, never a
   *  fabricated `fail`. */
  ok: boolean | null;
  checked: number;
  tip_hash: string | null;
  failure: JsonValue;
}

/** One entry of `report_verification_receipt`, referenced by ordinal `index` only. */
export interface VerificationReceiptEntry {
  index: number;
  chain_verified: boolean | null;
  chain_length: number | null;
  tip_hash: string | null;
  failure: JsonValue;
}

export interface VerificationReceipt {
  all_ok: boolean | null;
  entries: VerificationReceiptEntry[];
}

/* ── auth claims ─────────────────────────────────────────────────────────────
   The Postgres custom access token hook hoists app_metadata.org_id → top-level
   `org_id` and app_metadata.role → top-level `app_role`. `role` is reserved and is
   never read as the authorisation claim. */
export interface AppClaims {
  org_id: string | null;
  app_role: Role | null;
  sub: string | null;
  exp: number | null;
}
