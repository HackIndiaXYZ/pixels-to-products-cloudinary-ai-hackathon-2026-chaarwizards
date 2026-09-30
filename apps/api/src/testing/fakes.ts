/**
 * In-memory fakes for the injectable ports, plus token/config helpers. These let
 * the gate's integration tests exercise the real Fastify app end to end without
 * live Supabase / Cloudinary / Redis.
 *
 * The fake DB deliberately enforces org-scoping on every request-scoped read —
 * that mirrors what RLS does in production, so a test asserting "org A cannot
 * read org B" is asserting the API always scopes by the verified JWT org, never
 * the body. Real RLS enforcement is proven separately by the Phase 1 pgTAP
 * suite; here we prove the API boundary honours it.
 */
import jwt from 'jsonwebtoken';
import { createHash, generateKeyPairSync, sign as edSign } from 'node:crypto';
import { buildSigningPayload, canonicalize, type JsonValue, type SigningPayloadInput } from '@impact/shared';
import type { Asset, AssetDerivative, ChangeEvent, Observation, Org, Project, Report, ReportManifestEntry } from '@impact/shared';
import type { Config } from '../config.js';
import type {
  AssetInsert,
  ChangeEventInsert,
  CloudinaryAdminPort,
  CloudinaryPort,
  CloudinaryResource,
  DbPort,
  DerivativeInsert,
  IntegrityCheck,
  IntegrityContract,
  ManifestEntryInsert,
  ManualPairInsert,
  ObservationInsert,
  PairingAssetRow,
  QueuePort,
  ReportPackageInsert,
  ReportReceipt,
  ReportTemplateRow,
  VerificationUpdate,
} from '../ports.js';
import type { DetectChangeRequest, DetectChangeResponse, MlClient } from '../services/ml-client.js';
import type { ReportRenderer } from '../reports/renderer.js';

export const TEST_JWT_SECRET = 'test-supabase-jwt-secret';
export const ORG_A = '11111111-1111-1111-1111-111111111111';
export const ORG_B = '22222222-2222-2222-2222-222222222222';

/**
 * Fake audit-chain hash, formula-parallel to append_audit_log / the SQL range
 * verifier: sha256 over prev|action|actor_type|actor_id|details_canonical|
 * hashed_at with the same COALESCE sentinels. Append and verifyChainRange share
 * it, so a tampered field in the fake store fails verification just as it does
 * in Postgres.
 */
function fakeChainHash(
  previousHash: string | null,
  action: string,
  actorType: string,
  actorId: string | null,
  detailsCanonical: string | null,
  hashedAt: string,
): string {
  return createHash('sha256')
    .update(
      [
        previousHash ?? 'genesis',
        action,
        actorType,
        actorId ?? '',
        detailsCanonical ?? 'null',
        hashedAt,
      ].join('|'),
      'utf8',
    )
    .digest('hex');
}

export function testConfig(overrides: Partial<Config> = {}): Config {
  return {
    NODE_ENV: 'test',
    HOST: '0.0.0.0',
    PORT: 8080,
    LOG_LEVEL: 'error',
    SUPABASE_URL: 'http://localhost:54321',
    SUPABASE_ANON_KEY: 'anon',
    SUPABASE_SERVICE_KEY: 'service',
    SUPABASE_JWT_SECRET: TEST_JWT_SECRET,
    CLOUDINARY_CLOUD_NAME: 'demo',
    CLOUDINARY_API_KEY: 'key',
    CLOUDINARY_API_SECRET: 'secret',
    CLOUDINARY_UPLOAD_PRESET: 'verified_capture',
    INTERNAL_JWT_SECRET: 'internal-secret',
    REDIS_URL: 'redis://localhost:6379',
    ML_SERVICE_URL: 'http://localhost:9000',
    DASHBOARD_URL: 'http://localhost:5173',
    ORG_UPLOAD_RATE_MAX: 600,
    ORG_UPLOAD_RATE_WINDOW_MS: 60_000,
    ...overrides,
  };
}

/** Mint a Supabase-style JWT with org_id/role in app_metadata (as at redemption). */
export function makeToken(opts: {
  sub?: string;
  orgId: string;
  role: 'platform_admin' | 'org_admin' | 'member' | 'viewer';
  email?: string;
  expired?: boolean;
}): string {
  const payload: Record<string, unknown> = {
    sub: opts.sub ?? 'user-' + opts.orgId,
    email: opts.email ?? 'user@example.com',
    app_metadata: { org_id: opts.orgId, role: opts.role },
  };
  return jwt.sign(payload, TEST_JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: opts.expired === true ? -10 : 3600,
  });
}

/** A fresh Ed25519 keypair for signing capture payloads in tests. */
export function makeDeviceKeys(): { publicKeyB64: string; privateKey: ReturnType<typeof generateKeyPairSync>['privateKey'] } {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  // Export the raw 32-byte public key (what a device transmits).
  const der = publicKey.export({ format: 'der', type: 'spki' }) as Buffer;
  const raw = der.subarray(der.length - 32);
  return { publicKeyB64: raw.toString('base64'), privateKey };
}

