/**
 * Dependency ports. Routes depend on these interfaces, never on a concrete
 * client, so the app can be driven in tests with in-memory fakes and in
 * production with Supabase / Cloudinary / BullMQ. This is also how the isolation
 * story stays testable: every data method takes an {@link AuthContext} or an
 * explicit service marker, so a route can never "forget" to scope by org.
 */
import type {
  Asset,
  AssetDerivative,
  Org,
  Project,
  ProjectConfig,
  Role,
  VerificationState,
} from '@impact/shared';
import type { AuthContext } from './types.js';
import type { UploadPresetDefinition } from './lib/cloudinary-preset.js';

/** A page of rows plus an opaque cursor for the next page. */
export interface Page<T> {
  readonly rows: readonly T[];
  readonly nextCursor: string | null;
  /** True total behind the query, for `search` truncation reporting. */
  readonly totalMatched?: number;
  readonly truncated?: boolean;
}

export interface ListParams {
  readonly limit: number;
  readonly cursor: string | null;
}

/** Row inserted by the webhook ingest path (service role, RLS bypassed). */
export interface AssetInsert {
  readonly project_id: string;
  readonly org_id: string;
  readonly cloudinary_public_id: string;
  readonly cloudinary_asset_id: string | null;
  readonly asset_type: 'image' | 'video' | null;
  readonly device_capture_timestamp: string;
  readonly device_commit_hash: string;
  readonly device_id: string;
  readonly device_public_key: string;
  readonly capture_signature: string;
  readonly device_monotonic_ms: number | null;
  readonly ntp_offset_seconds: number | null;
  readonly gps_lat: number | null;
  readonly gps_lon: number | null;
  readonly gps_accuracy_meters: number | null;
  readonly gps_altitude: number | null;
  readonly gps_provider: string | null;
  readonly caption: string | null;
  readonly caption_signature: string | null;
  readonly caption_language: string | null;
  readonly caption_created_at: string | null;
  readonly exif: Record<string, unknown> | null;
  readonly exif_hash: string;
  readonly sha256_hash: string;
  readonly observation_type: string | null;
  readonly phase: 'before' | 'after' | null;
  readonly app_version: string | null;
  readonly server_upload_timestamp: string | null;
  readonly upload_started_at: string | null;
  readonly signature_tier: 'device' | 'server' | null;
}

/** Mutable verification columns the webhook / verification worker may set. */
export interface VerificationUpdate {
  readonly verification: 'pending' | 'passed' | 'failed' | 'unknown';
  readonly upload_status?: 'pending' | 'verified' | 'flagged';
  readonly verified_at?: string | null;
  readonly quarantined_at?: string | null;
  readonly exif_verified_at?: string | null;
  readonly caption_verified_at?: string | null;
  readonly signature_tier?: 'device' | 'server' | null;
  readonly notes?: string | null;
}

/** One integrity check result (mirrors `verify_asset_integrity`). */
export interface IntegrityCheck {
  readonly check_name: string;
  readonly state: VerificationState;
  readonly details: Record<string, unknown>;
}

export interface ProjectsRepo {
  list(ctx: AuthContext, params: ListParams): Promise<Page<Project>>;
  get(ctx: AuthContext, id: string): Promise<Project | null>;
  /** Recursive CTE over `parent_project_id`, org-scoped. */
  tree(ctx: AuthContext, rootId: string): Promise<Project[]>;
  create(ctx: AuthContext, input: Omit<Project, 'id' | 'created_at' | 'org_id'>): Promise<Project>;
  updateConfig(ctx: AuthContext, id: string, config: ProjectConfig): Promise<Project | null>;
}

export interface AssetsRepo {
  /** Org-scoped read (RLS). Returns null if the asset is absent or in another org. */
  getById(ctx: AuthContext, id: string): Promise<Asset | null>;
  list(ctx: AuthContext, projectId: string, params: ListParams): Promise<Page<Asset>>;

