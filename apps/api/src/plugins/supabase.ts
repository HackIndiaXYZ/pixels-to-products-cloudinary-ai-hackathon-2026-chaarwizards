/**
 * Supabase-backed {@link DbPort}. Two client kinds, never mixed (AGENTS.md §3.4):
 *
 * - **Request-scoped**: anon key + the caller's JWT in the `Authorization`
 *   header, so RLS is the isolation boundary and every product read is org
 *   scoped by Postgres. Used by dashboard-facing routes.
 * - **Service-role**: the service key, which bypasses RLS. Used ONLY by the
 *   webhook ingest and background workers, and its `org_id` always comes from a
 *   verified claim, never a request body.
 *
 * The recursive project tree is assembled in application code over the
 * org-scoped rows RLS already permits, rather than adding an unplanned SQL
 * function; the isolation guarantee is unchanged because a caller can only read
 * its own org's projects to begin with.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import {
  canonicalize,
  ProjectSchema,
  AssetSchema,
  AssetDerivativeSchema,
  ChangeEventSchema,
  OrgSchema,
  ReportSchema,
  ReportManifestEntrySchema,
} from '@impact/shared';
import type { JsonValue, Project, VerificationState, GpsProvider } from '@impact/shared';
import { verifyExifHash, verifyCaptureSignature } from '../services/verification.js';

/**
 * Runtime validation of the `search_assets` JSONB envelope (AGENTS.md §4 —
 * validate every trust boundary, and a Postgres function's return value is one).
 * A malformed row is a hard error, never silently coerced.
 */
const SearchRowSchema = z.object({
  id: z.string(),
  project_id: z.string(),
  cloudinary_public_id: z.string(),
  asset_type: z.enum(['image', 'video']).nullable(),
  device_capture_timestamp: z.string(),
  gps_point: z
    .object({ type: z.literal('Point'), coordinates: z.tuple([z.number(), z.number()]) })
    .nullable(),
  gps_accuracy_meters: z.number().nullable(),
  gps_provider: z.string().nullable(),
  caption: z.string().nullable(),
  ai_tags: z.array(z.string()),
  observation_type: z.string().nullable(),
  phase: z.enum(['before', 'after']).nullable(),
  upload_status: z.enum(['pending', 'verified', 'flagged']),
});

const SearchEnvelopeSchema = z.object({
  data: z.array(SearchRowSchema),
  total_matched: z.number().int().nonnegative(),
  truncated: z.boolean(),
  facet_counts: z.record(z.string(), z.record(z.string(), z.number())).optional(),
  next_cursor: z.number().int().nonnegative().nullable(),
});

/** Raw `asset_integrity` JSONB: DB-decidable checks plus the crypto inputs. */
const IntegrityRawSchema = z.object({
  asset_id: z.string(),
  device_capture_timestamp: z.string(),
  server_upload_timestamp: z.string().nullable(),
  server_received_at: z.string().nullable(),
  clock_drift_seconds: z.number().nullable(),
  gps_accuracy_meters: z.number().nullable(),
  gps_provider: z.string().nullable(),
  caption_present: z.boolean(),
  caption_signature_present: z.boolean(),
  audit_chain_intact: z.boolean().nullable(),
  sha256_matches_commit: z.boolean().nullable(),
  crypto_inputs: z.object({
    exif: z.record(z.string(), z.unknown()).nullable(),
    exif_hash: z.string().nullable(),
    sha256: z.string().nullable(),
    capture_signature: z.string().nullable(),
    device_public_key: z.string().nullable(),
    captured_at_ms: z.number().int().nullable(),
    device_monotonic_ms: z.number().int().nullable(),
    lat_e7: z.number().int().nullable(),
    lon_e7: z.number().int().nullable(),
    accuracy_m: z.number().nullable(),
    altitude_m: z.number().nullable(),
    provider: z.string().nullable(),
    project_id: z.string(),
    observation_type: z.string().nullable(),
    phase: z.enum(['before', 'after']).nullable(),
    caption: z.string().nullable(),
  }),
});

type IntegrityRaw = z.infer<typeof IntegrityRawSchema>;