export function signCapture(
  payload: SigningPayloadInput,
  privateKey: ReturnType<typeof generateKeyPairSync>['privateKey'],
): string {
  const canonical = buildSigningPayload(payload);
  return edSign(null, Buffer.from(canonical, 'utf8'), privateKey).toString('base64');
}

let seq = 0;
function uuid(): string {
  seq += 1;
  return `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`;
}

export interface FakeDb extends DbPort {
  _projects: Map<string, Project>;
  _assets: Map<string, Asset>;
  _orgs: Map<string, Org>;
  _derivatives: Map<string, AssetDerivative>;
  _observations: Observation[];
  _changeEvents: Map<string, ChangeEvent>;
  _pairingCoords: Map<string, { lat: number; lon: number }>;
  _invites: { org_id: string; email: string; role: string; token_hash: string; expires_at: string }[];
  _audit: {
    id: number;
    assetId: string;
    action: string;
    actorType: string;
    actorId: string | null;
    details: Record<string, unknown> | null;
    details_canonical: string;
    previous_hash: string | null;
    current_hash: string;
    hashed_at: string;
  }[];
  _templates: Map<string, ReportTemplateRow>;
  _packages: Map<string, Report>;
  _manifest: ReportManifestEntry[];
  seedProject(p: Partial<Project> & { org_id: string }): Project;
  seedAsset(
    a: Partial<Asset> & { org_id: string; project_id: string; gps_lat?: number; gps_lon?: number },
  ): Asset;
  seedDerivative(d: Partial<AssetDerivative> & { parent_asset_id: string; org_id: string }): AssetDerivative;
  seedTemplate(t: Partial<ReportTemplateRow> & { org_id: string; handlebars_template: string; name: string }): ReportTemplateRow;
  seedChangeEvent(e: Partial<ChangeEvent> & { org_id: string; project_id: string }): ChangeEvent;
}

