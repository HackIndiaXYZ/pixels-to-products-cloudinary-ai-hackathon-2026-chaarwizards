import type {
  Asset,
  AssetDerivative,
  AssetIntegrity,
  AssetType,
  AssetVerification,
  AuditChainResult,
  AuditLog,
  ChangeEvent,
  EvidencePackage,
  GeoPoint,
  JsonObject,
  JsonValue,
  ModelRegistryEntry,
  Org,
  Project,
  ProjectGeometry,
  ReportManifestEntry,
  SearchAssetsResult,
  SearchAssetsRow,
  UploadStatus,
  VerificationReceipt,
  VerificationReceiptEntry,
} from '../../types/database';

/* Narrowing helpers. Every value crossing the PostgREST / RPC boundary passes through one
   of these before it becomes a typed row, so no untyped value reaches application code. */

export function asRecord(raw: unknown): Record<string, unknown> | null {
  return typeof raw === 'object' && raw !== null && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : null;
}

export function asArray(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  const record = asRecord(raw);
  return record === null ? [] : [raw];
}

export function str(raw: unknown): string | null {
  return typeof raw === 'string' ? raw : null;
}

export function requiredStr(raw: unknown): string | null {
  return typeof raw === 'string' && raw.length > 0 ? raw : null;
}

export function num(raw: unknown): number | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string' && raw.trim() !== '') {
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

export function bigInt(raw: unknown): number | string | null {
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string' && raw.trim() !== '') return raw;
  return null;
}

export function bool(raw: unknown): boolean | null {
  return typeof raw === 'boolean' ? raw : null;
}

export function strArray(raw: unknown): string[] {
  return asArray(raw).filter((entry): entry is string => typeof entry === 'string');
}

export function numArray(raw: unknown): number[] {
  return asArray(raw)
    .map(num)
    .filter((entry): entry is number => entry !== null);
}

export function jsonObject(raw: unknown): JsonObject | null {
  return asRecord(raw) as JsonObject | null;
}

export function jsonValue(raw: unknown): JsonValue {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean') return raw;
  return asRecord(raw) as JsonObject ?? null;
}

export function asEnum<T extends string>(raw: unknown, allowed: readonly T[]): T | null {
  return typeof raw === 'string' && (allowed as readonly string[]).includes(raw) ? (raw as T) : null;
}

export const ASSET_TYPES: readonly AssetType[] = ['image', 'video'];
export const VERIFICATIONS: readonly AssetVerification[] = ['pending', 'passed', 'failed', 'unknown'];
export const UPLOAD_STATUSES: readonly UploadStatus[] = ['pending', 'verified', 'flagged'];

export function parseGeoPoint(raw: unknown): GeoPoint | null {
  const record = asRecord(raw);
  if (record === null || record.type !== 'Point') return null;
  const coordinates = record.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;
  const lon = num(coordinates[0]);
  const lat = num(coordinates[1]);
  if (lon === null || lat === null) return null;
  return { type: 'Point', coordinates: [lon, lat] };
}

/* ── search_assets ───────────────────────────────────────────────────────── */

export function parseSearchAssetsRow(raw: unknown): SearchAssetsRow | null {
  const record = asRecord(raw);
  if (record === null) return null;
  const id = requiredStr(record.id);
  if (id === null) return null;
  return {
    id,
    project_id: str(record.project_id) ?? '',
    cloudinary_public_id: str(record.cloudinary_public_id) ?? '',
    asset_type: asEnum(record.asset_type, ASSET_TYPES) ?? 'image',
    device_capture_timestamp: str(record.device_capture_timestamp) ?? '',
    gps_point: parseGeoPoint(record.gps_point),
    gps_accuracy_meters: num(record.gps_accuracy_meters),
    gps_provider: asEnum(record.gps_provider, ['gps', 'network', 'fused', 'passive'] as const),
    caption: str(record.caption),
    ai_tags: jsonValue(record.ai_tags),
    observation_type: str(record.observation_type),
    phase: asEnum(record.phase, ['before', 'after'] as const),
    upload_status: asEnum(record.upload_status, UPLOAD_STATUSES) ?? 'pending',
  };
}

