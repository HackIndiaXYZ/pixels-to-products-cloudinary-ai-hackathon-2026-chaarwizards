import { CloudinaryImage } from '@cloudinary/url-gen';
import { limitFit } from '@cloudinary/url-gen/actions/resize';
import type { AssetType } from '../types/database';

const env: Record<string, string | undefined> = import.meta.env;

const cloudName: string | undefined = env.VITE_CLOUDINARY_CLOUD_NAME;

/** A media reference resolved by the API route under RLS. The client never supplies a
 *  `public_id`; it asks by `asset_id` and the server resolves the resource for the caller's org. */
export interface AssetMediaRef {
  assetId: string;
  assetType: AssetType;
  publicId: string | null;
  /** Server-signed delivery base. Required for originals, which are `type: authenticated`. */
  signedDeliveryUrl: string | null;
  authenticated: boolean;
  width: number | null;
  height: number | null;
}

export interface DeliveryOptions {
  maxWidth: number;
  maxHeight: number;
}

/** Builds a delivery URL with `@cloudinary/url-gen`. Hand-written Cloudinary URL strings are
 *  never constructed anywhere in this codebase. Returns null when the reference cannot produce
 *  a URL, and the caller renders `Unavailable`. */
export function buildDeliveryUrl(ref: AssetMediaRef, options: DeliveryOptions): string | null {
  if (ref.authenticated && ref.signedDeliveryUrl !== null) {
    return ref.signedDeliveryUrl;
  }
  if (ref.publicId === null || cloudName === undefined || cloudName.length === 0) return null;
  const image = new CloudinaryImage(ref.publicId, { cloudName });
  return image
    .resize(limitFit().width(options.maxWidth).height(options.maxHeight))
    .quality('auto')
    .toURL();
}

/** Intrinsic ratio from the measured dimensions, so a content-bearing image is never forced into
 *  a box with a different fixed ratio. */
export function mediaAspectRatio(ref: AssetMediaRef): string | null {
  const width = ref.width;
  const height = ref.height;
  if (width === null || height === null || width <= 0 || height <= 0) return null;
  return `${width} / ${height}`;
}