export function makeFakeDb(): FakeDb {
  const projects = new Map<string, Project>();
  const assets = new Map<string, Asset>();
  const orgs = new Map<string, Org>();
  const derivatives = new Map<string, AssetDerivative>();
  const observations: Observation[] = [];
  const changeEvents = new Map<string, ChangeEvent>();
  const pairingCoords = new Map<string, { lat: number; lon: number }>();
  const invites: FakeDb['_invites'] = [];
  const audit: FakeDb['_audit'] = [];
  const templates = new Map<string, ReportTemplateRow>();
  const packages = new Map<string, Report>();
  const manifest: ReportManifestEntry[] = [];

  const nowIso = new Date().toISOString();

  function assetFromInsert(row: AssetInsert): Asset {
    return {
      id: uuid(),
      project_id: row.project_id,
      org_id: row.org_id,
      cloudinary_public_id: row.cloudinary_public_id,
      cloudinary_asset_id: row.cloudinary_asset_id,
      asset_type: row.asset_type,
      device_capture_timestamp: row.device_capture_timestamp,
      device_commit_hash: row.device_commit_hash,
      device_id: row.device_id,
      device_public_key: row.device_public_key,
      capture_signature: row.capture_signature,
      gps_accuracy_meters: row.gps_accuracy_meters,
      gps_altitude: row.gps_altitude,
      gps_provider: row.gps_provider as Asset['gps_provider'],
      caption: row.caption,
      caption_signature: row.caption_signature,
      caption_language: row.caption_language,
      caption_created_at: row.caption_created_at,
      exif: row.exif,
      exif_hash: row.exif_hash,
      sha256_hash: row.sha256_hash,
      upload_started_at: row.upload_started_at,
      ntp_offset_seconds: row.ntp_offset_seconds,
      signature_tier: row.signature_tier,
      server_received_at: nowIso,
      cloudinary_created_at: row.server_upload_timestamp,
      observation_type: row.observation_type,
      phase: row.phase,
      app_version: row.app_version,
      upload_status: 'pending',
      created_at: nowIso,
    } as Asset;
  }

  const db: FakeDb = {
    _projects: projects,
    _assets: assets,
    _orgs: orgs,
    _derivatives: derivatives,
    _observations: observations,
    _changeEvents: changeEvents,
    _pairingCoords: pairingCoords,
    _invites: invites,
    _audit: audit,
    _templates: templates,
    _packages: packages,
    _manifest: manifest,

    seedProject(p) {
      const proj: Project = {
        id: p.id ?? uuid(),
        org_id: p.org_id,
        name: p.name ?? 'Test Project',
        sector: p.sector ?? 'forestry',
        start_date: p.start_date ?? null,
        end_date: p.end_date ?? null,
        config: p.config ?? { observation_types: [] },
        parent_project_id: p.parent_project_id ?? null,
        created_at: nowIso,
      };
      projects.set(proj.id, proj);
      return proj;
    },

    seedAsset(a) {
      const { gps_lat, gps_lon, ...assetOverrides } = a;
      const asset = { ...assetFromInsert({
        project_id: a.project_id,
        org_id: a.org_id,
        cloudinary_public_id: a.cloudinary_public_id ?? `${a.org_id}/${a.project_id}/sha`,
        cloudinary_asset_id: null,
        asset_type: 'image',
        device_capture_timestamp: nowIso,
        device_commit_hash: a.sha256_hash ?? 'commit',
        device_id: 'dev',
        device_public_key: 'pk',
        capture_signature: 'sig',
        device_monotonic_ms: 0,
        ntp_offset_seconds: null,
        gps_lat: null,
        gps_lon: null,
        gps_accuracy_meters: null,
        gps_altitude: null,
        gps_provider: null,
        caption: null,
        caption_signature: null,
        caption_language: null,
        caption_created_at: null,
        exif: null,
        exif_hash: a.exif_hash ?? 'exifhash',
        sha256_hash: a.sha256_hash ?? 'sha',
        observation_type: 'planting',
        phase: 'before',
        app_version: null,
        server_upload_timestamp: null,
        upload_started_at: null,
        signature_tier: 'device',
      }), ...assetOverrides, id: a.id ?? uuid() } as Asset;
      assets.set(asset.id, asset);
      if (gps_lat !== undefined && gps_lon !== undefined) {
        pairingCoords.set(asset.id, { lat: gps_lat, lon: gps_lon });
      }
      return asset;
    },

    seedDerivative(d) {
      const derivative: AssetDerivative = {
        id: d.id ?? uuid(),
        parent_asset_id: d.parent_asset_id,
        org_id: d.org_id,
        transformation: d.transformation ?? 'report_full',
        kind: d.kind ?? null,
        public_id: d.public_id ?? `${d.org_id}/deriv/${uuid()}`,
        is_generative: d.is_generative ?? false,
        cloudinary_asset_id: d.cloudinary_asset_id ?? null,
        cloudinary_version: d.cloudinary_version ?? null,
        byte_size: d.byte_size ?? null,
        sha256_hash: d.sha256_hash ?? null,
        created_at: nowIso,
      };
      derivatives.set(derivative.id, derivative);
      return derivative;
    },

    seedTemplate(t) {
      const template: ReportTemplateRow = {
        id: t.id ?? uuid(),
        org_id: t.org_id,
        sector: t.sector ?? 'forestry',
        name: t.name,
        description: t.description ?? null,
        handlebars_template: t.handlebars_template,
        config: t.config ?? {},
        is_default: t.is_default ?? false,
        created_at: nowIso,
      };
      templates.set(template.id, template);
      return template;
    },

    seedChangeEvent(e) {
      const event: ChangeEvent = {
        id: e.id ?? uuid(),
        project_id: e.project_id,
        org_id: e.org_id,
        before_asset_id: e.before_asset_id ?? null,
        after_asset_id: e.after_asset_id ?? null,
        change_type: e.change_type ?? 'sapling_planting',
        change_metrics: e.change_metrics ?? { saplings_planted: 49, area_covered_sqm: 1200.5 },
        detection_method: e.detection_method ?? 'ml',
        model_version: e.model_version ?? 'v1-placeholder',
        confidence: e.confidence ?? 0.9,
        diff_asset_cloudinary_id: e.diff_asset_cloudinary_id ?? null,
        gps_distance_meters: e.gps_distance_meters ?? 3.2,
        time_difference_hours: e.time_difference_hours ?? 72,
        status: e.status ?? 'detected',
        failure_reason: e.failure_reason ?? null,
        created_at: nowIso,
      };
      changeEvents.set(event.id, event);
      return event;
    },

    projects: {
      async list(ctx, params) {
        const rows = [...projects.values()].filter((p) => p.org_id === ctx.orgId);
        const offset = params.cursor ? Number(Buffer.from(params.cursor, 'base64url').toString()) || 0 : 0;
        return { rows: rows.slice(offset, offset + params.limit), nextCursor: null };
      },
      async get(ctx, id) {
        const p = projects.get(id);
        return p && p.org_id === ctx.orgId ? p : null;
      },
      async tree(ctx, rootId) {
        const all = [...projects.values()].filter((p) => p.org_id === ctx.orgId);
        const root = all.find((p) => p.id === rootId);
        if (!root) return [];
        const out: Project[] = [];
        const stack = [root];
        while (stack.length > 0) {
          const n = stack.pop() as Project;
          out.push(n);
          for (const c of all.filter((p) => p.parent_project_id === n.id)) stack.push(c);
        }
        return out;
      },
      async create(ctx, input) {
        return db.seedProject({ ...input, org_id: ctx.orgId });
      },
      async updateConfig(ctx, id, config) {
        const p = projects.get(id);
        if (!p || p.org_id !== ctx.orgId) return null;
        const updated = { ...p, config };
        projects.set(id, updated);
        return updated;
      },
    },

    assets: {
      async getById(ctx, id) {
        const a = assets.get(id);
        return a && a.org_id === ctx.orgId ? a : null;
      },
      async list(ctx, projectId, params) {
        const rows = [...assets.values()].filter(
          (a) => a.org_id === ctx.orgId && a.project_id === projectId,
        );
        return { rows: rows.slice(0, params.limit), nextCursor: null };
      },
      async searchAssets(ctx, filters, params) {
        // Mirror search_assets: RLS-equivalent org scope, then the seven facets,
        // with total_matched/facet_counts over the FULL filtered set.
        const tagList = (a: Asset): string[] => {
          const raw = (a as { ai_tags?: unknown }).ai_tags;
          return Array.isArray(raw) ? (raw as unknown[]).map((t) => String(t)) : [];
        };
        const coords = (a: Asset): [number, number] | null => {
          const c = pairingCoords.get(a.id);
          return c ? [c.lon, c.lat] : null;
        };
        const all = [...assets.values()]
          .filter((a) => a.org_id === ctx.orgId)
          .filter((a) => filters.assetType === undefined || a.asset_type === filters.assetType)
          .filter((a) => filters.phase === undefined || a.phase === filters.phase)
          .filter((a) => filters.dateFrom === undefined || a.device_capture_timestamp >= filters.dateFrom)
          .filter((a) => filters.dateTo === undefined || a.device_capture_timestamp <= filters.dateTo)
          .filter(
            (a) =>
              filters.gpsAccuracyMax === undefined ||
              (a.gps_accuracy_meters !== null &&
                a.gps_accuracy_meters !== undefined &&
                a.gps_accuracy_meters <= filters.gpsAccuracyMax),
          )
          .filter((a) => {
            if (filters.tags === undefined || filters.tags.length === 0) return true;
            const have = new Set(tagList(a));
            return filters.tags.every((t) => have.has(t));
          })
          .filter((a) => {
            if (filters.bbox === undefined) return true;
            const c = coords(a);
            if (c === null) return false;
            const [minLon, minLat, maxLon, maxLat] = filters.bbox;
            return c[0] >= minLon && c[0] <= maxLon && c[1] >= minLat && c[1] <= maxLat;
          })
          .filter((a) => {
            if (filters.q === undefined || filters.q === '') return true;
            const q = filters.q.toLowerCase();
            return (
              (a.caption ?? '').toLowerCase().includes(q) ||
              (a.observation_type ?? '').toLowerCase().includes(q) ||
              tagList(a).join(',').toLowerCase().includes(q)
            );
          })
          .sort((x, y) => (x.device_capture_timestamp < y.device_capture_timestamp ? 1 : -1));

        const limit = params.limit;
        const page = all.slice(0, limit).map((a) => ({
          id: a.id,
          project_id: a.project_id,
          cloudinary_public_id: a.cloudinary_public_id,
          asset_type: a.asset_type ?? null,
          device_capture_timestamp: a.device_capture_timestamp,
          gps_point: coords(a) ? { type: 'Point' as const, coordinates: coords(a) as [number, number] } : null,
          gps_accuracy_meters: a.gps_accuracy_meters ?? null,
          gps_provider: a.gps_provider ?? null,
          caption: a.caption ?? null,
          ai_tags: tagList(a),
          observation_type: a.observation_type ?? null,
          phase: a.phase ?? null,
          upload_status: a.upload_status,
        }));
        const facetPhase: Record<string, number> = {};
        for (const a of all) {
          if (a.phase) facetPhase[a.phase] = (facetPhase[a.phase] ?? 0) + 1;
        }
        return {
          rows: page,
          totalMatched: all.length,
          truncated: all.length > 1000,
          facetCounts: { phase: facetPhase },
          nextCursor: null,
        };
      },
      async findBySha(sha256, projectId) {
        return (
          [...assets.values()].find(
            (a) => a.sha256_hash === sha256 && a.project_id === projectId,
          ) ?? null
        );
      },
      async getByIdService(id) {
        return assets.get(id) ?? null;
      },
      async insert(row) {
        const a = assetFromInsert(row);
        assets.set(a.id, a);
        return a;
      },
      async setVerification(assetId, update: VerificationUpdate) {
        const a = assets.get(assetId);
        if (!a) return;
        assets.set(assetId, {
          ...a,
          upload_status: update.upload_status ?? a.upload_status,
        } as Asset);
      },
      async listForPairing(projectId): Promise<PairingAssetRow[]> {
        // Mirror assets_for_pairing: verified + located only.
        return [...assets.values()]
          .filter((a) => a.project_id === projectId && a.upload_status === 'verified')
          .map((a) => {
            const coords = pairingCoords.get(a.id);
            if (coords === undefined) return null;
            return {
              id: a.id,
              org_id: a.org_id,
              project_id: a.project_id,
              observation_type: a.observation_type ?? null,
              phase: a.phase ?? null,
              device_capture_timestamp: a.device_capture_timestamp,
              gps_lat: coords.lat,
              gps_lon: coords.lon,
              cloudinary_public_id: a.cloudinary_public_id,
              asset_type: a.asset_type ?? null,
            } satisfies PairingAssetRow;
          })
          .filter((r): r is PairingAssetRow => r !== null);
      },
    },

    changeEvents: {
      async findPair(beforeAssetId, afterAssetId) {
        return (
          [...changeEvents.values()].find(
            (e) =>
              e.before_asset_id === beforeAssetId &&
              e.after_asset_id === afterAssetId &&
              e.status !== 'split',
          ) ?? null
        );
      },
      async insert(row: ChangeEventInsert) {
        const event: ChangeEvent = {
          id: uuid(),
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
          created_at: nowIso,
        };
        changeEvents.set(event.id, event);
        return event;
      },
      async getById(ctx, id) {
        const e = changeEvents.get(id);
        return e && e.org_id === ctx.orgId ? e : null;
      },
      async listByProject(ctx, projectId, params) {
        const rows = [...changeEvents.values()]
          .filter((e) => e.org_id === ctx.orgId && e.project_id === projectId)
          .sort((x, y) => (x.created_at < y.created_at ? 1 : -1));
        return { rows: rows.slice(0, params.limit), nextCursor: null };
      },
      async createManual(ctx, input: ManualPairInsert) {
        const event: ChangeEvent = {
          id: uuid(),
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
          created_at: nowIso,
        };
        changeEvents.set(event.id, event);
        return event;
      },
      async setStatus(ctx, id, status) {
        const e = changeEvents.get(id);
        if (!e || e.org_id !== ctx.orgId) return null;
        const updated = { ...e, status };
        changeEvents.set(id, updated);
        return updated;
      },
    },

    orgs: {
      async create(input) {
        const org: Org = {
          id: uuid(),
          name: input.name,
          type: input.type ?? null,
          settings: {},
          quota_bytes: 53687091200,
          bytes_used: 0,
          retention_years: 7,
          created_at: nowIso,
        };
        orgs.set(org.id, org);
        return org;
      },
    },

    invites: {
      async create(input) {
        invites.push(input);
        return { id: uuid() };
      },
    },

    audit: {
      async append(input) {
        // Mirror append_audit_log: a per-asset hash chain over the RFC 8785
        // canonical details and the STORED hashed_at (§3.8). The formula matches
        // fakeChainHash so verifyChainRange (below) recomputes byte-identically,
        // making a tampered fake row fail exactly as a tampered DB row would.
        const details_canonical = canonicalize((input.details ?? null) as JsonValue);
        const prior = audit.filter((r) => r.assetId === input.assetId);
        const previous_hash =
          prior.length > 0 ? (prior[prior.length - 1] as { current_hash: string }).current_hash : null;
        // A stable hashed_at derived from position, never wall-clock, so the
        // chain is reproducible across runs.
        const hashed_at = new Date(1700000000000 + prior.length * 1000).toISOString();
        const current_hash = fakeChainHash(
          previous_hash,
          input.action,
          input.actorType,
          input.actorId,
          details_canonical,
          hashed_at,
        );
        audit.push({
          id: audit.length + 1,
          assetId: input.assetId,
          action: input.action,
          actorType: input.actorType,
          actorId: input.actorId,
          details: input.details ?? null,
          details_canonical,
          previous_hash,
          current_hash,
          hashed_at,
        });
      },
      async chainForAsset(assetId) {
        return audit
          .filter((r) => r.assetId === assetId)
          .map((r) => ({
            action: r.action,
            previous_hash: r.previous_hash,
            current_hash: r.current_hash,
            hashed_at: r.hashed_at,
          }));
      },
      async verifyChainRange(ctx, assetId, from, to) {
        // Mirror verify_audit_chain_range: recompute each row's content hash and
        // check link continuity, naming the first tampered row (hash_mismatch) or
        // gap (broken_link). Org-scoped like RLS: another org's asset → 0 rows.
        const a = assets.get(assetId);
        const visible = a !== undefined && a.org_id === ctx.orgId;
        const rows = visible
          ? audit
              .filter((r) => r.assetId === assetId)
              .filter((r) => (from === null || r.id >= from) && (to === null || r.id <= to))
              .sort((x, y) => x.id - y.id)
          : [];
        let previous: string | null = null;
        let anchored = from === null;
        let checked = 0;
        let firstId: number | null = null;
        let lastId: number | null = null;
        let tip: string | null = null;
        for (const r of rows) {
          if (!anchored) {
            previous = r.previous_hash;
            anchored = true;
          }
          if (firstId === null) firstId = r.id;
          if (r.previous_hash !== previous) {
            return {
              ok: false,
              checked,
              first_id: firstId,
              last_id: lastId,
              tip_hash: tip,
              failure: {
                audit_id: r.id,
                kind: 'broken_link' as const,
                reason: `row ${r.id} previous_hash does not chain to the preceding row (a prior row was deleted or reordered)`,
              },
            };
          }
          const expected = fakeChainHash(
            previous,
            r.action,
            r.actorType,
            r.actorId,
            r.details_canonical,
            r.hashed_at,
          );
          if (r.current_hash !== expected) {
            return {
              ok: false,
              checked,
              first_id: firstId,
              last_id: lastId,
              tip_hash: tip,
              failure: {
                audit_id: r.id,
                kind: 'hash_mismatch' as const,
                reason: `row ${r.id} content does not reproduce its stored current_hash (a stored value was tampered)`,
              },
            };
          }
          previous = r.current_hash;
          tip = r.current_hash;
          lastId = r.id;
          checked += 1;
        }
        return { ok: true, checked, first_id: firstId, last_id: lastId, tip_hash: tip, failure: null };
      },
      async fullChainForAsset(ctx, assetId, from, to) {
        const a = assets.get(assetId);
        if (a === undefined || a.org_id !== ctx.orgId) return [];
        return audit
          .filter((r) => r.assetId === assetId)
          .filter((r) => (from === null || r.id >= from) && (to === null || r.id <= to))
          .sort((x, y) => x.id - y.id)
          .map((r) => ({
            id: r.id,
            action: r.action,
            details: r.details,
            details_canonical: r.details_canonical,
          }));
      },
    },

    integrity: {
      async verify(ctx, assetId): Promise<IntegrityCheck[]> {
        const a = assets.get(assetId);
        const failed = a?.upload_status === 'flagged';
        return [
          {
            check_name: 'sha256_matches_commit',
            state: failed ? 'fail' : 'pass',
            details: {},
          },
          { check_name: 'clock_skew', state: 'unknown', details: {} },
        ];
      },
      async contract(ctx, assetId): Promise<IntegrityContract | null> {
        const a = assets.get(assetId);
        if (a === undefined || a.org_id !== ctx.orgId) return null;
        const flagged = a.upload_status === 'flagged';
        // A flagged asset fails its content check; a verified one passes every
        // DB-decidable check. The two crypto checks are `unknown` in the fake
        // (no real key material), which the panel renders honestly (§3.7).
        return {
          asset_id: a.id,
          device_capture_timestamp: a.device_capture_timestamp,
          server_upload_timestamp: a.server_upload_timestamp ?? null,
          server_received_at: a.server_received_at ?? null,
          clock_drift_seconds: null,
          gps_accuracy_meters: a.gps_accuracy_meters ?? null,
          gps_provider: a.gps_provider ?? null,
          device_signature_verified: flagged ? false : null,
          exif_hash_verified: flagged ? false : null,
          caption_signature_verified: a.caption ? null : true,
          audit_chain_intact: true,
          sha256_matches_commit: !flagged,
        };
      },
    },

    derivatives: {
      async getByPublicId(ctx, publicId): Promise<AssetDerivative | null> {
        const d = [...derivatives.values()].find((x) => x.public_id === publicId);
        return d && d.org_id === ctx.orgId ? d : null;
      },
      async listByParent(ctx, parentAssetId): Promise<AssetDerivative[]> {
        return [...derivatives.values()]
          .filter((d) => d.org_id === ctx.orgId && d.parent_asset_id === parentAssetId)
          .sort((x, y) => (x.created_at < y.created_at ? -1 : 1));
      },
      async getById(id): Promise<AssetDerivative | null> {
        return derivatives.get(id) ?? null;
      },
      async insert(row: DerivativeInsert): Promise<AssetDerivative> {
        // Mirror the DB trigger: org_id is forced to the parent asset's org.
        const parent = assets.get(row.parent_asset_id);
        if (parent === undefined) throw new Error('parent asset does not exist');
        const derivative: AssetDerivative = {
          id: uuid(),
          parent_asset_id: row.parent_asset_id,
          org_id: parent.org_id,
          transformation: row.transformation,
          kind: row.kind,
          public_id: row.public_id,
          is_generative: row.is_generative,
          cloudinary_asset_id: row.cloudinary_asset_id,
          cloudinary_version: row.cloudinary_version,
          byte_size: row.byte_size,
          sha256_hash: row.sha256_hash,
          created_at: nowIso,
        };
        derivatives.set(derivative.id, derivative);
        return derivative;
      },
    },

    observations: {
      async insert(row: ObservationInsert) {
        const obs: Observation = {
          id: uuid(),
          asset_id: row.asset_id,
          project_id: row.project_id,
          org_id: row.org_id,
          observer_id: null,
          observation_type: row.observation_type,
          metrics: row.metrics,
          notes: row.notes,
          created_at: nowIso,
        };
        observations.push(obs);
        return { id: obs.id };
      },
    },

    reports: {
      async listTemplates(ctx, sector) {
        return [...templates.values()]
          .filter((t) => t.org_id === ctx.orgId)
          .filter((t) => sector === undefined || t.sector === sector);
      },
      async getTemplate(ctx, id) {
        const t = templates.get(id);
        return t && t.org_id === ctx.orgId ? t : null;
      },
      async createPackage(input: ReportPackageInsert) {
        const report: Report = {
          id: uuid(),
          project_id: input.project_id,
          org_id: input.org_id,
          name: input.name,
          asset_ids: [...input.asset_ids],
          change_event_ids: [...input.change_event_ids],
          report_cloudinary_url: null,
          audit_trail: input.audit_trail,
          status: input.status,
          generated_at: nowIso,
        };
        packages.set(report.id, report);
        return report;
      },
      async getPackage(ctx, id) {
        const p = packages.get(id);
        return p && p.org_id === ctx.orgId ? p : null;
      },
      async finalizePackage(id, input) {
        const p = packages.get(id);
        if (p !== undefined) {
          packages.set(id, { ...p, report_cloudinary_url: input.reportCloudinaryUrl, status: input.status });
        }
      },
      async insertManifestEntry(input: ManifestEntryInsert) {
        // Mirror the DB trigger: org_id is forced to the parent package's org.
        const parent = packages.get(input.evidence_package_id);
        if (parent === undefined) throw new Error('evidence_package does not exist');
        manifest.push({
          id: manifest.length + 1,
          evidence_package_id: input.evidence_package_id,
          org_id: parent.org_id ?? '',
          ordinal: input.ordinal,
          role: input.role,
          cloudinary_public_id: input.cloudinary_public_id,
          derivative_public_id: input.derivative_public_id,
          sha256_hash: input.sha256_hash,
          byte_size: input.byte_size,
          verified_at: input.verified_at,
          created_at: nowIso,
        });
      },
      async listManifest(ctx, packageId) {
        return manifest
          .filter((m) => m.evidence_package_id === packageId && m.org_id === ctx.orgId)
          .sort((a, b) => a.ordinal - b.ordinal);
      },
      async verificationReceipt(ctx, packageId): Promise<ReportReceipt | null> {
        const pkg = packages.get(packageId);
        if (pkg === undefined || pkg.org_id !== ctx.orgId) return null;
        const assetChains = [];
        let allOk = true;
        let index = 0;
        for (const assetId of pkg.asset_ids) {
          const chain = await db.audit.verifyChainRange(ctx, assetId, null, null);
          if (!chain.ok) allOk = false;
          assetChains.push({
            index,
            chain_verified: chain.ok,
            chain_length: chain.checked,
            tip_hash: chain.tip_hash,
            failure: chain.failure,
          });
          index += 1;
        }
        const manifestEntries = manifest
          .filter((m) => m.evidence_package_id === packageId)
          .sort((a, b) => a.ordinal - b.ordinal)
          .map((m) => ({
            ordinal: m.ordinal,
            role: m.role,
            sha256_hash: m.sha256_hash ?? null,
            byte_size: m.byte_size ?? null,
            verified: m.verified_at !== null && m.verified_at !== undefined,
          }));
        // Public-safe: no org_id, user, GPS, caption, or public_id.
        return {
          report_id: pkg.id,
          status: pkg.status,
          template_version:
            typeof pkg.audit_trail?.['template_version'] === 'string'
              ? (pkg.audit_trail['template_version'] as string)
              : null,
          generated_at: pkg.generated_at,
          byte_size: null,
          chains_verified: allOk,
          asset_chains: assetChains,
          manifest: manifestEntries,
        };
      },
    },

    async listAssetPublicIds() {
      return [...assets.values()].map((a) => ({
        public_id: a.cloudinary_public_id,
        org_id: a.org_id,
      }));
    },

    async listDerivativePublicIds() {
      return [...derivatives.values()].map((d) => ({
        public_id: d.public_id,
        org_id: d.org_id,
      }));
    },

    async setOrgBytesUsed(orgId, bytesUsed) {
      const org = orgs.get(orgId);
      if (org !== undefined) orgs.set(orgId, { ...org, bytes_used: bytesUsed } as Org);
    },

    async orgIdForProject(projectId) {
      return projects.get(projectId)?.org_id ?? null;
    },

    async getProjectService(projectId) {
      return projects.get(projectId) ?? null;
    },

    async ping() {
      /* always ready */
    },
  };

  return db;
}

