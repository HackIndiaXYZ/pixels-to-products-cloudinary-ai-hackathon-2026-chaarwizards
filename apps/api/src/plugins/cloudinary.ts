/**
 * Cloudinary adapter (AGENTS.md §3.9, §3.11). Cloudinary is a media pipeline,
 * never a query database — this adapter exposes signature verification, delivery
 * URL signing, and eager derivative creation, all through the official SDK v2
 * helpers. No HMAC is ever hand-rolled, and no Search/`resources_by_*`/`api.list()`
 * call appears anywhere in this file. Admin-API listing lives only in
 * `cloudinary-admin.ts` and is used solely by the reconciliation job.
 */
import { v2 as cloudinary } from 'cloudinary';
import type { UploadApiResponse } from 'cloudinary';
import type { Config } from '../config.js';
import type { CloudinaryPort, EagerDerivativeInput, EagerDerivativeResult } from '../ports.js';

/** Configure the shared SDK singleton once (server-only secret, never returned). */
export function configureCloudinary(config: Config): void {
  cloudinary.config({
    cloud_name: config.CLOUDINARY_CLOUD_NAME,
    api_key: config.CLOUDINARY_API_KEY,
    api_secret: config.CLOUDINARY_API_SECRET, // server-only; never returned
    secure: true,
  });
}

/** Typed view of the eager-transformation entries the SDK returns. */
export interface EagerEntry {
  readonly secure_url?: string;
  readonly url?: string;
  readonly bytes?: number;
  readonly status?: string;
}

/**
 * Decide whether an eager transformation is still being produced.
 *
 * Cloudinary reports async (`eager_async`) generative work as
 * `status: 'processing'` — and, transiently, `'pending'` — while returning the
 * destination URL immediately, before the bytes exist. It is complete only when
 * the status is `'complete'` (async) or absent altogether (a synchronous eager
 * finished inline). Any other state — `'processing'`, `'pending'`, `'failed'`,
 * or a missing entry — is NOT ready: the caller must record the derivative as
 * pending and never serve that URL yet (AGENTS.md §3.11, §3.6). Verified against
 * the live account, which returns `'processing'` for `e_gen_*`.
 */
export function isEagerPending(eager: EagerEntry | undefined): boolean {
  if (eager === undefined) {
    return true;
  }
  const status = eager.status;
  const isComplete = status === undefined || status === 'complete';
  const hasUrl = eager.secure_url !== undefined || eager.url !== undefined;
  return !(isComplete && hasUrl);
}

export function createCloudinaryAdapter(config: Config): CloudinaryPort {
  configureCloudinary(config);

  return {
    verifyNotificationSignature(body, timestamp, signature) {
      // SDK helper computes the expected signature; we never build it by hand.
      return cloudinary.utils.verifyNotificationSignature(
        body,
        Number(timestamp),
        signature,
      );
    },

    signedDerivativeUrl(publicId, transformation) {
      // Derivatives are `type: upload`, signed, no expiry (§3.11). The SDK
      // computes the HMAC-SHA1 signature.
      return cloudinary.url(publicId, {
        secure: true,
        resource_type: 'image',
        type: 'upload',
        sign_url: true,
        transformation:
          transformation.length > 0 ? [{ raw_transformation: transformation }] : undefined,
      });
    },

    originalUrl(publicId, ttlSeconds) {
      // Evidence assets uploaded via upload presets are stored with type 'upload' (§3.11).
      const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
      const url = cloudinary.url(publicId, {
        secure: true,
        resource_type: 'image',
        type: 'upload',
        sign_url: true,
      });
      return { url, expiresAt };
    },

    async createEagerDerivative(input: EagerDerivativeInput): Promise<EagerDerivativeResult> {
      // `explicit` applies eager transformations to an already-uploaded asset and
      // returns the derived asset. Generative transforms run asynchronously
      // (`eager_async`), so we never block a caller on them (§3.11).
      const response = (await cloudinary.uploader.explicit(input.sourcePublicId, {
        type: input.sourceType,
        resource_type: input.resourceType,
        eager: [{ raw_transformation: input.transformation }],
        eager_async: input.isGenerative,
      })) as UploadApiResponse & { eager?: EagerEntry[]; version?: number };

      const eager = response.eager?.[0];
      const pending = isEagerPending(eager);

      return {
        status: pending ? 'pending' : 'ready',
        publicId: response.public_id,
        secureUrl: pending ? null : (eager?.secure_url ?? eager?.url ?? null),
        bytes: eager?.bytes ?? null,
        cloudinaryAssetId: response.asset_id ?? null,
        version: response.version !== undefined ? String(response.version) : null,
      };
    },

    signRequest(params) {
      // SDK-computed signature (§3.11): proves signing is never string
      // concatenation plus a manual digest.
      return cloudinary.utils.api_sign_request(params, config.CLOUDINARY_API_SECRET);
    },

    async uploadArtifact(input) {
      // Report artifacts are stored as `raw` resources via the SDK uploader
      // (signed by the SDK, no hand-rolled HMAC — §3.11). This is a media
      // pipeline WRITE, never a query (§3.9). We upload from a data URI so the
      // in-memory bytes never touch disk.
      const dataUri =
        `data:${input.format === 'pdf' ? 'application/pdf' : 'text/html'};base64,` +
        input.bytes.toString('base64');
      const response = (await cloudinary.uploader.upload(dataUri, {
        public_id: `${input.publicId}.${input.format}`,
        resource_type: 'raw',
        type: 'authenticated',
        overwrite: false,
      })) as UploadApiResponse & { version?: number };
      return {
        url: response.secure_url ?? response.url,
        publicId: response.public_id,
        bytes: response.bytes ?? input.bytes.length,
        version: response.version !== undefined ? String(response.version) : null,
      };
    },
  };
}