export function parseSearchAssets(raw: unknown): SearchAssetsResult | null {
  const record = asRecord(raw);
  if (record === null) return null;
  const facets = asRecord(record.facet_counts);
  const phaseFacet = asRecord(facets?.phase) ?? {};
  const phaseCounts: Record<string, number> = {};
  for (const [key, value] of Object.entries(phaseFacet)) {
    const parsed = num(value);
    if (parsed !== null) phaseCounts[key] = parsed;
  }
  return {
    data: asArray(record.data)
      .map(parseSearchAssetsRow)
      .filter((row): row is SearchAssetsRow => row !== null),
    total_matched: num(record.total_matched) ?? 0,
    truncated: bool(record.truncated) ?? false,
    facet_counts: { phase: phaseCounts },
    next_cursor: num(record.next_cursor),
  };
}

/* ── asset_integrity ──────────────────────────────────────────────────────────
   `crypto_inputs` is raw EXIF and signature material and is server-only. This parser copies
   only the declared scalar fields into the client model, so the secret never reaches the
   browser bundle even if the route failed to strip it. */

export function parseAssetIntegrity(raw: unknown): AssetIntegrity | null {
  const record = asRecord(raw);
  if (record === null) return null;
  const assetId = requiredStr(record.asset_id);
  if (assetId === null) return null;
  return {
    asset_id: assetId,
    device_capture_timestamp: str(record.device_capture_timestamp),
    server_upload_timestamp: str(record.server_upload_timestamp),
    server_received_at: str(record.server_received_at),
    clock_drift_seconds: num(record.clock_drift_seconds),
    gps_accuracy_meters: num(record.gps_accuracy_meters),
    gps_provider: asEnum(record.gps_provider, ['gps', 'network', 'fused', 'passive'] as const),
    upload_status: asEnum(record.upload_status, UPLOAD_STATUSES),
    caption_present: bool(record.caption_present),
    caption_signature_present: bool(record.caption_signature_present),
    audit_chain_intact: bool(record.audit_chain_intact),
    sha256_matches_commit: bool(record.sha256_matches_commit),
  };
}

export function parseAuditChain(raw: unknown): AuditChainResult | null {
  const record = asRecord(raw);
  if (record === null) return null;
  return {
    /* A missing or non-boolean `ok` stays null so `boolToIntegrity` reports `unknown`. Defaulting
       it to `false` would turn a shape drift into a fabricated integrity failure. */
    ok: bool(record.ok),
    checked: num(record.checked) ?? 0,
    tip_hash: str(record.tip_hash),
    failure: jsonValue(record.failure),
  };
}

/* ── report_verification_receipt ──────────────────────────────────────────────
   A real re-verification against Postgres. Entries are addressed by ordinal `index` only. */

export function parseVerificationReceipt(raw: unknown): VerificationReceipt | null {
  const record = asRecord(raw);
  const source = record === null ? asArray(raw) : (record.entries ?? record.per_asset ?? record.items ?? null);
  const entries: VerificationReceiptEntry[] = asArray(source)
    .map((entry): VerificationReceiptEntry | null => {
      const row = asRecord(entry);
      const index = num(row?.index);
      if (row === null || index === null) return null;
      return {
        index,
        chain_verified: bool(row.chain_verified),
        chain_length: num(row.chain_length),
        tip_hash: str(row.tip_hash),
        failure: jsonValue(row.failure),
      };
    })
    .filter((entry): entry is VerificationReceiptEntry => entry !== null);
  if (record === null && entries.length === 0) return null;
  return { all_ok: record === null ? null : bool(record.all_ok), entries };
}

/* ── table rows ───────────────────────────────────────────────────────────── */