export function makeFakeCloudinary(
  opts: { signatureValid?: boolean; generativePending?: boolean } = {},
): CloudinaryPort & {
  _artifacts: { publicId: string; format: 'pdf' | 'html'; bytes: Buffer }[];
  _eagerCalls: { sourcePublicId: string; transformation: string; isGenerative: boolean }[];
} {
  const artifacts: { publicId: string; format: 'pdf' | 'html'; bytes: Buffer }[] = [];
  const eagerCalls: { sourcePublicId: string; transformation: string; isGenerative: boolean }[] = [];
  return {
    _artifacts: artifacts,
    _eagerCalls: eagerCalls,
    verifyNotificationSignature() {
      return opts.signatureValid !== false;
    },
    signedDerivativeUrl(publicId, transformation) {
      return `https://res.cloudinary.com/demo/image/upload/${transformation}/s--sig--/v1/${publicId}`;
    },
    originalUrl(publicId, ttlSeconds) {
      return {
        url: `https://res.cloudinary.com/demo/image/authenticated/${publicId}?__cld_token__=exp`,
        expiresAt: Math.floor(Date.now() / 1000) + ttlSeconds,
      };
    },
    async createEagerDerivative(input) {
      // Generative transforms are asynchronous: unless told otherwise, a
      // generative request comes back `pending` (mirrors a 420/423), and the
      // caller must not block on it. Non-generative eager derivatives are ready.
      eagerCalls.push({
        sourcePublicId: input.sourcePublicId,
        transformation: input.transformation,
        isGenerative: input.isGenerative,
      });
      const pending = input.isGenerative && opts.generativePending !== false;
      return {
        status: pending ? 'pending' : 'ready',
        publicId: input.sourcePublicId,
        secureUrl: pending
          ? null
          : `https://res.cloudinary.com/demo/${input.resourceType}/${input.sourceType}/${input.transformation}/v1/${input.sourcePublicId}`,
        bytes: pending ? null : 12345,
        cloudinaryAssetId: pending ? null : `cld-${input.sourcePublicId}`,
        version: pending ? null : '1700000000',
      };
    },
    signRequest(params) {
      // Deterministic stand-in for the SDK signature (tests never hit Cloudinary).
      return `fake-sdk-signature-${Object.keys(params).sort().join('.')}`;
    },
    async uploadArtifact(input) {
      artifacts.push({ publicId: input.publicId, format: input.format, bytes: input.bytes });
      return {
        url: `https://res.cloudinary.com/demo/raw/authenticated/v1/${input.publicId}.${input.format}`,
        publicId: `${input.publicId}.${input.format}`,
        bytes: input.bytes.length,
        version: '1700000000',
      };
    },
  };
}

