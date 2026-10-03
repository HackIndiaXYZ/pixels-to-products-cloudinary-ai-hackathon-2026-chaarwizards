/**
 * Capture orchestration (Phase "Camera screen").
 *
 * Ties the capture pipeline together for a single still or video: read + freeze
 * EXIF, stream-hash the bytes, take a GPS fix and gate on accuracy, build and
 * Ed25519-sign the canonical payload, assemble the Cloudinary upload context
 * (api-contracts §1), and enqueue it for the sync engine. Nothing here talks to a
 * native module directly — every effect is a port — so the whole flow is driven
 * in tests end-to-end with fakes.
 *
 * The client is untrusted : `org_id` is used only to build the
 * Cloudinary `public_id` path; the API re-derives authorization from the signed
 * `project_id`, never from this context. A capture blocked by GPS accuracy is
 * refused with a persisted reason (§3.6), not silently uploaded.
 */
import { createDefaultHasher } from './hashing.js';
import { computeExifHash, freezeExif } from './exif.js';
import { streamSha256 } from './hashing.js';
import { evaluateGpsAccuracy, fixToSigningGps, type GpsThresholds } from './gps.js';
import { signCapture } from './signing.js';
import { buildSigningPayload } from '@panchnama/shared/rn';
import type { AssetType } from '@panchnama/shared/rn';
import type { CaptureSelection } from './projects.js';
import type { CaptureQueue, QueueItem } from './queue.js';
import type {
  CaptureSigner,
  Clock,
  ExifReader,
  FileChunkReader,
  GpsFix,
  UploadRequest,
} from './ports.js';

/** Everything a capture needs, all as injectable ports. */
export interface CaptureContext {
  readonly exifReader: ExifReader;
  readonly fileReader: FileChunkReader;
  readonly signer: CaptureSigner;
  readonly clock: Clock;
  readonly queue: CaptureQueue;
}

export interface CaptureInput {
  readonly selection: CaptureSelection;
  /** Used only to build the `public_id` path; never for authorization (§3.4). */
  readonly orgId: string;
  readonly fileUri: string;
  readonly assetType: AssetType;
  readonly gpsFix: GpsFix;
  readonly appVersion: string;
  readonly caption?: string | null;
  readonly captionLanguage?: string;
  readonly gpsThresholds?: GpsThresholds;
}

export type CaptureResult =
  | { readonly ok: true; readonly item: QueueItem }
  | { readonly ok: false; readonly reason: string };

/** SHA-256 (hex) of a UTF-8 string, via the injectable hasher path. */
function sha256Utf8(value: string): string {
  const hasher = createDefaultHasher();
  hasher.update(new TextEncoder().encode(value));
  return hasher.digestHex();
}

/**
 * Run the capture pipeline and enqueue the signed result. Returns a refusal (not
 * a throw) when GPS accuracy blocks the capture, so the UI can show the reason.
 */
export async function performCapture(
  ctx: CaptureContext,
  input: CaptureInput,
): Promise<CaptureResult> {
  const gps = evaluateGpsAccuracy(input.gpsFix, input.gpsThresholds);
  if (gps.blocked) {
    return { ok: false, reason: gps.message };
  }

  const rawExif = await ctx.exifReader.read(input.fileUri);
  // Only the frozen, allowlisted EXIF is uploaded and hashed, so the server's
  // independent re-hash of metadata.exif matches the device exif_hash (§3.8).
  const frozenExif = freezeExif(rawExif);
  const exifHash = computeExifHash(rawExif);
  const sha256 = await streamSha256(ctx.fileReader, input.fileUri);

  const capturedAtMs = ctx.clock.now();
  const monotonicMs = ctx.clock.monotonicMs();
  const caption = input.caption ?? null;

  const payloadInput = {
    v: 1 as const,
    sha256,
    exif_hash: exifHash,
    captured_at_ms: capturedAtMs,
    device_monotonic_ms: monotonicMs,
    gps: fixToSigningGps(input.gpsFix),
    project_id: input.selection.projectId,
    observation_type: input.selection.observationType,
    phase: input.selection.phase,
    caption,
  };

  const signed = await signCapture(payloadInput, ctx.signer);
  // The commit hash binds the entire canonical claim set (device_commit_hash).
  const commitHash = sha256Utf8(buildSigningPayload(payloadInput));

  const capturedAtIso = new Date(capturedAtMs).toISOString();
  const context: Record<string, string> = {
    capture_signature: signed.signature,
    device_public_key: signed.devicePublicKey,
    signature_tier: signed.signatureTier,
    capture_timestamp: capturedAtIso,
    capture_commit_hash: commitHash,
    device_monotonic_ms: String(monotonicMs),
    gps_lat: String(input.gpsFix.lat),
    gps_lon: String(input.gpsFix.lon),
    gps_accuracy: String(input.gpsFix.accuracy_m),
    gps_provider: input.gpsFix.provider,
    gps_timestamp: capturedAtIso,
    project_id: input.selection.projectId,
    org_id: input.orgId,
    asset_type: input.assetType,
    observation_type: input.selection.observationType,
    phase: input.selection.phase,
    app_version: input.appVersion,
    exif_hash: exifHash,
  };
  if (input.gpsFix.altitude_m !== undefined) {
    context['gps_altitude'] = String(input.gpsFix.altitude_m);
  }
  if (caption !== null) {
    context['caption'] = caption;
    if (input.captionLanguage !== undefined) {
      context['caption_language'] = input.captionLanguage;
    }
    context['caption_created_at'] = capturedAtIso;
  }

  const request: UploadRequest = {
    fileUri: input.fileUri,
    publicId: `${input.orgId}/${input.selection.projectId}/${sha256}`,
    context,
    metadata: { sha256, exif: frozenExif },
  };

  const item = ctx.queue.enqueue(request);
  return { ok: true, item };
}