/** Runtime validation of a `report_templates` row (Phase 9 trust boundary). */
const ReportTemplateRowSchema = z.object({
  id: z.string(),
  org_id: z.string().nullable(),
  sector: z.string().nullable(),
  name: z.string(),
  description: z.string().nullable(),
  handlebars_template: z.string(),
  config: z.record(z.string(), z.unknown()).default({}),
  is_default: z.boolean().default(false),
  created_at: z.string(),
});

function stateToBool(state: VerificationState): boolean | null {
  return state === 'pass' ? true : state === 'fail' ? false : null;
}

/**
 * Resolve the two API-side checks (Ed25519 signature over the re-derived
 * canonical payload, and the RFC 8785 EXIF hash) and assemble the flat contract.
 * A missing input yields `null` (unknown), never a false `pass` (AGENTS.md §3.7).
 */
function resolveIntegrityContract(raw: IntegrityRaw): IntegrityContract {
  const ci = raw.crypto_inputs;

  let exifVerified: boolean | null;
  if (ci.exif === null || ci.exif_hash === null) {
    exifVerified = null;
  } else {
    exifVerified = stateToBool(verifyExifHash(ci.exif, ci.exif_hash));
  }

  let signatureVerified: boolean | null;
  if (
    ci.sha256 === null ||
    ci.exif_hash === null ||
    ci.captured_at_ms === null ||
    ci.device_monotonic_ms === null ||
    ci.lat_e7 === null ||
    ci.lon_e7 === null ||
    ci.observation_type === null ||
    ci.phase === null ||
    ci.capture_signature === null ||
    ci.device_public_key === null
  ) {
    signatureVerified = null;
  } else {
    signatureVerified = stateToBool(
      verifyCaptureSignature(
        {
          v: 1,
          sha256: ci.sha256,
          exif_hash: ci.exif_hash,
          captured_at_ms: ci.captured_at_ms,
          device_monotonic_ms: ci.device_monotonic_ms,
          gps: {
            lat_e7: ci.lat_e7,
            lon_e7: ci.lon_e7,
            ...(ci.accuracy_m !== null ? { accuracy_m: ci.accuracy_m } : {}),
            ...(ci.altitude_m !== null ? { altitude_m: ci.altitude_m } : {}),
            ...(ci.provider !== null ? { provider: ci.provider as GpsProvider } : {}),
          },
          project_id: ci.project_id,
          observation_type: ci.observation_type,
          phase: ci.phase,
          caption: ci.caption,
        },
        ci.capture_signature,
        ci.device_public_key,
      ),
    );
  }

  // An absent caption is `pass` (nothing to forge); a signed caption is verified
  // in a later phase, so it is reported as `unknown` rather than a false `pass`.
  const captionVerified: boolean | null = !raw.caption_present ? true : null;

  return {
    asset_id: raw.asset_id,
    device_capture_timestamp: raw.device_capture_timestamp,
    server_upload_timestamp: raw.server_upload_timestamp,
    server_received_at: raw.server_received_at,
    clock_drift_seconds: raw.clock_drift_seconds,
    gps_accuracy_meters: raw.gps_accuracy_meters,
    gps_provider: raw.gps_provider,
    device_signature_verified: signatureVerified,
    exif_hash_verified: exifVerified,
    caption_signature_verified: captionVerified,
    audit_chain_intact: raw.audit_chain_intact,
    sha256_matches_commit: raw.sha256_matches_commit,
  };
}
import type { Config } from '../config.js';
import type {
  AssetInsert,
  AuditRepo,
  ChangeEventInsert,
  DbPort,
  IntegrityCheck,
  IntegrityContract,
  ManualPairInsert,
  PairingAssetRow,
  Page,
  VerificationUpdate,
} from '../ports.js';
import type { AuthContext } from '../types.js';
import { errors } from '../types.js';
import { clampLimit, decodeCursor, encodeCursor } from '../lib/pagination.js';

function pageFrom<T>(rows: readonly T[], offset: number, limit: number): Page<T> {
  const hasMore = rows.length === limit;
  return { rows, nextCursor: hasMore ? encodeCursor(offset + limit) : null };
}

