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
  IntegrityState,
  ModelRegistryEntry,
  Observation,
  Project,
  ProjectGeometry,
  ProjectPhase,
  ReportManifestEntry,
  SearchAssetsRow,
  UploadStatus,
  VerificationReceiptEntry,
} from '../types/database';
import type { AssetMediaRef } from './media';
import { fieldFromNullable, fieldUnavailable, fieldUnknown, fieldValue, type Field } from './state';

/* ── metrics ─────────────────────────────────────────────────────────────── */

export type MetricValue =
  | { kind: 'count'; value: number }
  | { kind: 'text'; value: string }
  | {
      kind: 'rate';
      verified: number;
      total: number;
      excluded: Record<'pending' | 'unknown' | 'failed', number>;
    };

export interface AuditRateCounts {
  verified: number;
  pending: number;
  unknown: number;
  failed: number;
  total: number;
}

/* Only `verification === 'passed'` counts as verified. `pending` and `unknown` are not verified,
   and every excluded bucket is reported beside the rate so the number stays auditable. */
export function toAuditRate(counts: AuditRateCounts): MetricValue {
  return {
    kind: 'rate',
    verified: counts.verified,
    total: counts.total,
    excluded: { pending: counts.pending, unknown: counts.unknown, failed: counts.failed },
  };
}

/* ── integrity ───────────────────────────────────────────────────────────── */

/** The one conversion from a nullable RPC boolean to an integrity state. NULL is `unknown`,
 *  never `pass`. Nothing else in the codebase collapses an unresolved check into a pass. */
export function boolToIntegrity(value: boolean | null): IntegrityState {
  if (value === null) return 'unknown';
  return value ? 'pass' : 'fail';
}

export interface IntegrityCheck {
  id: string;
  label: string;
  /** Exact RPC field the verdict came from, shown in the UI so the check is traceable. */
  source: string;
  state: IntegrityState;
  detail: Field<string>;
}

export function toIntegrityChecks(
  integrity: AssetIntegrity,
  chain: AuditChainResult | null,
): IntegrityCheck[] {
  const checks: IntegrityCheck[] = [
    {
      id: 'sha256_matches_commit',
      label: 'SHA-256 matches device commit',
      source: 'asset_integrity.sha256_matches_commit',
      state: boolToIntegrity(integrity.sha256_matches_commit),
      detail:
        integrity.sha256_matches_commit === null
          ? fieldValue('Cannot determine')
          : fieldValue(integrity.sha256_matches_commit ? 'Commit hash matches' : 'Commit hash differs'),
    },
    {
      id: 'audit_chain_intact',
      label: 'Audit chain intact',
      source: 'asset_integrity.audit_chain_intact',
      state: boolToIntegrity(integrity.audit_chain_intact),
      detail:
        integrity.audit_chain_intact === null
          ? fieldValue('Cannot determine')
          : fieldValue(integrity.audit_chain_intact ? 'Chain unbroken' : 'Chain broken'),
    },
    {
      id: 'caption_present',
      label: 'Caption present',
      source: 'asset_integrity.caption_present',
      state: boolToIntegrity(integrity.caption_present),
      detail: fieldValue(integrity.caption_present === null ? 'Cannot determine' : integrity.caption_present ? 'Caption recorded' : 'No caption'),
    },
    {
      id: 'caption_signature_present',
      label: 'Caption signature present',
      source: 'asset_integrity.caption_signature_present',
      state: boolToIntegrity(integrity.caption_signature_present),
      detail: fieldValue(
        integrity.caption_signature_present === null
          ? 'Cannot determine'
          : integrity.caption_signature_present
            ? 'Signature recorded'
            : 'Signature absent',
      ),
    },
  ];
  if (chain !== null) {
    checks.push({
      id: 'verify_audit_chain',
      label: 'Audit chain re-verified',
      source: 'verify_audit_chain.ok',
      state: boolToIntegrity(chain.ok),
      detail:
        chain.ok === null
          ? fieldValue('Cannot determine')
          : chain.ok
            ? fieldValue(`${chain.checked} entries checked`)
            : fieldValue('Verification failed'),
    });
  }
  return checks;
}