  // --- Service-role paths (webhook / workers only) ---
  /** Idempotency lookup: an existing row for the same content in the same project. */
  findBySha(sha256: string, projectId: string): Promise<Asset | null>;
  /** Service-role read by id (no RLS), used by the derivative writer for lineage. */
  getByIdService(id: string): Promise<Asset | null>;
  insert(row: AssetInsert): Promise<Asset>;
  setVerification(assetId: string, update: VerificationUpdate): Promise<void>;
}

export interface OrgsRepo {
  /** Service-role insert: orgs are provisioned by `platform_admin` via the API. */
  create(input: { name: string; type: Org['type'] }): Promise<Org>;
}

export interface InvitesRepo {
  /** Service-role insert of a hashed, single-use, 72h token. */
  create(input: {
    org_id: string;
    email: string;
    role: Exclude<Role, 'platform_admin'>;
    token_hash: string;
    expires_at: string;
  }): Promise<{ id: string }>;
}

export interface AuditRepo {
  /**
   * Append one row to the per-asset hash chain via `append_audit_log`. The API
   * supplies the RFC 8785 canonical string of `details` (AGENTS.md §3.8); the
   * function hashes the stored `hashed_at`, not `clock_timestamp()`.
   */
  append(input: {
    assetId: string;
    action: string;
    actorType: 'system' | 'user' | 'ml_model' | 'device';
    actorId: string | null;
    details: Record<string, unknown>;
  }): Promise<void>;
}

export interface IntegrityRepo {
  /** Org-scoped call to `verify_asset_integrity`. */
  verify(ctx: AuthContext, assetId: string): Promise<IntegrityCheck[]>;
}

/** Row inserted by the derivative writer (service role; append-only §3.1). */
export interface DerivativeInsert {
  readonly parent_asset_id: string;
  readonly transformation: string;
  readonly kind: string | null;
  readonly public_id: string;
  readonly is_generative: boolean;
  readonly cloudinary_asset_id: string | null;
  readonly cloudinary_version: string | null;
  readonly byte_size: number | null;
  readonly sha256_hash: string | null;
}

export interface DerivativesRepo {
  getByPublicId(ctx: AuthContext, publicId: string): Promise<AssetDerivative | null>;
  /** Service-role read of a derivative by id, used to resolve a generative source. */
  getById(id: string): Promise<AssetDerivative | null>;
  /** Service-role, append-only insert of a new derivative (§3.1). */
  insert(row: DerivativeInsert): Promise<AssetDerivative>;
}

/** Row inserted at ingest when Cloudinary returns AI tags (§3.9: tags are copied in). */
export interface ObservationInsert {
  readonly asset_id: string;
  readonly project_id: string;
  readonly org_id: string;
  readonly observation_type: string | null;
  readonly metrics: Record<string, unknown> | null;
  readonly notes: string | null;
}

export interface ObservationsRepo {
  /** Service-role insert. Cloudinary tags are written here, never queried back. */
  insert(row: ObservationInsert): Promise<{ id: string }>;
}

/** A stored asset/derivative identity for the reconciliation join (service role). */
export interface ReconcilePublicId {
  readonly public_id: string;
  readonly org_id: string;
}

/** The full data layer handed to the app. */
export interface DbPort {
  projects: ProjectsRepo;
  assets: AssetsRepo;
  orgs: OrgsRepo;
  invites: InvitesRepo;
  audit: AuditRepo;
  integrity: IntegrityRepo;
  derivatives: DerivativesRepo;
  observations: ObservationsRepo;
  /**
   * Service-role lookup of a project's owning org, used by the webhook to derive
   * `org_id` from the signed `project_id` — never from the request body
   * (AGENTS.md §3.4). Returns null if the project does not exist.
   */
  orgIdForProject(projectId: string): Promise<string | null>;
  /**
   * Reconciliation-only (§3.9): every stored asset / derivative `public_id` with
   * its owning org, so the nightly job can join the Cloudinary resource list
   * against Postgres and recompute per-org byte usage. Never a product read.
   */
  listAssetPublicIds(): Promise<ReconcilePublicId[]>;
  listDerivativePublicIds(): Promise<ReconcilePublicId[]>;
  /** Reconciliation-only: recompute `orgs.bytes_used` from authoritative totals. */
  setOrgBytesUsed(orgId: string, bytesUsed: number): Promise<void>;
  /** Liveness/readiness probe. Resolves if the DB is reachable. */
  ping(): Promise<void>;
}

