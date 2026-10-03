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
  ChangeEvent,
  Org,
  Project,
  ProjectConfig,
  Report,
  ReportManifestEntry,
  Role,
  VerificationState,
} from '@panchnama/shared';
import type { AuthContext } from './types.js';
import type { UploadPresetDefinition } from './lib/cloudinary-preset.js';
import type { PairingAsset } from './services/pairing.js';

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

/**
 * The documented flat integrity contract (api-contracts.md §4 "Get Asset with
 * Integrity"), consumed by the dashboard's integrity panel. Every boolean is
 * tri-state: `true`/`false`/`null`, where `null` renders as `unknown` and is
 * NEVER shown as `pass` .
 */
export interface IntegrityContract {
  readonly asset_id: string;
  readonly device_capture_timestamp: string;
  readonly server_upload_timestamp: string | null;
  readonly server_received_at: string | null;
  readonly clock_drift_seconds: number | null;
  readonly gps_accuracy_meters: number | null;
  readonly gps_provider: string | null;
  readonly device_signature_verified: boolean | null;
  readonly exif_hash_verified: boolean | null;
  readonly caption_signature_verified: boolean | null;
  readonly audit_chain_intact: boolean | null;
  readonly sha256_matches_commit: boolean | null;
}

export interface ProjectsRepo {
  list(ctx: AuthContext, params: ListParams): Promise<Page<Project>>;
  get(ctx: AuthContext, id: string): Promise<Project | null>;
  /** Recursive CTE over `parent_project_id`, org-scoped. */
  tree(ctx: AuthContext, rootId: string): Promise<Project[]>;
  create(ctx: AuthContext, input: Omit<Project, 'id' | 'created_at' | 'org_id'>): Promise<Project>;
  updateConfig(ctx: AuthContext, id: string, config: ProjectConfig): Promise<Project | null>;
}

/** One row of the `search_assets` result (api-contracts.md §4 "Global Search"). */
export interface SearchResultRow {
  readonly id: string;
  readonly project_id: string;
  readonly cloudinary_public_id: string;
  readonly asset_type: 'image' | 'video' | null;
  readonly device_capture_timestamp: string;
  readonly gps_point: { readonly type: 'Point'; readonly coordinates: [number, number] } | null;
  readonly gps_accuracy_meters: number | null;
  readonly gps_provider: string | null;
  readonly caption: string | null;
  readonly ai_tags: readonly string[];
  readonly observation_type: string | null;
  readonly phase: 'before' | 'after' | null;
  readonly upload_status: 'pending' | 'verified' | 'flagged';
}

/** The seven search facets. An unset facet is omitted so filters compose (§4). */
export interface SearchFilters {
  readonly q?: string;
  readonly bbox?: readonly [number, number, number, number];
  readonly dateFrom?: string;
  readonly dateTo?: string;
  readonly tags?: readonly string[];
  readonly gpsAccuracyMax?: number;
  readonly assetType?: 'image' | 'video';
  readonly phase?: 'before' | 'after';
}

/** The `search_assets` JSONB envelope, computed over the full match set. */
export interface SearchResult {
  readonly rows: readonly SearchResultRow[];
  readonly totalMatched: number;
  readonly truncated: boolean;
  readonly facetCounts: Readonly<Record<string, Readonly<Record<string, number>>>>;
  readonly nextCursor: string | null;
}

export interface AssetsRepo {
  /** Org-scoped read (RLS). Returns null if the asset is absent or in another org. */
  getById(ctx: AuthContext, id: string): Promise<Asset | null>;
  list(ctx: AuthContext, projectId: string, params: ListParams): Promise<Page<Asset>>;
  /**
   * Org-scoped global search (RLS). Runs the `search_assets` SQL function, which
   * is SECURITY INVOKER so results are scoped to the caller's org by Postgres,
   * never a Cloudinary query .
   */
  searchAssets(ctx: AuthContext, filters: SearchFilters, params: ListParams): Promise<SearchResult>;
  // --- Service-role paths (webhook / workers only) ---
  /** Idempotency lookup: an existing row for the same content in the same project. */
  findBySha(sha256: string, projectId: string): Promise<Asset | null>;
  /** Service-role read by id (no RLS), used by the derivative writer for lineage. */
  getByIdService(id: string): Promise<Asset | null>;
  insert(row: AssetInsert): Promise<Asset>;
  setVerification(assetId: string, update: VerificationUpdate): Promise<void>;
  /**
   * Service-role read of every pairing-eligible asset in a project (Phase 7).
   * Only `verified` assets are returned (ARCHITECTURE.md §"Only `ready` assets
   * are selectable for pairing"), with lat/lon extracted from `gps_point` so the
   * pure pairing algorithm never touches PostGIS.
   */
  listForPairing(projectId: string): Promise<PairingAssetRow[]>;
}