export function parseOrg(raw: unknown): Org | null {
  const record = asRecord(raw);
  const id = requiredStr(record?.id);
  if (record === null || id === null) return null;
  return {
    id,
    name: str(record.name) ?? '',
    type: asEnum(record.type, ['government', 'ngo', 'partner', 'funder'] as const) ?? 'ngo',
    settings: jsonObject(record.settings) ?? {},
    quota_bytes: bigInt(record.quota_bytes),
    bytes_used: bigInt(record.bytes_used),
    retention_years: num(record.retention_years),
    created_at: str(record.created_at) ?? '',
  };
}

/** The polygon column is kept exactly as it arrived: a GeoJSON object, or the same object still
 *  JSON-encoded. Reading it as a string only would discard every real PostGIS value, which is an
 *  object, and silently leave the map with no project locations. A value that is neither form is
 *  `null` and the project simply has no readable geometry. */
export function parseProjectGeometry(raw: unknown): ProjectGeometry {
  if (typeof raw === 'string') return raw;
  return asRecord(raw) as JsonObject | null;
}

export function parseProject(raw: unknown): Project | null {
  const record = asRecord(raw);
  const id = requiredStr(record?.id);
  if (record === null || id === null) return null;
  return {
    id,
    org_id: str(record.org_id) ?? '',
    name: str(record.name) ?? '',
    sector: str(record.sector) ?? '',
    geometry: parseProjectGeometry(record.geometry),
    start_date: str(record.start_date),
    end_date: str(record.end_date),
    config: jsonObject(record.config) ?? {},
    parent_project_id: str(record.parent_project_id),
  };
}

export function parseProjects(raw: unknown): Project[] {
  return asArray(raw)
    .map(parseProject)
    .filter((row): row is Project => row !== null);
}

export function parseAsset(raw: unknown): Asset | null {
  const record = asRecord(raw);
  const id = requiredStr(record?.id);
  if (record === null || id === null) return null;
  return {
    id,
    project_id: str(record.project_id) ?? '',
    org_id: str(record.org_id) ?? '',
    cloudinary_public_id: str(record.cloudinary_public_id) ?? '',
    cloudinary_asset_id: str(record.cloudinary_asset_id),
    asset_type: asEnum(record.asset_type, ASSET_TYPES) ?? 'image',
    device_capture_timestamp: str(record.device_capture_timestamp) ?? '',
    device_commit_hash: str(record.device_commit_hash) ?? '',
    device_id: str(record.device_id) ?? '',
    device_public_key: str(record.device_public_key) ?? '',
    capture_signature: str(record.capture_signature) ?? '',
    device_monotonic_ms: bigInt(record.device_monotonic_ms),
    ntp_offset_seconds: num(record.ntp_offset_seconds),
    gps_point: parseGeoPoint(record.gps_point),
    gps_accuracy_meters: num(record.gps_accuracy_meters),
    gps_altitude: num(record.gps_altitude),
    gps_provider: asEnum(record.gps_provider, ['gps', 'network', 'fused', 'passive'] as const),
    gps_timestamp: str(record.gps_timestamp),
    caption: str(record.caption),
    caption_signature: str(record.caption_signature),
    caption_language: str(record.caption_language),
    caption_created_at: str(record.caption_created_at),
    exif: jsonObject(record.exif),
    exif_hash: str(record.exif_hash) ?? '',
    sha256_hash: str(record.sha256_hash) ?? '',
    duration_seconds: num(record.duration_seconds),
    keyframe_timestamps: record.keyframe_timestamps === null ? null : numArray(record.keyframe_timestamps),
    keyframe_cloudinary_ids:
      record.keyframe_cloudinary_ids === null ? null : strArray(record.keyframe_cloudinary_ids),
    thumbnail_cloudinary_id: str(record.thumbnail_cloudinary_id),
    ai_tags: jsonValue(record.ai_tags),
    custom_metadata: jsonObject(record.custom_metadata),
    phash: str(record.phash),
    dominant_colors: record.dominant_colors === null ? null : strArray(record.dominant_colors),
    cloudinary_quality_score: num(record.cloudinary_quality_score),
    face_count: num(record.face_count),
    cloudinary_metadata_at: str(record.cloudinary_metadata_at),
    observation_type: str(record.observation_type),
    phase: asEnum(record.phase, ['before', 'after'] as const),
    app_version: str(record.app_version),
    notes: str(record.notes),
    server_upload_timestamp: str(record.server_upload_timestamp),
    server_received_at: str(record.server_received_at),
    upload_started_at: str(record.upload_started_at),
    signature_tier: asEnum(record.signature_tier, ['device', 'server'] as const),
    verification: asEnum(record.verification, VERIFICATIONS) ?? 'pending',
    verified_at: str(record.verified_at),
    quarantined_at: str(record.quarantined_at),
    exif_verified_at: str(record.exif_verified_at),
    caption_verified_at: str(record.caption_verified_at),
    upload_status: asEnum(record.upload_status, UPLOAD_STATUSES) ?? 'pending',
    created_at: str(record.created_at) ?? '',
  };
}

