/**
 * Report generation orchestration (BUILD_ORDER Phase 9 "Reports").
 *
 * `generateReport` is the synchronous `POST /v1/reports/generate` path. It:
 *
 *  1. resolves the project, template, and selected change events under the
 *     caller's RLS scope (cross-org ids 404, never leak — AGENTS.md §3.4);
 *  2. GATES ON VERIFICATION: if any selected asset is not `verified`, it refuses
 *     with a clear, asset-named error (Phase 9 "Gate on verification"; a
 *     quarantined/flagged asset can never reach a donor report — §3.1);
 *  3. builds a `report_full` derivative for every photo, fetches its bytes, and
 *     inlines them as data URIs so the artifact renders offline (Phase 9
 *     "Self-contained artifact"). Each inlined element becomes a
 *     `report_manifest_entries` row whose `sha256_hash` is over the exact bytes
 *     embedded (Phase 9 "Manifest");
 *  4. assembles deterministic HTML (metrics via Decimal.js — Phase 9
 *     "Determinism"), renders it to a PDF, and uploads both artifacts;
 *  5. persists the `evidence_packages` row with `template_version` + input ids
 *     so the report is regenerable (Phase 9 "Renderer"), then writes the
 *     manifest rows;
 *  6. enqueues the gen-AI social-variant job WITHOUT blocking on it, because
 *     gen-AI transforms are asynchronous 420/423 (Phase 9 "Async gen-AI job",
 *     §3.11).
 *
 * Metrics are NEVER produced or adjusted here — they are copied verbatim from
 * `change_events.change_metrics`, each row already carrying the `model_version`
 * of the CV model that produced it (AGENTS.md §3.2).
 */
import type { Asset, ChangeEvent } from '@panchnama/shared';
import type { CloudinaryPort, DbPort, QueuePort } from '../ports.js';
import type { AuthContext } from '../types.js';
import { errors } from '../types.js';
import { createDerivative, derivedPublicId } from './derivatives.js';
import { NAMED_TRANSFORMS, GENERATIVE_TRANSFORMS, videoClipTransformation } from '../lib/transformations.js';
import {
  assembleReport,
  type AssemblePairInput,
  type AssembleVideoClipInput,
  type InlinedMedia,
} from '../reports/assemble.js';
import type { ReportRenderer } from '../reports/renderer.js';
import type { AppendixAsset, AppendixChainRow } from '../reports/templates.js';
import { getBuiltInTemplate, compileCustomTemplate, type RegisteredTemplate } from '../reports/templates.js';
import { buildSchematicMapSvg } from '../reports/map.js';

export interface GenerateReportDeps {
  readonly db: DbPort;
  readonly cloudinary: CloudinaryPort;
  readonly renderer: ReportRenderer;
  /** Fetch derivative bytes for inlining. Production: `fetch`. */
  readonly fetchBytes: (url: string) => Promise<Buffer>;
  /** `@font-face` CSS with inlined Inter bytes; '' if no font is embedded. */
  readonly fontCss: string;
  readonly queue: QueuePort;
  /** Wall clock, injected so `generated_at` is testable. Not folded into the artifact. */
  readonly now: () => Date;
}

export interface GenerateReportInput {
  readonly projectId: string;
  /** A built-in key (e.g. `forestry_donor`) or a `report_templates` UUID. */
  readonly templateId: string;
  readonly changeEventIds: readonly string[];
  readonly includeIntegrityAppendix: boolean;
}

export interface ReportManifestOut {
  readonly ordinal: number;
  readonly role: string;
  readonly cloudinary_public_id: string | null;
  readonly derivative_public_id: string | null;
  readonly sha256_hash: string;
  readonly verified: boolean;
}

export interface GenerateReportResult {
  readonly report_id: string;
  readonly self_contained: true;
  readonly pdf_url: string;
  readonly html_url: string;
  readonly byte_size: number;
  readonly manifest: readonly ReportManifestOut[];
  readonly blocked_reason: null;
  readonly generated_at: string;
  readonly template_version: string;
}

/** Tri-state label; a null (unknown) input is NEVER shown as `pass` (§3.7). */
function statusLabel(value: boolean | null | undefined): string {
  if (value === true) return 'pass';
  if (value === false) return 'fail';
  return 'unknown';
}