/** A pairing-eligible asset row (service role), with resolved coordinates. */
export interface PairingAssetRow extends PairingAsset {
  readonly org_id: string;
  readonly project_id: string;
  readonly cloudinary_public_id: string;
  readonly asset_type: 'image' | 'video' | null;
}

/** Row inserted by the detect-change worker (service role). */
export interface ChangeEventInsert {
  readonly project_id: string;
  readonly org_id: string;
  readonly before_asset_id: string;
  readonly after_asset_id: string;
  readonly change_type: string | null;
  readonly change_metrics: Record<string, unknown>;
  readonly detection_method: string;
  /** NOT NULL (§3.2). A failed row carries the sentinel 'none'; manual 'manual'. */
  readonly model_version: string;
  readonly confidence: number | null;
  readonly diff_asset_cloudinary_id: string | null;
  readonly gps_distance_meters: number | null;
  readonly time_difference_hours: number | null;
  readonly status: 'detected' | 'failed' | 'manual';
  /** Required iff status is 'failed' (§3.6); the DB CHECK enforces this too. */
  readonly failure_reason: string | null;
}

/** Manual link created through the override endpoint (request-scoped, RLS). */
export interface ManualPairInsert {
  readonly project_id: string;
  readonly before_asset_id: string;
  readonly after_asset_id: string;
  readonly gps_distance_meters: number | null;
  readonly time_difference_hours: number | null;
}

export interface ChangeEventsRepo {
  /**
   * Service-role idempotency lookup: an existing (non-split) row for the same
   * ordered pair. The pairing worker skips a pair that already has one, so a
   * re-run over an unchanged window creates no duplicates.
   */
  findPair(beforeAssetId: string, afterAssetId: string): Promise<ChangeEvent | null>;
  /** Service-role insert of a detected/failed result. */
  insert(row: ChangeEventInsert): Promise<ChangeEvent>;
  /** Org-scoped read (RLS). Null if absent or in another org → the caller 404s. */
  getById(ctx: AuthContext, id: string): Promise<ChangeEvent | null>;
  /** Org-scoped list of a project's change events (RLS), newest first. */
  listByProject(ctx: AuthContext, projectId: string, params: ListParams): Promise<Page<ChangeEvent>>;
  /** Request-scoped manual link: org_id is forced to the caller's verified org. */
  createManual(ctx: AuthContext, input: ManualPairInsert): Promise<ChangeEvent>;
  /** Request-scoped status change (manual split). Null if not in the caller's org. */
  setStatus(
    ctx: AuthContext,
    id: string,
    status: 'split',
  ): Promise<ChangeEvent | null>;
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
   * supplies the RFC 8785 canonical string of `details` ; the
   * function hashes the stored `hashed_at`, not `clock_timestamp()`.
   */
  append(input: {
    assetId: string;
    action: string;
    actorType: 'system' | 'user' | 'ml_model' | 'device';
    actorId: string | null;
    details: Record<string, unknown>;
  }): Promise<void>;
  /**
   * Service-role read of one asset's hash chain in insertion order, for the
   * report integrity appendix (Phase 9). The tip row's `current_hash` is the
   * value the appendix prints and a verifier re-derives .
   */
  chainForAsset(assetId: string): Promise<AuditChainRow[]>;
  /**
   * Org-scoped structured chain verification (Phase 10 — `verifyChain(from,to)`).
   * Recomputes every row's content hash in Postgres (byte-identical to
   * `append_audit_log`, §3.8) and checks link continuity, naming the first
   * tampered row or gap. `from`/`to` are inclusive `audit_logs.id` bounds; null
   * means the chain end. Runs `verify_audit_chain_range` (SECURITY INVOKER, RLS).
   */
  verifyChainRange(
    ctx: AuthContext,
    assetId: string,
    from: number | null,
    to: number | null,
  ): Promise<ChainRangeResult>;
  /**
   * Org-scoped read of an asset's full chain rows (Phase 10). Carries the raw
   * `details` and the stored `details_canonical` so the API can run the RFC 8785
   * canonical-consistency check Postgres cannot (jsonb::text is not JCS, §3.8),
   * catching a tamper of the raw `details` column. Ordered by id ascending.
   */
  fullChainForAsset(
    ctx: AuthContext,
    assetId: string,
    from: number | null,
    to: number | null,
  ): Promise<AuditFullRow[]>;
}

/** One row of an asset's audit hash chain (append-only, §3.8). */
export interface AuditChainRow {
  readonly action: string;
  readonly previous_hash: string | null;
  readonly current_hash: string;
  readonly hashed_at: string;
}

/** A full audit row for the RFC 8785 content-consistency check (Phase 10). */
export interface AuditFullRow {
  readonly id: number;
  readonly action: string;
  readonly details: Record<string, unknown> | null;
  readonly details_canonical: string | null;
}

