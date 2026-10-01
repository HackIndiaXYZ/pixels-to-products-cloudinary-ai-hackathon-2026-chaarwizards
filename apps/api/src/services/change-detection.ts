/**
 * detect-change worker logic (BUILD_ORDER Phase 7). Processes ONE before/after
 * pair: resolves the two originals to signed URLs, calls the ML service, and
 * persists exactly one `change_events` row.
 *
 * Every path persists a row (§3.6 — "never a silent drop"):
 *   - ML unreachable / errored        → status='failed', reason recorded
 *   - sector model not trained         → ML returns {"status":"unsupported"}
 *                                        → status='failed' (§3.3, no cross-sector
 *                                          fallback), reason recorded
 *   - metric outside the sector schema → status='failed', reason names the key
 *                                        (§3.2 — an untraceable number never
 *                                          reaches a report)
 *   - success                          → status='detected', model_version stored
 *                                          verbatim from the model that produced
 *                                          it (§3.2)
 *
 * Idempotency: a pair that already has a (non-split) change_event is skipped, so
 * a re-run over an unchanged window creates no duplicate rows.
 */
import { canonicalize, ProjectConfigSchema, type ChangeEvent, type JsonValue } from '@panchnama/shared';
import type { CloudinaryPort, DbPort } from '../ports.js';
import type { MlClient } from './ml-client.js';
import { resolveMetricsSchema, validateChangeMetrics } from '../lib/change-metrics-schema.js';

/** Sentinel model_version for a row that carries no CV metric (§3.2 note). */
export const NO_MODEL_VERSION = 'none';
/** TTL for the authenticated original URL handed to the ML service. */
const ORIGINAL_URL_TTL_SECONDS = 300;

export interface DetectChangeDeps {
  readonly db: DbPort;
  readonly ml: MlClient;
  readonly cloudinary: CloudinaryPort;
}

export interface DetectChangePayload {
  readonly projectId: string;
  readonly orgId: string;
  readonly beforeAssetId: string;
  readonly afterAssetId: string;
  /** Haversine distance computed by the pairing worker (authoritative). */
  readonly gpsDistanceMeters?: number | null;
  /** Time delta computed by the pairing worker; recomputed if absent. */
  readonly timeDifferenceHours?: number | null;
  /** Actor recorded on the ML internal JWT + audit entry. Defaults to 'system'. */
  readonly actorId?: string;
}

export type DetectChangeOutcome =
  | { readonly kind: 'skipped'; readonly changeEvent: ChangeEvent }
  | { readonly kind: 'detected'; readonly changeEvent: ChangeEvent }
  | { readonly kind: 'failed'; readonly changeEvent: ChangeEvent; readonly reason: string };