/* ── project waypoints ────────────────────────────────────────────────────────
   A project is placed on the map from `projects.geometry` and nothing else. The stored column is
   a polygon, so the waypoint is that polygon's own centroid — a real coordinate derived from real
   stored numbers. A project whose geometry is NULL, absent, or unreadable keeps `lon: null` and is
   left off the map; it is never dropped at [0, 0], at an asset's position, or at a guessed
   coordinate. */

export interface ProjectWaypointModel {
  id: string;
  name: string;
  sector: string;
  parentProjectId: string | null;
  startDate: string | null;
  endDate: string | null;
  /** `null` when the stored geometry carries no readable coordinate pair. */
  lon: number | null;
  lat: number | null;
}

/** A waypoint that is guaranteed to carry a coordinate pair, so the map never has to re-check it. */
export interface LocatedProjectWaypoint extends ProjectWaypointModel {
  lon: number;
  lat: number;
}

interface GeoRingPoint {
  lon: number;
  lat: number;
}

interface RingCenter {
  center: GeoRingPoint;
  /** Absolute shoelace area, used to pick the primary ring of a MultiPolygon. */
  area: number;
}

/** Resolves the stored column to a GeoJSON-shaped object, accepting the object PostgREST returns and
 *  the same object still JSON-encoded. Text in any other form is not guessed at. */