/** Structured result of `verify_audit_chain_range` (Phase 10). */
export interface ChainRangeResult {
  readonly ok: boolean;
  readonly checked: number;
  readonly first_id: number | null;
  readonly last_id: number | null;
  readonly tip_hash: string | null;
  readonly failure: {
    readonly audit_id: number;
    readonly kind: 'broken_link' | 'hash_mismatch';
    readonly reason: string;
  } | null;
}

export interface IntegrityRepo {
  /** Org-scoped call to `verify_asset_integrity`. */
  verify(ctx: AuthContext, assetId: string): Promise<IntegrityCheck[]>;
  /**
   * Org-scoped integrity in the documented flat contract shape. Runs
   * `asset_integrity` (RLS-scoped) and resolves the Ed25519 + RFC 8785 checks in
   * Node . Returns null if the asset is absent or in another org.
   */
  contract(ctx: AuthContext, assetId: string): Promise<IntegrityContract | null>;
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
  /** Org-scoped append-only lineage for one parent asset (RLS), oldest first (§3.1). */
  listByParent(ctx: AuthContext, parentAssetId: string): Promise<AssetDerivative[]>;
  /** Service-role read of a derivative by id, used to resolve a generative source. */
  getById(id: string): Promise<AssetDerivative | null>;
  /** Service-role, append-only insert of a new derivative (§3.1). */
  insert(row: DerivativeInsert): Promise<AssetDerivative>;
}

/** A `report_templates` row (Phase 9). Org-scoped read; org may be null for a built-in. */
export interface ReportTemplateRow {
  readonly id: string;
  readonly org_id: string | null;
  readonly sector: string | null;
  readonly name: string;
  readonly description: string | null;
  readonly handlebars_template: string;
  readonly config: Record<string, unknown>;
  readonly is_default: boolean;
  readonly created_at: string;
}

/** Service-role insert of a draft/finalized report (`evidence_packages`). */
export interface ReportPackageInsert {
  readonly project_id: string;
  readonly org_id: string;
  readonly name: string | null;
  readonly asset_ids: readonly string[];
  readonly change_event_ids: readonly string[];
  readonly template_id: string | null;
  /** Pinned template version, e.g. `forestry_donor@1` (§determinism). */
  readonly template_version: string;
  readonly status: 'draft' | 'finalized' | 'exported';
  readonly audit_trail: Record<string, unknown> | null;
}

/** Service-role finalize: attaches the rendered artifact URLs + size. */
export interface ReportFinalizeInput {
  readonly reportCloudinaryUrl: string;
  readonly reportHtmlUrl: string | null;
  readonly byteSize: number;
  readonly status: 'finalized';
}

/**
 * Service-role manifest insert. `org_id` is intentionally NOT accepted — the DB
 * trigger forces it to the parent package's org , so a caller
 * can never file a manifest row under another org.
 */
export interface ManifestEntryInsert {
  readonly evidence_package_id: string;
  readonly ordinal: number;
  readonly role: 'photo' | 'diff' | 'map' | 'chart' | 'video_clip' | 'qr';
  readonly cloudinary_public_id: string | null;
  readonly derivative_public_id: string | null;
  readonly sha256_hash: string | null;
  readonly byte_size: number | null;
  readonly verified_at: string | null;
}

export interface ReportsRepo {
  /** Org-scoped template list (RLS), optionally filtered by sector. */
  listTemplates(ctx: AuthContext, sector?: string): Promise<ReportTemplateRow[]>;
  /** Org-scoped template read (RLS). Null if absent or in another org. */
  getTemplate(ctx: AuthContext, id: string): Promise<ReportTemplateRow | null>;
  /** Service-role insert of the report row. */
  createPackage(input: ReportPackageInsert): Promise<Report>;
  /** Org-scoped read (RLS). Null if absent or in another org → the caller 404s. */
  getPackage(ctx: AuthContext, id: string): Promise<Report | null>;
  /** Service-role finalize once the artifact is rendered + uploaded. */
  finalizePackage(id: string, input: ReportFinalizeInput): Promise<void>;
  /** Service-role, append-only manifest insert (org forced by the trigger). */
  insertManifestEntry(input: ManifestEntryInsert): Promise<void>;
  /** Org-scoped read of a report's manifest (RLS), by ordinal. */
  listManifest(ctx: AuthContext, packageId: string): Promise<ReportManifestEntry[]>;
  /**
   * Org-scoped public-safe verification receipt for a report id (Phase 10).
   * Runs `report_verification_receipt` (SECURITY INVOKER, RLS): only hashes,
   * counts, timestamps, and per-asset chain verdicts — never org_id, user
   * identity, GPS, caption, or public_id. Null if absent or in another org.
   */
  verificationReceipt(ctx: AuthContext, packageId: string): Promise<ReportReceipt | null>;
}