export function parseAssets(raw: unknown): Asset[] {
  return asArray(raw)
    .map(parseAsset)
    .filter((row): row is Asset => row !== null);
}

export function parseChangeEvent(raw: unknown): ChangeEvent | null {
  const record = asRecord(raw);
  const id = requiredStr(record?.id);
  if (record === null || id === null) return null;
  return {
    id,
    project_id: str(record.project_id) ?? '',
    org_id: str(record.org_id) ?? '',
    before_asset_id: str(record.before_asset_id),
    after_asset_id: str(record.after_asset_id),
    change_type: str(record.change_type),
    change_metrics: jsonObject(record.change_metrics) ?? {},
    detection_method: asEnum(record.detection_method, ['cv_model_forestry', 'manual'] as const),
    model_version: str(record.model_version) ?? '',
    confidence: num(record.confidence),
    diff_asset_cloudinary_id: str(record.diff_asset_cloudinary_id),
    gps_distance_meters: num(record.gps_distance_meters),
    time_difference_hours: num(record.time_difference_hours),
    created_at: str(record.created_at) ?? '',
  };
}

export function parseChangeEvents(raw: unknown): ChangeEvent[] {
  return asArray(raw)
    .map(parseChangeEvent)
    .filter((row): row is ChangeEvent => row !== null);
}

export function parseEvidencePackage(raw: unknown): EvidencePackage | null {
  const record = asRecord(raw);
  const id = requiredStr(record?.id);
  if (record === null || id === null) return null;
  return {
    id,
    project_id: str(record.project_id) ?? '',
    org_id: str(record.org_id) ?? '',
    name: str(record.name) ?? '',
    asset_ids: strArray(record.asset_ids),
    change_event_ids: strArray(record.change_event_ids),
    report_cloudinary_url: str(record.report_cloudinary_url),
    report_html_url: str(record.report_html_url),
    template_id: str(record.template_id),
    template_version: str(record.template_version),
    byte_size: bigInt(record.byte_size),
    audit_trail: jsonObject(record.audit_trail),
    status: asEnum(record.status, ['draft', 'finalized', 'exported'] as const) ?? 'draft',
    generated_at: str(record.generated_at),
  };
}

export function parseEvidencePackages(raw: unknown): EvidencePackage[] {
  return asArray(raw)
    .map(parseEvidencePackage)
    .filter((row): row is EvidencePackage => row !== null);
}

export function parseManifestEntry(raw: unknown): ReportManifestEntry | null {
  const record = asRecord(raw);
  const id = requiredStr(record?.id);
  const ordinal = num(record?.ordinal);
  if (record === null || id === null || ordinal === null) return null;
  return {
    id,
    evidence_package_id: str(record.evidence_package_id) ?? '',
    org_id: str(record.org_id) ?? '',
    ordinal,
    role: asEnum(record.role, ['photo', 'diff', 'map', 'chart', 'video_clip', 'qr'] as const) ?? 'photo',
    cloudinary_public_id: str(record.cloudinary_public_id) ?? '',
    derivative_public_id: str(record.derivative_public_id),
    sha256_hash: str(record.sha256_hash) ?? '',
    byte_size: bigInt(record.byte_size),
    verified_at: str(record.verified_at),
    created_at: str(record.created_at) ?? '',
  };
}

