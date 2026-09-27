import { AdvancedImage } from '@cloudinary/react';
import { format, quality } from '@cloudinary/url-gen/actions/delivery';
import { scale } from '@cloudinary/url-gen/actions/resize';
import { cld } from '../cloudinary/config';

export interface CldImageProps {
  /** Cloudinary public id resolved from Postgres — never a client guess (AGENTS.md §3.11). */
  publicId: string;
  alt: string;
  width?: number;
}

/**
 * Thin, typed wrapper over the official `@cloudinary/react` `AdvancedImage`
 * (AGENTS.md §4). Named `CldImage` to match the BUILD_ORDER Phase 0 gate.
 * URLs are built with `@cloudinary/url-gen` (`cld.image(...)`), never
 * hand-written strings.
 */
export function CldImage({ publicId, alt, width }: CldImageProps) {
  const img = cld.image(publicId).delivery(format('auto')).delivery(quality('auto'));
  if (width !== undefined) {
    img.resize(scale().width(width));
  }
  return <AdvancedImage cldImg={img} alt={alt} />;
}