/** One per-asset chain verdict inside a report verification receipt (Phase 10). */
export interface ReceiptAssetChain {
  readonly index: number;
  readonly chain_verified: boolean;
  readonly chain_length: number;
  readonly tip_hash: string | null;
  readonly failure: ChainRangeResult['failure'];
}

/** One manifest hash entry inside a report verification receipt (Phase 10). */
export interface ReceiptManifestEntry {
  readonly ordinal: number;
  readonly role: string;
  readonly sha256_hash: string | null;
  readonly byte_size: number | null;
  readonly verified: boolean;
}

/**
 * Public-safe report verification receipt (Phase 10 — "Report verification").
 * Deliberately carries NO org_id, user identity, GPS, caption, or public_id, so
 * it is safe to export and share as standalone evidence .
 */
export interface ReportReceipt {
  readonly report_id: string;
  readonly status: string;
  readonly template_version: string | null;
  readonly generated_at: string;
  readonly byte_size: number | null;
  readonly chains_verified: boolean;
  readonly asset_chains: readonly ReceiptAssetChain[];
  readonly manifest: readonly ReceiptManifestEntry[];
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
  changeEvents: ChangeEventsRepo;
  reports: ReportsRepo;
  /**
   * Service-role project read (Phase 7 pairing). Returns sector + config so the
   * worker can resolve each observation type's gps_radius and metrics schema
   * without a request-scoped client.
   */
  getProjectService(projectId: string): Promise<Project | null>;
  /**
   * Service-role lookup of a project's owning org, used by the webhook to derive
   * `org_id` from the signed `project_id` — never from the request body
   * . Returns null if the project does not exist.
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
  /** SDK-signed authenticated original URL. Signed URLs do not expire. */
  originalUrl(publicId: string, resourceType: 'image' | 'video'): string;
  /**
   * Apply a transformation to an existing asset as an EAGER derivative and return
   * the derived asset's identity. Generative transforms are asynchronous
   * (420 Pending / 423 Locked); the live account reports them as `status:
   * 'processing'` (or 'pending') with the destination URL already present but the
   * bytes not yet generated. Whenever the derivative is still generating, `status`
   * is `'pending'` and `secure_url` is null — the caller must never block on it or
   * serve the URL early .
   * Signing is done by the SDK; no HMAC is hand-rolled.
   */
  createEagerDerivative(input: EagerDerivativeInput): Promise<EagerDerivativeResult>;
  /**
   * Produce a request signature via the SDK helper. Exposed so the gate can prove
   * signatures come from the SDK, not string concatenation plus a manual digest.
   */
  signRequest(params: Record<string, unknown>): string;
  /**
   * Upload a finalized report artifact (PDF or self-contained HTML) into the
   * media pipeline (Phase 9 "Renderer": upload to Cloudinary). This is a WRITE,
   * not a query — it never lists or searches Cloudinary . Signing
   * is done by the SDK; no HMAC is hand-rolled (§3.11).
   */
  uploadArtifact(input: ArtifactUploadInput): Promise<ArtifactUploadResult>;
}

export interface ArtifactUploadInput {
  readonly publicId: string;
  readonly bytes: Buffer;
  readonly format: 'pdf' | 'html';
}

export interface ArtifactUploadResult {
  readonly url: string;
  readonly publicId: string;
  readonly bytes: number;
  readonly version: string | null;
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
 * Admin-API surface. Per system invariants the ONLY legitimate Admin API uses are
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
  /** Kick off pairing for a project (Phase 7 pair-assets worker). */
  enqueuePairAssets(payload: { projectId: string; orgId: string }): Promise<void>;
  /**
   * Enqueue detection for one before/after pair (Phase 7 detect-change worker).
   * The jobId is keyed on the ordered pair so a replay never doubles a job.
   */
  enqueueDetectChange(payload: {
    projectId: string;
    orgId: string;
    beforeAssetId: string;
    afterAssetId: string;
    gpsDistanceMeters: number | null;
    timeDifferenceHours: number | null;
  }): Promise<void>;
  /**
   * Enqueue the asynchronous gen-AI social-variant job for a finalized report
   * (Phase 9 "Async gen-AI job"). Gen-AI transforms return 420/423, so they run
   * OUT of the synchronous `POST /v1/reports/generate` path and poll to
   * completion here. Each edit targets a report-copy derivative, never an
   * original .
   */
  enqueueReportGenAi(payload: {
    reportId: string;
    orgId: string;
    edits: ReadonlyArray<{
      parentAssetId: string;
      sourceDerivativeId: string;
      transformation: string;
      kind: string;
    }>;
  }): Promise<void>;
  /** Readiness probe for the queue backend (Redis). */
  ping(): Promise<void>;
  close(): Promise<void>;
}
