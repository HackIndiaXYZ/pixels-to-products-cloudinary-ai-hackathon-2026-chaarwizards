/**
 * Cloudinary adapter (AGENTS.md §3.9, §3.11). Cloudinary is a media pipeline,
 * never a query database — this adapter exposes only signature verification and
 * delivery-URL signing, both through the official SDK v2 helpers. No HMAC is
 * ever hand-rolled, and no Search/`resources_by_*`/`api.list()` call appears
 * anywhere in this file.
 */
import { v2 as cloudinary } from 'cloudinary';
import type { Config } from '../config.js';
import type { CloudinaryPort } from '../ports.js';

export function createCloudinaryAdapter(config: Config): CloudinaryPort {
  cloudinary.config({
    cloud_name: config.CLOUDINARY_CLOUD_NAME,
    api_key: config.CLOUDINARY_API_KEY,
    api_secret: config.CLOUDINARY_API_SECRET, // server-only; never returned
    secure: true,
  });

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
        transformation: transformation.length > 0 ? transformation : undefined,
      });
    },

    originalUrl(publicId, ttlSeconds) {
      // Originals are `type: authenticated`; real expiry comes from the
      // auth_token, not from the version segment (§3.11).
      const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
      const url = cloudinary.url(publicId, {
        secure: true,
        resource_type: 'image',
        type: 'authenticated',
        sign_url: true,
        auth_token: {
          key: config.CLOUDINARY_API_SECRET,
          duration: ttlSeconds,
        },
      });
      return { url, expiresAt };
    },
  };
}