export function makeFakeCloudinaryAdmin(
  resources: CloudinaryResource[] = [],
): CloudinaryAdminPort & { _presets: unknown[] } {
  const presets: unknown[] = [];
  return {
    _presets: presets,
    async listAllResources() {
      return resources;
    },
    async ensureUploadPreset(definition) {
      presets.push(definition);
    },
  };
}

export function makeFakeQueue(): QueuePort & {
  _jobs: { assetId: string }[];
  _pairJobs: { projectId: string }[];
  _detectJobs: { beforeAssetId: string; afterAssetId: string }[];
  _genAiJobs: {
    reportId: string;
    orgId: string;
    edits: ReadonlyArray<{ parentAssetId: string; sourceDerivativeId: string; transformation: string; kind: string }>;
  }[];
} {
  const jobs: { assetId: string }[] = [];
  const pairJobs: { projectId: string }[] = [];
  const detectJobs: { beforeAssetId: string; afterAssetId: string }[] = [];
  const genAiJobs: {
    reportId: string;
    orgId: string;
    edits: ReadonlyArray<{ parentAssetId: string; sourceDerivativeId: string; transformation: string; kind: string }>;
  }[] = [];
  return {
    _jobs: jobs,
    _pairJobs: pairJobs,
    _detectJobs: detectJobs,
    _genAiJobs: genAiJobs,
    async enqueueAiEnrich(payload) {
      // Idempotent by assetId, matching the BullMQ jobId behaviour.
      if (!jobs.some((j) => j.assetId === payload.assetId)) jobs.push({ assetId: payload.assetId });
    },
    async enqueuePairAssets(payload) {
      if (!pairJobs.some((j) => j.projectId === payload.projectId)) {
        pairJobs.push({ projectId: payload.projectId });
      }
    },
    async enqueueDetectChange(payload) {
      // Idempotent by ordered pair, matching the BullMQ jobId behaviour.
      if (
        !detectJobs.some(
          (j) =>
            j.beforeAssetId === payload.beforeAssetId && j.afterAssetId === payload.afterAssetId,
        )
      ) {
        detectJobs.push({
          beforeAssetId: payload.beforeAssetId,
          afterAssetId: payload.afterAssetId,
        });
      }
    },
    async enqueueReportGenAi(payload) {
      // Idempotent by report, matching the BullMQ jobId behaviour.
      if (!genAiJobs.some((j) => j.reportId === payload.reportId)) {
        genAiJobs.push({ reportId: payload.reportId, orgId: payload.orgId, edits: payload.edits });
      }
    },
    async ping() {
      /* ready */
    },
    async close() {
      /* noop */
    },
  };
}