function geometryRecord(geometry: ProjectGeometry): Record<string, unknown> | null {
  if (geometry === null) return null;
  if (typeof geometry !== 'string') return geometry;
  const trimmed = geometry.trim();
  if (!trimmed.startsWith('{')) return null;
  try {
    const parsed: unknown = JSON.parse(trimmed);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function coordinate(raw: unknown): number | null {
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
}

/** One GeoJSON ring → its points. Fewer than three usable positions is not a shape. A position
 *  outside the valid longitude/latitude range is discarded rather than projected as if it were a
 *  real place. */
function toRing(raw: unknown): GeoRingPoint[] | null {
  if (!Array.isArray(raw) || raw.length < 3) return null;
  const points: GeoRingPoint[] = [];
  for (const position of raw) {
    if (!Array.isArray(position)) continue;
    const lon = coordinate(position[0]);
    const lat = coordinate(position[1]);
    if (lon === null || lat === null) continue;
    if (lon < -180 || lon > 180 || lat < -90 || lat > 90) continue;
    points.push({ lon, lat });
  }
  return points.length < 3 ? null : points;
}

/** GeoJSON nests coordinates as Polygon → ring → position and MultiPolygon → polygon → ring →
 *  position, so only the outer ring of each part is read. */
function outerRings(record: Record<string, unknown>): GeoRingPoint[][] {
  const coordinates = record.coordinates;
  if (!Array.isArray(coordinates)) return [];
  if (record.type === 'Polygon') {
    const ring = toRing(coordinates[0]);
    return ring === null ? [] : [ring];
  }
  if (record.type === 'MultiPolygon') {
    const rings: GeoRingPoint[][] = [];
    for (const part of coordinates) {
      const ring = toRing(Array.isArray(part) ? part[0] : undefined);
      if (ring !== null) rings.push(ring);
    }
    return rings;
  }
  return [];
}

/** Area-weighted centroid of a closed ring (the standard shoelace formula). A ring with no area —
 *  a collinear or repeated-vertex outline — has no centroid, so the average of its own vertices is
 *  used instead, which is still made only of stored coordinates. */
function ringCenter(ring: GeoRingPoint[]): RingCenter | null {
  if (ring.length < 3) return null;
  let area2 = 0;
  let lonSum = 0;
  let latSum = 0;
  for (let index = 0; index < ring.length; index += 1) {
    const current = ring[index];
    const next = ring[(index + 1) % ring.length];
    if (current === undefined || next === undefined) continue;
    const cross = current.lon * next.lat - next.lon * current.lat;
    area2 += cross;
    lonSum += (current.lon + next.lon) * cross;
    latSum += (current.lat + next.lat) * cross;
  }
  if (Math.abs(area2) > 1e-12) {
    return { center: { lon: lonSum / (3 * area2), lat: latSum / (3 * area2) }, area: Math.abs(area2) };
  }
  let lonTotal = 0;
  let latTotal = 0;
  for (const point of ring) {
    lonTotal += point.lon;
    latTotal += point.lat;
  }
  return { center: { lon: lonTotal / ring.length, lat: latTotal / ring.length }, area: 0 };
}

/** The primary ring of the project: the largest one, so a multi-part site is marked on its main
 *  body rather than on a sliver. */
function geometryCenter(geometry: ProjectGeometry): GeoRingPoint | null {
  const record = geometryRecord(geometry);
  if (record === null) return null;
  let primary: RingCenter | null = null;
  for (const ring of outerRings(record)) {
    const candidate = ringCenter(ring);
    if (candidate === null) continue;
    if (primary === null || candidate.area > primary.area) primary = candidate;
  }
  if (primary === null) return null;
  const { lon, lat } = primary.center;
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  if (lon < -180 || lon > 180 || lat < -90 || lat > 90) return null;
  return primary.center;
}

export function toProjectWaypointModel(project: Project): ProjectWaypointModel {
  const center = geometryCenter(project.geometry);
  return {
    id: project.id,
    name: project.name,
    sector: project.sector,
    parentProjectId: project.parent_project_id,
    startDate: project.start_date,
    endDate: project.end_date,
    lon: center === null ? null : center.lon,
    lat: center === null ? null : center.lat,
  };
}

export function toProjectWaypointModels(projects: readonly Project[]): ProjectWaypointModel[] {
  return projects.map(toProjectWaypointModel);
}

/** Splits projects into those the map can place and those whose geometry it cannot read, so the
 *  second group can be reported instead of silently disappearing. */
export function partitionProjectWaypoints(waypoints: readonly ProjectWaypointModel[]): {
  located: LocatedProjectWaypoint[];
  unlocated: ProjectWaypointModel[];
} {
  const located: LocatedProjectWaypoint[] = [];
  const unlocated: ProjectWaypointModel[] = [];
  for (const waypoint of waypoints) {
    if (waypoint.lon !== null && waypoint.lat !== null) {
      located.push({ ...waypoint, lon: waypoint.lon, lat: waypoint.lat });
    } else {
      unlocated.push(waypoint);
    }
  }
  return { located, unlocated };
}

/* ── evidence ────────────────────────────────────────────────────────────── */

export interface EvidenceCardModel {
  assetId: Field<string>;
  assetType: Field<AssetType>;
  uploadStatus: Field<UploadStatus>;
  phase: Field<ProjectPhase | null>;
  observationType: Field<string | null>;
  caption: Field<string | null>;
  capturedAt: Field<string | null>;
  gpsPoint: Field<GeoPoint | null>;
  gpsAccuracyMeters: Field<number | null>;
  gpsProvider: Field<string | null>;
  media: Field<AssetMediaRef | null>;
  quarantined: Field<boolean>;
}

export function toEvidenceCardModel(row: SearchAssetsRow, media: AssetMediaRef | null): EvidenceCardModel {
  return {
    assetId: fieldValue(row.id),
    assetType: fieldValue(row.asset_type),
    uploadStatus: fieldValue(row.upload_status),
    phase: fieldFromNullable(row.phase),
    observationType: fieldFromNullable(row.observation_type),
    caption: fieldFromNullable(row.caption),
    capturedAt: fieldFromNullable(row.device_capture_timestamp),
    gpsPoint: fieldFromNullable(row.gps_point),
    gpsAccuracyMeters: fieldFromNullable(row.gps_accuracy_meters),
    gpsProvider: fieldFromNullable(row.gps_provider),
    media: media === null ? fieldUnavailable<AssetMediaRef | null>() : fieldValue(media),
    /* `search_assets` does not return `quarantined_at`, so the grid cannot assert quarantine
       state. The inspector reads it from the full asset row. */
    quarantined: fieldUnavailable<boolean>(),
  };
}

export interface EvidenceDetailModel {
  assetId: Field<string>;
  projectId: Field<string>;
  assetType: Field<AssetType>;
  verification: Field<AssetVerification>;
  uploadStatus: Field<UploadStatus>;
  signatureTier: Field<string | null>;
  phase: Field<ProjectPhase | null>;
  observationType: Field<string | null>;
  caption: Field<string | null>;
  captionLanguage: Field<string | null>;
  capturedAt: Field<string | null>;
  serverUploadTimestamp: Field<string | null>;
  serverReceivedAt: Field<string | null>;
  uploadStartedAt: Field<string | null>;
  deviceId: Field<string | null>;
  deviceCommitHash: Field<string | null>;
  captureSignature: Field<string | null>;
  sha256Hash: Field<string | null>;
  exifHash: Field<string | null>;
  phash: Field<string | null>;
  gpsPoint: Field<GeoPoint | null>;
  gpsAccuracyMeters: Field<number | null>;
  gpsAltitude: Field<number | null>;
  gpsProvider: Field<string | null>;
  gpsTimestamp: Field<string | null>;
  ntpOffsetSeconds: Field<number | null>;
  deviceMonotonicMs: Field<string | number | null>;
  quarantinedAt: Field<string | null>;
  verifiedAt: Field<string | null>;
  media: Field<AssetMediaRef | null>;
  observations: Observation[];
}

export function toEvidenceDetailModel(asset: Asset, media: AssetMediaRef | null): EvidenceDetailModel {
  return {
    assetId: fieldValue(asset.id),
    projectId: fieldValue(asset.project_id),
    assetType: fieldValue(asset.asset_type),
    verification: fieldValue(asset.verification),
    uploadStatus: fieldValue(asset.upload_status),
    signatureTier: fieldFromNullable(asset.signature_tier),
    phase: fieldFromNullable(asset.phase),
    observationType: fieldFromNullable(asset.observation_type),
    caption: fieldFromNullable(asset.caption),
    captionLanguage: fieldFromNullable(asset.caption_language),
    capturedAt: fieldFromNullable(asset.device_capture_timestamp),
    serverUploadTimestamp: fieldFromNullable(asset.server_upload_timestamp),
    serverReceivedAt: fieldFromNullable(asset.server_received_at),
    uploadStartedAt: fieldFromNullable(asset.upload_started_at),
    deviceId: fieldFromNullable(asset.device_id),
    deviceCommitHash: fieldFromNullable(asset.device_commit_hash),
    captureSignature: fieldFromNullable(asset.capture_signature),
    sha256Hash: fieldFromNullable(asset.sha256_hash),
    exifHash: fieldFromNullable(asset.exif_hash),
    phash: fieldFromNullable(asset.phash),
    gpsPoint: fieldFromNullable(asset.gps_point),
    gpsAccuracyMeters: fieldFromNullable(asset.gps_accuracy_meters),
    gpsAltitude: fieldFromNullable(asset.gps_altitude),
    gpsProvider: fieldFromNullable(asset.gps_provider),
    gpsTimestamp: fieldFromNullable(asset.gps_timestamp),
    ntpOffsetSeconds: fieldFromNullable(asset.ntp_offset_seconds),
    deviceMonotonicMs: fieldFromNullable(asset.device_monotonic_ms),
    quarantinedAt: fieldFromNullable(asset.quarantined_at),
    verifiedAt: fieldFromNullable(asset.verified_at),
    media: media === null ? fieldUnavailable<AssetMediaRef | null>() : fieldValue(media),
    observations: [],
  };
}

/* ── lineage ─────────────────────────────────────────────────────────────── */

export interface LineageNode {
  id: string;
  publicId: Field<string>;
  transformation: Field<string>;
  kind: Field<string | null>;
  isGenerative: Field<boolean>;
  sha256Hash: Field<string | null>;
  byteSize: Field<string>;
  createdAt: Field<string | null>;
  depth: number;
}

/** `asset_derivatives` is append-only with UNIQUE(parent_asset_id, transformation). The graph is
 *  walked parent → derivative so the tree reflects the stored edges exactly. */
export function toLineageForest(
  rootAssetId: string,
  derivatives: AssetDerivative[],
): { root: LineageNode; children: LineageNode[] } {
  const childrenByParent = new Map<string, AssetDerivative[]>();
  for (const derivative of derivatives) {
    const bucket = childrenByParent.get(derivative.parent_asset_id);
    if (bucket === undefined) childrenByParent.set(derivative.parent_asset_id, [derivative]);
    else bucket.push(derivative);
  }
  const depthOf = (parentId: string, depth: number): number =>
    depth > 8 ? depth : (childrenByParent.get(parentId)?.length ?? 0) > 0 ? depth + 1 : depth;
  return {
    root: {
      id: rootAssetId,
      publicId: fieldUnavailable<string>(),
      transformation: fieldValue('original'),
      kind: fieldValue('original'),
      isGenerative: fieldValue(false),
      sha256Hash: fieldUnavailable<string | null>(),
      byteSize: fieldUnavailable<string>(),
      createdAt: fieldUnavailable<string | null>(),
      depth: 0,
    },
    children: derivatives
      .filter((derivative) => derivative.parent_asset_id === rootAssetId)
      .map((derivative) => ({
        id: derivative.id,
        publicId: fieldValue(derivative.public_id),
        transformation: fieldValue(derivative.transformation),
        kind: fieldFromNullable(derivative.kind),
        isGenerative: fieldValue(derivative.is_generative),
        sha256Hash: fieldFromNullable(derivative.sha256_hash),
        byteSize:
          derivative.byte_size === null ? fieldUnknown<string>() : fieldValue(String(derivative.byte_size)),
        createdAt: fieldFromNullable(derivative.created_at),
        depth: depthOf(derivative.parent_asset_id, 1),
      })),
  };
}

/* ── quarantine ──────────────────────────────────────────────────────────── */

export interface QuarantineItemModel {
  asset: Asset;
  media: AssetMediaRef | null;
  /** There is no stored reason column. The reason is derived only from real check results;
   *  with none available this is `Reason unavailable`. It is never generated. */
  reason: Field<string>;
  failedChecks: IntegrityCheck[];
}

export function deriveQuarantineReason(failedChecks: IntegrityCheck[]): Field<string> {
  const named = failedChecks
    .filter((check) => check.state === 'fail')
    .map((check) => check.label);
  if (named.length === 0) return fieldValue('Reason unavailable');
  return fieldValue(named.join(' · '));
}

/* ── activity ────────────────────────────────────────────────────────────── */

export interface ActivityEntryModel {
  id: Field<string>;
  action: Field<string>;
  actorType: Field<string | null>;
  actorId: Field<string | null>;
  hashedAt: Field<string | null>;
  currentHash: Field<string | null>;
  previousHash: Field<string | null>;
  assetId: Field<string | null>;
}

export function toActivityEntryModel(log: AuditLog): ActivityEntryModel {
  return {
    id: fieldValue(log.id),
    action: fieldValue(log.action),
    actorType: fieldFromNullable(log.actor_type),
    actorId: fieldFromNullable(log.actor_id),
    hashedAt: fieldFromNullable(log.hashed_at),
    currentHash: fieldValue(log.current_hash),
    previousHash: fieldFromNullable(log.previous_hash),
    assetId: fieldFromNullable(log.asset_id),
  };
}

/* ── change detection ────────────────────────────────────────────────────── */

export interface ModelProvenanceModel {
  modelVersion: Field<string>;
  detectionMethod: Field<string | null>;
  confidence: Field<number>;
  sector: Field<string>;
  status: Field<string>;
  registryVersion: Field<string | null>;
  weightsUri: Field<string | null>;
  supported: boolean;
  metrics: Field<Record<string, string>>;
}

export function toModelProvenance(
  event: ChangeEvent,
  sector: string | null,
  registryEntry: ModelRegistryEntry | null,
): ModelProvenanceModel {
  const status = registryEntry?.status ?? null;
  const supported = status === 'trained' || status === 'prebuilt';
  const metrics: Record<string, string> = {};
  const registryMetrics = registryEntry?.metrics ?? null;
  if (registryMetrics !== null) {
    for (const [key, value] of Object.entries(registryMetrics)) {
      metrics[key] =
        typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
          ? String(value)
          : 'Unknown';
    }
  }
  return {
    modelVersion: fieldValue(event.model_version),
    detectionMethod: fieldFromNullable(event.detection_method),
    confidence: fieldFromNullable(event.confidence),
    sector: fieldFromNullable(sector),
    status: fieldFromNullable(status),
    /* Only `forestry` is seeded as trained; every other sector is `unsupported`, which is not
       zero and must never borrow another sector's numbers. */
    registryVersion: registryEntry === null ? fieldUnavailable<string | null>() : fieldFromNullable(registryEntry.version),
    weightsUri: fieldFromNullable(registryEntry?.weights_uri ?? null),
    supported,
    metrics: fieldValue(metrics),
  };
}

export interface ChangeMetricRow {
  key: string;
  before: Field<string>;
  after: Field<string>;
  /** Deterministic `after - before`. Null when the pair is absent or not numeric. */
  netDelta: Field<string>;
}

/** `change_metrics` is opaque JSONB. Only keys actually present are rendered, a key that cannot be
 *  resolved reads `Unknown`, and no metric shape is assumed. */
export function toChangeMetricRows(metrics: Record<string, unknown>): ChangeMetricRow[] {
  const keys = Object.keys(metrics).sort();
  const rows: ChangeMetricRow[] = keys.map((key) => {
    const raw = metrics[key];
    const base = key.endsWith('_before') ? key.slice(0, -'_before'.length) : null;
    const afterKey = base === null ? null : `${base}_after`;
    const afterRaw = afterKey === null ? undefined : metrics[afterKey];
    const toNumber = (input: unknown): number | null =>
      typeof input === 'number' && Number.isFinite(input)
        ? input
        : typeof input === 'string' && input.trim() !== '' && Number.isFinite(Number(input))
          ? Number(input)
          : null;
    const beforeNumber = toNumber(raw);
    const afterNumber = toNumber(afterRaw);
    const paired = base !== null && afterKey !== null && afterRaw !== undefined;
    return {
      key,
      before: scalar(raw),
      after: paired ? scalar(afterRaw) : fieldUnavailable<string>(),
      netDelta:
        paired && beforeNumber !== null && afterNumber !== null
          ? fieldValue(String(afterNumber - beforeNumber))
          : fieldUnknown<string>(),
    };
  });
  return rows;
}

function scalar(raw: unknown): Field<string> {
  if (typeof raw === 'string') return fieldValue(raw);
  if (typeof raw === 'number') return fieldValue(Number.isFinite(raw) ? String(raw) : 'Unknown');
  if (typeof raw === 'boolean') return fieldValue(raw ? 'true' : 'false');
  return fieldUnknown<string>();
}

export interface ChangeDetailModel {
  event: ChangeEvent;
  paired: boolean;
  before: Asset | null;
  after: Asset | null;
  beforeMedia: AssetMediaRef | null;
  afterMedia: AssetMediaRef | null;
  diffPublicId: Field<string>;
  metricRows: ChangeMetricRow[];
  provenance: ModelProvenanceModel;
}

export interface ManifestRowModel {
  ordinal: Field<number>;
  role: Field<string>;
  sha256Hash: Field<string>;
  byteSize: Field<string>;
  verifiedAt: Field<string | null>;
  publicId: Field<string>;
  derivativePublicId: Field<string | null>;
}

export function toManifestRowModel(entry: ReportManifestEntry): ManifestRowModel {
  return {
    ordinal: fieldValue(entry.ordinal),
    role: fieldValue(entry.role),
    sha256Hash: fieldValue(entry.sha256_hash),
    byteSize: entry.byte_size === null ? fieldUnknown<string>() : fieldValue(String(entry.byte_size)),
    verifiedAt: fieldFromNullable(entry.verified_at),
    publicId: fieldValue(entry.cloudinary_public_id),
    derivativePublicId: fieldFromNullable(entry.derivative_public_id),
  };
}

export interface ReceiptRowModel {
  entry: VerificationReceiptEntry;
  state: IntegrityState;
}

export interface PackageSummaryModel {
  package: EvidencePackage;
  manifestCount: number | null;
}