/** Detect a data-URI mime from magic bytes so the inlined image is well-formed. */
function sniffImageMime(bytes: Buffer): string {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47)
    return 'image/png';
  if (
    bytes.length >= 12 &&
    bytes.toString('latin1', 0, 4) === 'RIFF' &&
    bytes.toString('latin1', 8, 12) === 'WEBP'
  )
    return 'image/webp';
  if (bytes.length >= 5 && bytes.toString('latin1', 0, 5) === '<?xml') return 'image/svg+xml';
  if (bytes.length >= 4 && bytes.toString('latin1', 0, 4) === '<svg') return 'image/svg+xml';
  return 'application/octet-stream';
}

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

export async function generateReport(
  deps: GenerateReportDeps,
  ctx: AuthContext,
  input: GenerateReportInput,
): Promise<GenerateReportResult> {
  const project = await deps.db.projects.get(ctx, input.projectId);
  if (project === null) throw errors.notFound('project not found');

  // --- Resolve the template (built-in or an org-authored row) ---------------
  let template: RegisteredTemplate;
  let templateDbId: string | null = null;
  const builtIn = getBuiltInTemplate(input.templateId);
  if (builtIn !== null) {
    template = builtIn;
  } else {
    const row = await deps.db.reports.getTemplate(ctx, input.templateId);
    if (row === null) throw errors.notFound('template not found');
    const cfgVersion = typeof row.config['version'] === 'string' ? (row.config['version'] as string) : '1';
    template = compileCustomTemplate(
      row.id,
      `${row.name}@${cfgVersion}#${row.id}`,
      row.sector ?? project.sector ?? 'unknown',
      row.name,
      row.handlebars_template,
    );
    templateDbId = row.id;
  }

  // --- Resolve change events under RLS --------------------------------------
  if (input.changeEventIds.length === 0) {
    throw errors.unprocessable('a report needs at least one change event');
  }
  const events: ChangeEvent[] = [];
  for (const id of input.changeEventIds) {
    const event = await deps.db.changeEvents.getById(ctx, id);
    if (event === null) throw errors.notFound(`change event ${id} not found`);
    if (event.project_id !== project.id) {
      throw errors.unprocessable('change event does not belong to the project', { change_event_id: id });
    }
    events.push(event);
  }

  // --- Collect + verification-gate every selected asset ---------------------
  const assetIds = unique(
    events.flatMap((e) => [e.before_asset_id, e.after_asset_id]).filter((x): x is string => typeof x === 'string'),
  );
  const assets = new Map<string, Asset>();
  for (const id of assetIds) {
    const asset = await deps.db.assets.getById(ctx, id);
    if (asset === null) throw errors.notFound(`asset ${id} not found`);
    if (asset.upload_status !== 'verified') {
      // Phase 9 "Gate on verification": a report can only be built from verified
      // evidence. A quarantined ('flagged') or pending asset refuses generation
      // with a reason that names the offending asset (§3.6 — never a silent drop).
      throw errors.unprocessable('report generation refused: a selected asset is not verified', {
        asset_id: id,
        upload_status: asset.upload_status,
      });
    }
    assets.set(id, asset);
  }

  // --- Build report_full derivatives + inline bytes -------------------------
  const pairs: AssemblePairInput[] = [];
  const videoClips: AssembleVideoClipInput[] = [];
  const genAiEdits: {
    parentAssetId: string;
    sourceDerivativeId: string;
    transformation: string;
    kind: string;
  }[] = [];

  /** Create a report_full copy of an asset and inline its bytes. */
  async function inlinePhoto(asset: Asset): Promise<{ media: InlinedMedia; derivativeId: string }> {
    const targetPublicId = derivedPublicId(asset.cloudinary_public_id, 'report_full', NAMED_TRANSFORMS.report_full);
    // The canonical, deterministic delivery URL for the report_full copy. Fetching
    // this same URL on every run yields the same bytes, which is what keeps the
    // inlined artifact byte-identical across regeneration (Phase 9 Determinism).
    const url = deps.cloudinary.signedDerivativeUrl(asset.cloudinary_public_id, NAMED_TRANSFORMS.report_full);

    // Idempotent: if this asset's report_full copy already exists, reuse it
    // rather than creating a second derivative and appending another audit row.
    // A re-run then neither grows the derivative lineage nor the audit chain, so
    // the integrity appendix reads the same tip hash every time.
    const existing = await deps.db.derivatives.getByPublicId(ctx, targetPublicId);
    if (existing !== null) {
      const bytes = await deps.fetchBytes(url);
      return {
        media: {
          cloudinaryPublicId: asset.cloudinary_public_id,
          derivativePublicId: existing.public_id,
          bytes,
          mime: sniffImageMime(bytes),
        },
        derivativeId: existing.id,
      };
    }
    const created = await createDerivative(
      { cloudinary: deps.cloudinary, derivatives: deps.db.derivatives, audit: deps.db.audit, assets: deps.db.assets },
      {
        parentAssetId: asset.id,
        transformation: NAMED_TRANSFORMS.report_full,
        kind: 'report_full',
        isGenerative: false,
        resourceType: 'image',
      },
    );
    const bytes = await deps.fetchBytes(url);
    return {
      media: {
        cloudinaryPublicId: asset.cloudinary_public_id,
        derivativePublicId: created.derivative.public_id,
        bytes,
        mime: sniffImageMime(bytes),
      },
      derivativeId: created.derivative.id,
    };
  }

  for (const event of events) {
    const before = event.before_asset_id !== null && event.before_asset_id !== undefined
      ? assets.get(event.before_asset_id)
      : undefined;
    const after = event.after_asset_id !== null && event.after_asset_id !== undefined
      ? assets.get(event.after_asset_id)
      : undefined;
    if (before === undefined || after === undefined) {
      throw errors.unprocessable('change event is missing a before/after asset', { change_event_id: event.id });
    }

    const beforeInlined = await inlinePhoto(before);
    const afterInlined = await inlinePhoto(after);

    // The diff image (produced by the ML service, §3.2) is inlined directly from
    // its Cloudinary public_id at report_diff resolution — not re-derived, since
    // it is already a change-detection output.
    let diffMedia: InlinedMedia | null = null;
    if (typeof event.diff_asset_cloudinary_id === 'string' && event.diff_asset_cloudinary_id !== '') {
      const diffUrl = deps.cloudinary.signedDerivativeUrl(
        event.diff_asset_cloudinary_id,
        NAMED_TRANSFORMS.report_diff,
      );
      const diffBytes = await deps.fetchBytes(diffUrl);
      diffMedia = {
        cloudinaryPublicId: event.diff_asset_cloudinary_id,
        derivativePublicId: event.diff_asset_cloudinary_id,
        bytes: diffBytes,
        mime: sniffImageMime(diffBytes),
      };
    }

    pairs.push({
      before: {
        media: beforeInlined.media,
        caption: before.caption ?? null,
        capturedAt: before.device_capture_timestamp,
        observationType: before.observation_type ?? null,
      },
      after: {
        media: afterInlined.media,
        caption: after.caption ?? null,
        capturedAt: after.device_capture_timestamp,
        observationType: after.observation_type ?? null,
      },
      diff: diffMedia,
      metrics: event.change_metrics,
      modelVersion: event.model_version,
      changeType: event.change_type ?? null,
      gpsDistanceMeters: event.gps_distance_meters ?? null,
      timeDifferenceHours: event.time_difference_hours ?? null,
    });

    // Social variant (gen-AI, async) targets the AFTER report copy, never the
    // original (§3.1). Enqueued below; the sync path does not wait on it.
    genAiEdits.push({
      parentAssetId: after.id,
      sourceDerivativeId: afterInlined.derivativeId,
      transformation: GENERATIVE_TRANSFORMS.landscape_expand,
      kind: 'report_social',
    });

    // Video evidence: inline a keyframe poster and record the CLIP transformation
    // string in the manifest, never a live clip URL (Phase 9 "Video embeds").
    for (const asset of [before, after]) {
      if (asset.asset_type === 'video') {
        const posterUrl = deps.cloudinary.signedDerivativeUrl(asset.cloudinary_public_id, 'so_0');
        const posterBytes = await deps.fetchBytes(posterUrl);
        videoClips.push({
          poster: {
            cloudinaryPublicId: asset.cloudinary_public_id,
            derivativePublicId: null,
            bytes: posterBytes,
            mime: sniffImageMime(posterBytes),
          },
          clipTransformation: videoClipTransformation({ startSeconds: 0, durationSeconds: 5 }),
          caption: asset.caption ?? null,
        });
      }
    }
  }

  // --- Site map (schematic locator; self-contained inline SVG) --------------
  const mapSvg = buildSchematicMapSvg({
    projectName: project.name,
    siteCount: assetIds.length,
    pairCount: events.length,
  });
  const mapMedia: InlinedMedia = {
    cloudinaryPublicId: null,
    derivativePublicId: null,
    bytes: Buffer.from(mapSvg, 'utf8'),
    mime: 'image/svg+xml',
  };

  // --- Integrity appendix ---------------------------------------------------
  const appendixAssets: AppendixAsset[] = [];
  const chain: AppendixChainRow[] = [];
  for (const [id, asset] of assets) {
    const contract = await deps.db.integrity.contract(ctx, id);
    const chainRows = await deps.db.audit.chainForAsset(id);
    const tip = chainRows.length > 0 ? chainRows[chainRows.length - 1] : null;
    const modelVersions = unique(
      events
        .filter((e) => e.before_asset_id === id || e.after_asset_id === id)
        .map((e) => e.model_version),
    );
    appendixAssets.push({
      assetId: id,
      currentHash: tip?.current_hash ?? null,
      signatureStatus: statusLabel(contract?.device_signature_verified),
      exifStatus: statusLabel(contract?.exif_hash_verified),
      captionStatus: statusLabel(contract?.caption_signature_verified),
      deviceCaptureTimestamp: asset.device_capture_timestamp,
      serverUploadTimestamp: contract?.server_upload_timestamp ?? null,
      clockDriftSeconds:
        contract?.clock_drift_seconds === null || contract?.clock_drift_seconds === undefined
          ? null
          : String(contract.clock_drift_seconds),
      modelVersions,
    });
    for (const row of chainRows) {
      chain.push({
        assetId: id,
        action: row.action,
        previousHash: row.previous_hash,
        currentHash: row.current_hash,
      });
    }
  }

  // --- Assemble the deterministic self-contained artifact -------------------
  const assembled = assembleReport({
    template,
    title: `${project.name} — Evidence Report`,
    project: {
      name: project.name,
      sector: project.sector ?? 'unknown',
      id: project.id,
      dateFrom: project.start_date ?? null,
      dateTo: project.end_date ?? null,
    },
    fontFaceCss: deps.fontCss,
    pairs,
    map: mapMedia,
    videoClips,
    appendix: {
      include: input.includeIntegrityAppendix,
      assets: appendixAssets,
      chain,
    },
  });

  // --- Persist the report row (draft) before uploading artifacts ------------
  const report = await deps.db.reports.createPackage({
    project_id: project.id,
    org_id: ctx.orgId,
    name: `${project.name} — Evidence Report`,
    asset_ids: assetIds,
    change_event_ids: [...input.changeEventIds],
    template_id: templateDbId,
    template_version: template.version,
    status: 'draft',
    audit_trail: { template_version: template.version, change_event_ids: [...input.changeEventIds] },
  });

  // --- Render PDF, upload both artifacts ------------------------------------
  const htmlBytes = Buffer.from(assembled.html, 'utf8');
  const pdfBytes = await deps.renderer.htmlToPdf(assembled.html);

  const htmlUpload = await deps.cloudinary.uploadArtifact({
    publicId: `${ctx.orgId}/${project.id}/reports/${report.id}`,
    bytes: htmlBytes,
    format: 'html',
  });
  const pdfUpload = await deps.cloudinary.uploadArtifact({
    publicId: `${ctx.orgId}/${project.id}/reports/${report.id}`,
    bytes: pdfBytes,
    format: 'pdf',
  });

  // --- Write manifest rows (service role; org forced by DB trigger) ---------
  const verifiedAt = deps.now().toISOString();
  for (const entry of assembled.manifest) {
    await deps.db.reports.insertManifestEntry({
      evidence_package_id: report.id,
      ordinal: entry.ordinal,
      role: entry.role,
      cloudinary_public_id: entry.cloudinaryPublicId,
      derivative_public_id: entry.derivativePublicId,
      sha256_hash: entry.sha256Hash,
      byte_size: entry.byteSize,
      verified_at: entry.verified ? verifiedAt : null,
    });
  }

  // --- Finalize (attach artifact URLs + size) -------------------------------
  await deps.db.reports.finalizePackage(report.id, {
    reportCloudinaryUrl: pdfUpload.url,
    reportHtmlUrl: htmlUpload.url,
    byteSize: pdfUpload.bytes,
    status: 'finalized',
  });

  // --- Enqueue the async gen-AI social variants (non-blocking, §3.11) -------
  await deps.queue.enqueueReportGenAi({ reportId: report.id, orgId: ctx.orgId, edits: genAiEdits });

  return {
    report_id: report.id,
    self_contained: true,
    pdf_url: pdfUpload.url,
    html_url: htmlUpload.url,
    byte_size: pdfUpload.bytes,
    manifest: assembled.manifest.map((m) => ({
      ordinal: m.ordinal,
      role: m.role,
      cloudinary_public_id: m.cloudinaryPublicId,
      derivative_public_id: m.derivativePublicId,
      sha256_hash: m.sha256Hash,
      verified: m.verified,
    })),
    blocked_reason: null,
    generated_at: deps.now().toISOString(),
    template_version: template.version,
  };
}