export async function runDetectChange(
  deps: DetectChangeDeps,
  payload: DetectChangePayload,
): Promise<DetectChangeOutcome> {
  const { db, ml, cloudinary } = deps;
  const actorId = payload.actorId ?? 'system';

  // Idempotency: never create a second row for a pair that already has one.
  const existing = await db.changeEvents.findPair(payload.beforeAssetId, payload.afterAssetId);
  if (existing !== null) {
    return { kind: 'skipped', changeEvent: existing };
  }

  const project = await db.getProjectService(payload.projectId);
  if (project === null) {
    throw new Error(`detect-change: project ${payload.projectId} not found`);
  }
  const before = await db.assets.getByIdService(payload.beforeAssetId);
  const after = await db.assets.getByIdService(payload.afterAssetId);
  if (before === null || after === null) {
    // A missing asset is a real fault — persist a failed row rather than drop it.
    return persistFailure(deps, project.org_id, payload, 'before or after asset not found', actorId);
  }

  const beforeUrl = cloudinary.originalUrl(before.cloudinary_public_id, ORIGINAL_URL_TTL_SECONDS).url;
  const afterUrl = cloudinary.originalUrl(after.cloudinary_public_id, ORIGINAL_URL_TTL_SECONDS).url;

  const sector = project.sector ?? 'unknown';
  const gpsDistance = payload.gpsDistanceMeters ?? null;
  const timeDiff =
    payload.timeDifferenceHours ??
    timeDiffHours(before.device_capture_timestamp, after.device_capture_timestamp);

  let response;
  try {
    response = await ml.detectChange(
      { userId: actorId, orgId: payload.orgId, jobId: `detect:${payload.beforeAssetId}:${payload.afterAssetId}` },
      {
        before_url: beforeUrl,
        after_url: afterUrl,
        sector,
        project_id: payload.projectId,
      },
    );
  } catch (err) {
    const reason = `ml service call failed: ${err instanceof Error ? err.message : String(err)}`;
    return persistFailure(deps, project.org_id, payload, reason, actorId, gpsDistance);
  }

  // §3.3: a sector with no trained model returns {"status":"unsupported"}. Never
  // borrow another sector's number — record the failure instead.
  if (response.status === 'unsupported') {
    return persistFailure(
      deps,
      project.org_id,
      payload,
      `sector "${sector}" has no trained model (unsupported)`,
      actorId,
      gpsDistance,
    );
  }

  // §3.2: a metric with no model provenance cannot be stored as detected.
  if (typeof response.model_version !== 'string' || response.model_version.length === 0) {
    return persistFailure(
      deps,
      project.org_id,
      payload,
      'ml response carried metrics without a model_version (§3.2)',
      actorId,
      gpsDistance,
    );
  }

  const metrics = response.change_metrics ?? {};
  const config = ProjectConfigSchema.parse(project.config);
  const { schema, source } = resolveMetricsSchema(project.sector ?? null, config.metrics_schema);
  if (schema === null) {
    return persistFailure(
      deps,
      project.org_id,
      payload,
      `no metrics schema for sector "${sector}"; cannot validate provenance`,
      actorId,
      gpsDistance,
    );
  }
  const validation = validateChangeMetrics(metrics, schema);
  if (!validation.ok) {
    // Name the offending key; do NOT store the off-schema metric (§3.2).
    return persistFailure(
      deps,
      project.org_id,
      payload,
      `off-schema metric rejected (${source} schema): ${validation.reason}`,
      actorId,
      gpsDistance,
    );
  }

  const changeEvent = await db.changeEvents.insert({
    project_id: payload.projectId,
    org_id: project.org_id,
    before_asset_id: payload.beforeAssetId,
    after_asset_id: payload.afterAssetId,
    change_type: response.change_type ?? null,
    change_metrics: metrics,
    detection_method: `cv_model_${sector}`,
    model_version: response.model_version,
    confidence: response.confidence ?? null,
    diff_asset_cloudinary_id: response.diff_url ?? null,
    gps_distance_meters: gpsDistance,
    time_difference_hours: timeDiff,
    status: 'detected',
    failure_reason: null,
  });

  await appendPairAudit(deps, {
    assetId: payload.afterAssetId,
    action: 'detect',
    actorType: 'ml_model',
    actorId: response.model_version,
    details: {
      change_event_id: changeEvent.id,
      before_asset_id: payload.beforeAssetId,
      after_asset_id: payload.afterAssetId,
      model_version: response.model_version,
    },
  });

  return { kind: 'detected', changeEvent };
}

function timeDiffHours(beforeTs: string, afterTs: string): number | null {
  const b = Date.parse(beforeTs);
  const a = Date.parse(afterTs);
  if (Number.isNaN(b) || Number.isNaN(a)) return null;
  return Number(((a - b) / 3_600_000).toFixed(4));
}

async function persistFailure(
  deps: DetectChangeDeps,
  orgId: string,
  payload: DetectChangePayload,
  reason: string,
  actorId: string,
  gpsDistance: number | null = null,
): Promise<DetectChangeOutcome> {
  const changeEvent = await deps.db.changeEvents.insert({
    project_id: payload.projectId,
    org_id: orgId,
    before_asset_id: payload.beforeAssetId,
    after_asset_id: payload.afterAssetId,
    change_type: null,
    change_metrics: {},
    detection_method: 'cv_model',
    model_version: NO_MODEL_VERSION,
    confidence: null,
    diff_asset_cloudinary_id: null,
    gps_distance_meters: gpsDistance,
    time_difference_hours: null,
    status: 'failed',
    failure_reason: reason,
  });
  await appendPairAudit(deps, {
    assetId: payload.afterAssetId,
    action: 'detect',
    actorType: 'system',
    actorId,
    details: {
      change_event_id: changeEvent.id,
      status: 'failed',
      failure_reason: reason,
    },
  });
  return { kind: 'failed', changeEvent, reason };
}

async function appendPairAudit(
  deps: DetectChangeDeps,
  input: {
    assetId: string;
    action: string;
    actorType: 'system' | 'user' | 'ml_model' | 'device';
    actorId: string | null;
    details: Record<string, unknown>;
  },
): Promise<void> {
  // The append itself canonicalizes; this only asserts the details serialize.
  void canonicalize(input.details as JsonValue);
  await deps.db.audit.append(input);
}