/**
 * Deterministic fake renderer: turns HTML into a stable pseudo-PDF buffer whose
 * bytes are a pure function of the HTML. Lets the gate assert byte-identical
 * regeneration without a real Chromium (the live Puppeteer render is a
 * user-review item — no browser binary in CI/sandbox).
 */
export function makeFakeRenderer(): ReportRenderer {
  return {
    async htmlToPdf(html) {
      const digest = createHash('sha256').update(html).digest('hex');
      return Buffer.from(`%PDF-1.4-fake\n${digest}\n`, 'utf8');
    },
  };
}

/**
 * Configurable fake ML client. Defaults to a valid forestry detection carrying a
 * model_version. Override to exercise the unsupported envelope (§3.3), a thrown
 * transport error, or off-schema metrics (§3.2).
 */
export function makeFakeMl(
  opts: {
    response?: DetectChangeResponse;
    throwError?: boolean;
    onRequest?: (req: DetectChangeRequest) => DetectChangeResponse;
  } = {},
): MlClient {
  return {
    async detectChange(_ctx, req) {
      if (opts.throwError === true) {
        throw new Error('ml transport failure');
      }
      if (opts.onRequest !== undefined) {
        return opts.onRequest(req);
      }
      if (opts.response !== undefined) {
        return opts.response;
      }
      return {
        change_type: 'sapling_planting',
        change_metrics: { saplings_planted: 49, area_covered_sqm: 1200.5 },
        model_version: 'v1-placeholder',
        confidence: 0.9,
        diff_url: 'https://res.cloudinary.com/demo/image/upload/diff.jpg',
      };
    },
  };
}