export function parseManifestEntries(raw: unknown): ReportManifestEntry[] {
  return asArray(raw)
    .map(parseManifestEntry)
    .filter((row): row is ReportManifestEntry => row !== null);
}

export function parseAuditLog(raw: unknown): AuditLog | null {
  const record = asRecord(raw);
  const rawId = record?.id;
  const id =
    typeof rawId === 'number' && Number.isSafeInteger(rawId)
      ? String(rawId)
      : requiredStr(rawId);
  const currentHash = requiredStr(record?.current_hash);
  if (record === null || id === null || currentHash === null) return null;
  return {
    id,
    asset_id: str(record.asset_id),
    change_event_id: str(record.change_event_id),
    evidence_package_id: str(record.evidence_package_id),
    action: asEnum(record.action, [
      'upload',
      'transform',
      'tag',
      'pair',
      'detect',
      'package',
      'export',
      'verify',
      'demo_seed',
    ] as const) ?? 'upload',
    actor_type: asEnum(record.actor_type, ['system', 'user', 'ml_model', 'device'] as const) ?? 'system',
    actor_id: str(record.actor_id),
    details: jsonObject(record.details),
    previous_hash: str(record.previous_hash),
    current_hash: currentHash,
    hashed_at: str(record.hashed_at) ?? '',
    details_canonical: str(record.details_canonical),
    created_at: str(record.created_at) ?? '',
  };
}

export function parseAuditLogs(raw: unknown): AuditLog[] {
  return asArray(raw)
    .map(parseAuditLog)
    .filter((row): row is AuditLog => row !== null);
}

export function parseAssetDerivative(raw: unknown): AssetDerivative | null {
  const record = asRecord(raw);
  const id = requiredStr(record?.id);
  const parentAssetId = requiredStr(record?.parent_asset_id);
  const publicId = requiredStr(record?.public_id);
  if (record === null || id === null || parentAssetId === null || publicId === null) return null;
  return {
    id,
    parent_asset_id: parentAssetId,
    org_id: str(record.org_id) ?? '',
    transformation: str(record.transformation) ?? '',
    kind: str(record.kind),
    public_id: publicId,
    is_generative: bool(record.is_generative) ?? false,
    cloudinary_asset_id: str(record.cloudinary_asset_id),
    cloudinary_version: str(record.cloudinary_version),
    byte_size: bigInt(record.byte_size),
    sha256_hash: str(record.sha256_hash),
    created_at: str(record.created_at) ?? '',
  };
}

export function parseAssetDerivatives(raw: unknown): AssetDerivative[] {
  return asArray(raw)
    .map(parseAssetDerivative)
    .filter((row): row is AssetDerivative => row !== null);
}

export function parseModelRegistryEntry(raw: unknown): ModelRegistryEntry | null {
  const record = asRecord(raw);
  const id = requiredStr(record?.id);
  const key = requiredStr(record?.key);
  if (record === null || id === null || key === null) return null;
  return {
    id,
    key,
    version: str(record.version) ?? '',
    sector: str(record.sector) ?? '',
    weights_uri: str(record.weights_uri),
    status: asEnum(record.status, ['trained', 'prebuilt', 'unsupported'] as const) ?? 'unsupported',
    metrics: jsonObject(record.metrics),
    created_at: str(record.created_at) ?? '',
  };
}

export function parseModelRegistry(raw: unknown): ModelRegistryEntry[] {
  return asArray(raw)
    .map(parseModelRegistryEntry)
    .filter((row): row is ModelRegistryEntry => row !== null);
}
