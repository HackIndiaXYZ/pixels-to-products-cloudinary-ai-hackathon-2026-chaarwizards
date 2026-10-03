/**
 * `verified_capture` upload preset and evidence retention policy (architecture specification
 * Phase 5: "Preset setup" and "Retention").
 *
 * The capture app uploads through an UNSIGNED preset . The preset therefore carries the server-side
 * guarantees that a client cannot be trusted to set itself:
 *  - `overwrite: false` + `invalidate: false` so a `public_id` (content-addressed
 *    `{org}/{project}/{sha256}`) can never be rewritten to point at other bytes
 *    (ARCHITECTURE.md §3.2, system invariants — originals are immutable);
 *  - originals land as `type: authenticated` (delivery requires an SDK-signed URL);
 *  - an `allowed_formats` + `max_file_size` bound;
 *  - AI tagging (`categorization`/`detection`) at ingest so tags are copied into
 *    Postgres `observations`, never queried back from Cloudinary (§3.9);
 *  - the incoming webhook (`notification_url`) whose signature the API re-verifies.
 *
 * This module is the single source of truth for the preset shape. It is applied
 * to Cloudinary by `ensureUploadPreset` (Admin API — a permitted server-side
 * use, not a query) and asserted in tests without a live account.
 */
import type { UploadApiOptions } from 'cloudinary';

/** Formats a field worker's phone can legitimately produce. */
export const ALLOWED_UPLOAD_FORMATS = ['jpg', 'jpeg', 'png', 'heic', 'heif', 'webp', 'mp4', 'mov'] as const;

/** 100 MB — a 30 s clip plus headroom; larger uploads are rejected by Cloudinary. */
export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

export interface UploadPresetDefinition {
  readonly name: string;
  readonly unsigned: true;
  readonly settings: {
    readonly allowed_formats: string;
    readonly max_file_size: number;
    readonly type: 'authenticated';
    readonly overwrite: false;
    readonly invalidate: false;
    readonly unique_filename: false;
    readonly use_filename: false;
    readonly categorization: 'google_tagging';
    readonly auto_tagging: number;
    readonly detection: 'openimages';
    readonly notification_url: string;
  };
}

/**
 * Build the `verified_capture` preset definition. `notificationUrl` is the API's
 * `POST /webhooks/cloudinary` endpoint; Cloudinary signs the notification and the
 * API re-verifies that signature .
 */
export function buildUploadPresetDefinition(
  presetName: string,
  notificationUrl: string,
): UploadPresetDefinition {
  return {
    name: presetName,
    unsigned: true,
    settings: {
      allowed_formats: ALLOWED_UPLOAD_FORMATS.join(','),
      max_file_size: MAX_UPLOAD_BYTES,
      type: 'authenticated',
      overwrite: false,
      invalidate: false,
      unique_filename: false,
      use_filename: false,
      categorization: 'google_tagging',
      auto_tagging: 0.7,
      detection: 'openimages',
      notification_url: notificationUrl,
    },
  };
}

/**
 * Upload-time parameters an eager derivative should carry when it is itself an
 * ingest (not used by `explicit`, kept for the derivative-upload path). Distinct
 * from delivery transformations — these do not count against the transform quota
 * (CLOUDINARY_TRANSFORMATIONS.md §7).
 */
export function derivativeUploadOptions(publicId: string): UploadApiOptions {
  return {
    public_id: publicId,
    type: 'upload',
    overwrite: false,
    invalidate: false,
    resource_type: 'image',
  };
}

/**
 * Evidence retention policy (ARCHITECTURE.md §3.2 "Retention and cost").
 *
 * Evidence is kept 7 years from `orgs.created_at`. Crucially, NO Cloudinary
 * lifecycle auto-expiry is set on evidence: a Cloudinary-side delete would
 * destroy evidence we still owe an audit on. Deletion is performed only by our
 * reconciliation job, and only for assets not referenced by an audit partition,
 * an unfinalized evidence package, or a report manifest entry.
 */
export const RETENTION_POLICY = {
  evidenceRetentionYears: 7,
  /** Cloudinary lifecycle auto-expiry is intentionally DISABLED for evidence. */
  cloudinaryAutoExpiryEnabled: false,
  /** Only the reconciliation job deletes, and only unreferenced assets. */
  deletionOwner: 'reconciliation_job',
} as const;

/**
 * A tag on a Cloudinary asset that excludes it from any lifecycle auto-expiry
 * rule. Every evidence original carries it, so even if a lifecycle rule is added
 * later it cannot reap evidence.
 */
export const EVIDENCE_RETENTION_TAG = 'evidence_no_expiry' as const;