/** Cloudinary media-pipeline operations. Never used as a query database (§3.9). */
export interface CloudinaryPort {
  /** Verify a webhook notification signature with the SDK helper (§3.11). */
  verifyNotificationSignature(body: string, timestamp: string, signature: string): boolean;
  /** Signed, no-expiry delivery URL for a derivative (`type: upload`). */
  signedDerivativeUrl(publicId: string, transformation: string): string;
  /** Authenticated original URL gated by an `auth_token` with a real `exp`. */
  originalUrl(publicId: string, ttlSeconds: number): { url: string; expiresAt: number };
  /**
   * Apply a transformation to an existing asset as an EAGER derivative and return
   * the derived asset's identity. Generative transforms are asynchronous
   * (420 Pending / 423 Locked); the live account reports them as `status:
   * 'processing'` (or 'pending') with the destination URL already present but the
   * bytes not yet generated. Whenever the derivative is still generating, `status`
   * is `'pending'` and `secure_url` is null — the caller must never block on it or
   * serve the URL early (AGENTS.md §3.11, CLOUDINARY_TRANSFORMATIONS.md §4).
   * Signing is done by the SDK; no HMAC is hand-rolled.
   */
  createEagerDerivative(input: EagerDerivativeInput): Promise<EagerDerivativeResult>;
  /**
   * Produce a request signature via the SDK helper. Exposed so the gate can prove
   * signatures come from the SDK, not string concatenation plus a manual digest.
   */
  signRequest(params: Record<string, unknown>): string;
}

export interface EagerDerivativeInput {
  readonly sourcePublicId: string;
  readonly sourceType: 'authenticated' | 'upload';
  readonly resourceType: 'image' | 'video';
  /** Exact transformation string (§3.1), e.g. a named or generative transform. */
  readonly transformation: string;
  readonly isGenerative: boolean;
}

export interface EagerDerivativeResult {
  /** `'pending'` when the derivative is still generating (420/423). */
  readonly status: 'ready' | 'pending';
  readonly publicId: string;
  readonly secureUrl: string | null;
  readonly bytes: number | null;
  readonly cloudinaryAssetId: string | null;
  readonly version: string | null;
}

/** One Cloudinary-stored resource, as returned by the reconciliation listing. */
export interface CloudinaryResource {
  readonly public_id: string;
  readonly asset_id: string | null;
  readonly bytes: number;
  readonly created_at: string;
  readonly resource_type: string;
}

/**
 * Admin-API surface. Per AGENTS.md §3.9 the ONLY legitimate Admin API uses are
 * the nightly reconciliation (a one-way integrity check) and operational setup
 * such as provisioning the upload preset. It is never used to serve a product
 * read — that is what would leak one org's assets to another.
 */
export interface CloudinaryAdminPort {
  /** Reconciliation only: list every stored resource (one-way integrity check). */
  listAllResources(): Promise<CloudinaryResource[]>;
  /** Operational setup: create/update the unsigned `verified_capture` preset. */
  ensureUploadPreset(definition: UploadPresetDefinition): Promise<void>;
}

/** Background job enqueue. Never blocks a request on a generative transform (§3.11). */
export interface QueuePort {
  enqueueAiEnrich(payload: { assetId: string; orgId: string }): Promise<void>;
  /** Readiness probe for the queue backend (Redis). */
  ping(): Promise<void>;
  close(): Promise<void>;
}