export function createSupabaseDb(config: Config): DbPort {
  const service = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  function scoped(ctx: AuthContext): SupabaseClient {
    return createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${ctx.jwt}` } },
    });
  }

  const audit: AuditRepo = {
    async append(input) {
      const details_canonical = canonicalize(input.details as JsonValue);
      const { error } = await service.rpc('append_audit_log', {
        p_asset_id: input.assetId,
        p_action: input.action,
        p_actor_type: input.actorType,
        p_actor_id: input.actorId,
        p_details: input.details,
        p_details_canonical: details_canonical,
      });
      if (error) throw errors.internal('audit append failed', { cause: error.message });
    },
    async chainForAsset(assetId) {
      // Service-role read of the append-only chain in insertion order (id is a
      // global BIGSERIAL, so it orders across partitions — see the audit_logs
      // migration). The tip's current_hash is what the report appendix prints.
      const { data, error } = await service
        .from('audit_logs')
        .select('action, previous_hash, current_hash, hashed_at')
        .eq('asset_id', assetId)
        .order('id', { ascending: true });
      if (error) throw errors.internal('audit chain read failed', { cause: error.message });
      return ((data ?? []) as unknown[]).map((r) => {
        const row = r as {
          action: string;
          previous_hash: string | null;
          current_hash: string;
          hashed_at: string;
        };
        return {
          action: row.action,
          previous_hash: row.previous_hash,
          current_hash: row.current_hash,
          hashed_at: row.hashed_at,
        };
      });
    },
  };

  return {
    audit,

    projects: {
      async list(ctx, params) {
        const limit = clampLimit(params.limit);
        const offset = decodeCursor(params.cursor);
        const { data, error } = await scoped(ctx)
          .from('projects')
          .select('*')
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);
        if (error) throw errors.internal('list projects failed', { cause: error.message });
        const rows = (data ?? []).map((r) => ProjectSchema.parse(r));
        return pageFrom(rows, offset, limit);
      },
      async get(ctx, id) {
        const { data, error } = await scoped(ctx)
          .from('projects')
          .select('*')
          .eq('id', id)
          .maybeSingle();
        if (error) throw errors.internal('get project failed', { cause: error.message });
        return data ? ProjectSchema.parse(data) : null;
      },
      async tree(ctx, rootId) {
        const { data, error } = await scoped(ctx).from('projects').select('*');
        if (error) throw errors.internal('project tree failed', { cause: error.message });
        const all = (data ?? []).map((r) => ProjectSchema.parse(r));
        return collectSubtree(all, rootId);
      },
      async create(ctx, input) {
        // org_id is forced to the caller's verified org, never taken from input.
        const { data, error } = await scoped(ctx)
          .from('projects')
          .insert({ ...input, org_id: ctx.orgId })
          .select('*')
          .single();
        if (error) throw errors.internal('create project failed', { cause: error.message });
        return ProjectSchema.parse(data);
      },
      async updateConfig(ctx, id, cfg) {
        const { data, error } = await scoped(ctx)
          .from('projects')
          .update({ config: cfg })
          .eq('id', id)
          .select('*')
          .maybeSingle();
        if (error) throw errors.internal('update config failed', { cause: error.message });
        return data ? ProjectSchema.parse(data) : null;
      },
    },

    assets: {
      async getById(ctx, id) {
        const { data, error } = await scoped(ctx)
          .from('assets')
          .select('*')
          .eq('id', id)
          .maybeSingle();
        if (error) throw errors.internal('get asset failed', { cause: error.message });
        return data ? AssetSchema.parse(data) : null;
      },
      async list(ctx, projectId, params) {
        const limit = clampLimit(params.limit);
        const offset = decodeCursor(params.cursor);
        const { data, error } = await scoped(ctx)
          .from('assets')
          .select('*')
          .eq('project_id', projectId)
          .order('device_capture_timestamp', { ascending: false })
          .range(offset, offset + limit - 1);
        if (error) throw errors.internal('list assets failed', { cause: error.message });
        const rows = (data ?? []).map((r) => AssetSchema.parse(r));
        return pageFrom(rows, offset, limit);
      },
      async searchAssets(ctx, filters, params) {
        const limit = clampLimit(params.limit);
        const offset = decodeCursor(params.cursor);
        const { data, error } = await scoped(ctx).rpc('search_assets', {
          p_q: filters.q ?? null,
          p_bbox: filters.bbox ? [...filters.bbox] : null,
          p_date_from: filters.dateFrom ?? null,
          p_date_to: filters.dateTo ?? null,
          p_tags: filters.tags ? [...filters.tags] : null,
          p_gps_accuracy_max: filters.gpsAccuracyMax ?? null,
          p_asset_type: filters.assetType ?? null,
          p_phase: filters.phase ?? null,
          p_limit: limit,
          p_offset: offset,
        });
        if (error) throw errors.internal('search failed', { cause: error.message });
        const env = SearchEnvelopeSchema.parse(data);
        return {
          rows: env.data,
          totalMatched: env.total_matched,
          truncated: env.truncated,
          facetCounts: env.facet_counts ?? {},
          nextCursor: env.next_cursor === null ? null : encodeCursor(env.next_cursor),
        };
      },
      async findBySha(sha256, projectId) {
        const { data, error } = await service
          .from('assets')
          .select('*')
          .eq('sha256_hash', sha256)
          .eq('project_id', projectId)
          .maybeSingle();
        if (error) throw errors.internal('idempotency lookup failed', { cause: error.message });
        return data ? AssetSchema.parse(data) : null;
      },
      async getByIdService(id) {
        const { data, error } = await service
          .from('assets')
          .select('*')
          .eq('id', id)
          .maybeSingle();
        if (error) throw errors.internal('service asset lookup failed', { cause: error.message });
        return data ? AssetSchema.parse(data) : null;
      },
      async insert(row: AssetInsert) {
        const gps =
          row.gps_lat !== null && row.gps_lon !== null
            ? `SRID=4326;POINT(${row.gps_lon} ${row.gps_lat})`
            : null;
        const { gps_lat: _lat, gps_lon: _lon, ...rest } = row;
        const { data, error } = await service
          .from('assets')
          .insert({ ...rest, gps_point: gps })
          .select('*')
          .single();
        if (error) throw errors.internal('asset insert failed', { cause: error.message });
        return AssetSchema.parse(data);
      },
      async setVerification(assetId, update: VerificationUpdate) {
        const { error } = await service.from('assets').update(update).eq('id', assetId);
        if (error) throw errors.internal('set verification failed', { cause: error.message });
      },
      async listForPairing(projectId): Promise<PairingAssetRow[]> {
        const { data, error } = await service.rpc('assets_for_pairing', {
          p_project_id: projectId,
        });
        if (error) throw errors.internal('pairing asset list failed', { cause: error.message });
        return ((data ?? []) as unknown[]).map((r) => {
          const row = r as {
            id: string;
            org_id: string;
            project_id: string;
            observation_type: string | null;
            phase: 'before' | 'after' | null;
            device_capture_timestamp: string;
            gps_lat: number | null;
            gps_lon: number | null;
            cloudinary_public_id: string;
            asset_type: 'image' | 'video' | null;
          };
          return {
            id: row.id,
            org_id: row.org_id,
            project_id: row.project_id,
            observation_type: row.observation_type,
            phase: row.phase,
            device_capture_timestamp: row.device_capture_timestamp,
            gps_lat: row.gps_lat,
            gps_lon: row.gps_lon,
            cloudinary_public_id: row.cloudinary_public_id,
            asset_type: row.asset_type,
          };
        });
      },
    },

    changeEvents: {
      async findPair(beforeAssetId, afterAssetId) {
        const { data, error } = await service
          .from('change_events')
          .select('*')
          .eq('before_asset_id', beforeAssetId)
          .eq('after_asset_id', afterAssetId)
          .neq('status', 'split')
          .maybeSingle();
        if (error) throw errors.internal('find pair failed', { cause: error.message });
        return data ? ChangeEventSchema.parse(data) : null;
      },
      async insert(row: ChangeEventInsert) {
        const { data, error } = await service
          .from('change_events')
          .insert({
            project_id: row.project_id,
            org_id: row.org_id,
            before_asset_id: row.before_asset_id,
            after_asset_id: row.after_asset_id,
            change_type: row.change_type,
            change_metrics: row.change_metrics,
            detection_method: row.detection_method,
            model_version: row.model_version,
            confidence: row.confidence,
            diff_asset_cloudinary_id: row.diff_asset_cloudinary_id,
            gps_distance_meters: row.gps_distance_meters,
            time_difference_hours: row.time_difference_hours,
            status: row.status,
            failure_reason: row.failure_reason,
          })
          .select('*')
          .single();
        if (error) throw errors.internal('change event insert failed', { cause: error.message });
        return ChangeEventSchema.parse(data);
      },
      async getById(ctx, id) {
        const { data, error } = await scoped(ctx)
          .from('change_events')
          .select('*')
          .eq('id', id)
          .maybeSingle();
        if (error) throw errors.internal('get change event failed', { cause: error.message });
        return data ? ChangeEventSchema.parse(data) : null;
      },
      async listByProject(ctx, projectId, params) {
        const limit = clampLimit(params.limit);
        const offset = decodeCursor(params.cursor);
        const { data, error } = await scoped(ctx)
          .from('change_events')
          .select('*')
          .eq('project_id', projectId)
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);
        if (error) throw errors.internal('list change events failed', { cause: error.message });
        const rows = (data ?? []).map((r) => ChangeEventSchema.parse(r));
        return pageFrom(rows, offset, limit);
      },
      async createManual(ctx, input: ManualPairInsert) {
        // Request-scoped insert: RLS forces the row into the caller's org, and
        // org_id is set from the verified JWT, never the body (§3.4). A manual
        // link has no CV metric, so model_version is the 'manual' sentinel (§3.2).
        const { data, error } = await scoped(ctx)
          .from('change_events')
          .insert({
            project_id: input.project_id,
            org_id: ctx.orgId,
            before_asset_id: input.before_asset_id,
            after_asset_id: input.after_asset_id,
            change_type: null,
            change_metrics: {},
            detection_method: 'manual',
            model_version: 'manual',
            confidence: null,
            diff_asset_cloudinary_id: null,
            gps_distance_meters: input.gps_distance_meters,
            time_difference_hours: input.time_difference_hours,
            status: 'manual',
            failure_reason: null,
          })
          .select('*')
          .single();
        if (error) throw errors.internal('manual pair insert failed', { cause: error.message });
        return ChangeEventSchema.parse(data);
      },
      async setStatus(ctx, id, status) {
        const { data, error } = await scoped(ctx)
          .from('change_events')
          .update({ status })
          .eq('id', id)
          .select('*')
          .maybeSingle();
        if (error) throw errors.internal('set pair status failed', { cause: error.message });
        return data ? ChangeEventSchema.parse(data) : null;
      },
    },

    orgs: {
      async create(input) {
        const { data, error } = await service
          .from('orgs')
          .insert({ name: input.name, type: input.type })
          .select('*')
          .single();
        if (error) throw errors.internal('org create failed', { cause: error.message });
        return OrgSchema.parse(data);
      },
    },

    invites: {
      async create(input) {
        const { data, error } = await service
          .from('invite_tokens')
          .insert({
            org_id: input.org_id,
            email: input.email,
            role: input.role,
            token_hash: input.token_hash,
            expires_at: input.expires_at,
          })
          .select('id')
          .single();
        if (error) throw errors.internal('invite create failed', { cause: error.message });
        return { id: (data as { id: string }).id };
      },
    },

    integrity: {
      async verify(ctx, assetId): Promise<IntegrityCheck[]> {
        const { data, error } = await scoped(ctx).rpc('verify_asset_integrity', {
          p_asset_id: assetId,
        });
        if (error) throw errors.internal('integrity check failed', { cause: error.message });
        return (data ?? []) as IntegrityCheck[];
      },
      async contract(ctx, assetId) {
        const { data, error } = await scoped(ctx).rpc('asset_integrity', {
          p_asset_id: assetId,
        });
        if (error) throw errors.internal('integrity contract failed', { cause: error.message });
        if (data === null || data === undefined) return null;
        const raw = IntegrityRawSchema.parse(data);
        return resolveIntegrityContract(raw);
      },
    },

    derivatives: {
      async getByPublicId(ctx, publicId) {
        const { data, error } = await scoped(ctx)
          .from('asset_derivatives')
          .select('*')
          .eq('public_id', publicId)
          .maybeSingle();
        if (error) throw errors.internal('get derivative failed', { cause: error.message });
        return data ? AssetDerivativeSchema.parse(data) : null;
      },
      async listByParent(ctx, parentAssetId) {
        const { data, error } = await scoped(ctx)
          .from('asset_derivatives')
          .select('*')
          .eq('parent_asset_id', parentAssetId)
          .order('created_at', { ascending: true });
        if (error) throw errors.internal('list derivatives failed', { cause: error.message });
        return (data ?? []).map((r) => AssetDerivativeSchema.parse(r));
      },
      async getById(id) {
        const { data, error } = await service
          .from('asset_derivatives')
          .select('*')
          .eq('id', id)
          .maybeSingle();
        if (error) throw errors.internal('get derivative failed', { cause: error.message });
        return data ? AssetDerivativeSchema.parse(data) : null;
      },
      async insert(row) {
        // Service role: derivatives have no INSERT policy, they are written by
        // the transformation worker (§3.1). org_id is forced to the parent's org
        // by a DB trigger, so it is not supplied here.
        const { data, error } = await service
          .from('asset_derivatives')
          .insert({
            parent_asset_id: row.parent_asset_id,
            transformation: row.transformation,
            kind: row.kind,
            public_id: row.public_id,
            is_generative: row.is_generative,
            cloudinary_asset_id: row.cloudinary_asset_id,
            cloudinary_version: row.cloudinary_version,
            byte_size: row.byte_size,
            sha256_hash: row.sha256_hash,
          })
          .select('*')
          .single();
        if (error) throw errors.internal('derivative insert failed', { cause: error.message });
        return AssetDerivativeSchema.parse(data);
      },
    },

    observations: {
      async insert(row) {
        const { data, error } = await service
          .from('observations')
          .insert({
            asset_id: row.asset_id,
            project_id: row.project_id,
            org_id: row.org_id,
            observation_type: row.observation_type,
            metrics: row.metrics,
            notes: row.notes,
          })
          .select('id')
          .single();
        if (error) throw errors.internal('observation insert failed', { cause: error.message });
        return { id: (data as { id: string }).id };
      },
    },

    reports: {
      async listTemplates(ctx, sector) {
        let query = scoped(ctx).from('report_templates').select('*');
        if (sector !== undefined) query = query.eq('sector', sector);
        const { data, error } = await query.order('created_at', { ascending: false });
        if (error) throw errors.internal('list templates failed', { cause: error.message });
        return ((data ?? []) as unknown[]).map((r) => ReportTemplateRowSchema.parse(r));
      },
      async getTemplate(ctx, id) {
        const { data, error } = await scoped(ctx)
          .from('report_templates')
          .select('*')
          .eq('id', id)
          .maybeSingle();
        if (error) throw errors.internal('get template failed', { cause: error.message });
        return data ? ReportTemplateRowSchema.parse(data) : null;
      },
      async createPackage(input) {
        // Service role: org_id comes from the verified JWT via the caller, never
        // a request body (§3.4).
        const { data, error } = await service
          .from('evidence_packages')
          .insert({
            project_id: input.project_id,
            org_id: input.org_id,
            name: input.name,
            asset_ids: [...input.asset_ids],
            change_event_ids: [...input.change_event_ids],
            template_id: input.template_id,
            template_version: input.template_version,
            status: input.status,
            audit_trail: input.audit_trail,
          })
          .select('*')
          .single();
        if (error) throw errors.internal('report package insert failed', { cause: error.message });
        return ReportSchema.parse(data);
      },
      async getPackage(ctx, id) {
        const { data, error } = await scoped(ctx)
          .from('evidence_packages')
          .select('*')
          .eq('id', id)
          .maybeSingle();
        if (error) throw errors.internal('get report package failed', { cause: error.message });
        return data ? ReportSchema.parse(data) : null;
      },
      async finalizePackage(id, input) {
        const { error } = await service
          .from('evidence_packages')
          .update({
            report_cloudinary_url: input.reportCloudinaryUrl,
            report_html_url: input.reportHtmlUrl,
            byte_size: input.byteSize,
            status: input.status,
          })
          .eq('id', id);
        if (error) throw errors.internal('report finalize failed', { cause: error.message });
      },
      async insertManifestEntry(input) {
        // Service role: manifests have no INSERT policy (report worker only). The
        // DB trigger forces org_id to the parent package's org, so it is not sent.
        const { error } = await service.from('report_manifest_entries').insert({
          evidence_package_id: input.evidence_package_id,
          ordinal: input.ordinal,
          role: input.role,
          cloudinary_public_id: input.cloudinary_public_id,
          derivative_public_id: input.derivative_public_id,
          sha256_hash: input.sha256_hash,
          byte_size: input.byte_size,
          verified_at: input.verified_at,
        });
        if (error) throw errors.internal('manifest insert failed', { cause: error.message });
      },
      async listManifest(ctx, packageId) {
        const { data, error } = await scoped(ctx)
          .from('report_manifest_entries')
          .select('*')
          .eq('evidence_package_id', packageId)
          .order('ordinal', { ascending: true });
        if (error) throw errors.internal('list manifest failed', { cause: error.message });
        return ((data ?? []) as unknown[]).map((r) => ReportManifestEntrySchema.parse(r));
      },
    },

    async listAssetPublicIds() {
      const { data, error } = await service.from('assets').select('cloudinary_public_id, org_id');
      if (error) throw errors.internal('reconcile asset list failed', { cause: error.message });
      return (data ?? []).map((r) => {
        const row = r as { cloudinary_public_id: string; org_id: string };
        return { public_id: row.cloudinary_public_id, org_id: row.org_id };
      });
    },

    async listDerivativePublicIds() {
      const { data, error } = await service.from('asset_derivatives').select('public_id, org_id');
      if (error) throw errors.internal('reconcile derivative list failed', { cause: error.message });
      return (data ?? []).map((r) => {
        const row = r as { public_id: string; org_id: string };
        return { public_id: row.public_id, org_id: row.org_id };
      });
    },

    async setOrgBytesUsed(orgId, bytesUsed) {
      // bytes_used is not evidence and carries no immutability trigger, so the
      // reconciliation job may recompute it (ARCHITECTURE.md §3.2).
      const { error } = await service
        .from('orgs')
        .update({ bytes_used: bytesUsed })
        .eq('id', orgId);
      if (error) throw errors.internal('set bytes_used failed', { cause: error.message });
    },

    async ping() {
      const { error } = await service.from('orgs').select('id').limit(1);
      if (error) throw errors.internal('db ping failed', { cause: error.message });
    },

    async orgIdForProject(projectId) {
      const { data, error } = await service
        .from('projects')
        .select('org_id')
        .eq('id', projectId)
        .maybeSingle();
      if (error) throw errors.internal('org lookup failed', { cause: error.message });
      return data ? (data as { org_id: string }).org_id : null;
    },

    async getProjectService(projectId) {
      const { data, error } = await service
        .from('projects')
        .select('*')
        .eq('id', projectId)
        .maybeSingle();
      if (error) throw errors.internal('service project lookup failed', { cause: error.message });
      return data ? ProjectSchema.parse(data) : null;
    },
  };
}

/** Depth-first collection of a project and all its descendants by parent link. */
function collectSubtree(all: readonly Project[], rootId: string): Project[] {
  const byParent = new Map<string, Project[]>();
  for (const p of all) {
    const key = p.parent_project_id ?? '__root__';
    const list = byParent.get(key) ?? [];
    list.push(p);
    byParent.set(key, list);
  }
  const root = all.find((p) => p.id === rootId);
  if (root === undefined) return [];
  const out: Project[] = [];
  const stack: Project[] = [root];
  while (stack.length > 0) {
    const node = stack.pop() as Project;
    out.push(node);
    const children = byParent.get(node.id) ?? [];
    for (const child of children) stack.push(child);
  }
  return out;
}
