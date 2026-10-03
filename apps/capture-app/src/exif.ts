/**
 * EXIF freeze (Phase "EXIF freeze", system invariants).
 *
 * A captured image carries dozens of EXIF tags, many of them editable
 * (`Software`, `DateTimeOriginal`, GPS blocks, maker notes). We keep only a
 * small allowlist of hardware-descriptive tags and discard everything else
 * *before* hashing, so the frozen EXIF cannot smuggle a mutable field into the
 * signed evidence. The device's `exif_hash` is the SHA-256 of the RFC-8785
 * canonical form of the frozen object, which is byte-identical to the server's
 * independent re-hash (`apps/api` verification `verifyExifHash`, system invariants).
 */
import { sha256Canonical } from '@panchnama/shared/rn';
import type { JsonValue } from '@panchnama/shared/rn';
import type { RawExif } from './ports.js';

/**
 * The only EXIF keys that survive into the hash. All are read-only descriptions
 * of the capturing hardware and pixel geometry; none is user-editable after
 * capture. Anything not in this list — notably `Software`, `DateTimeOriginal`,
 * and GPS tags — is discarded (Phase).
 */
export const EXIF_ALLOWLIST = [
  'Make',
  'Model',
  'LensModel',
  'Orientation',
  'ColorSpace',
  'ImageWidth',
  'ImageHeight',
] as const;

export type FrozenExifKey = (typeof EXIF_ALLOWLIST)[number];

const ALLOWLIST_SET: ReadonlySet<string> = new Set(EXIF_ALLOWLIST);

/** JSON-serializable EXIF value; maker notes / binary blobs are dropped. */
type ExifScalar = string | number | boolean;

function isExifScalar(value: unknown): value is ExifScalar {
  const t = typeof value;
  return t === 'string' || t === 'number' || t === 'boolean';
}

/**
 * Project raw EXIF down to the allowlist. Keys are emitted in `EXIF_ALLOWLIST`
 * order and only when present with a scalar value, so the frozen object is a
 * deterministic function of the source — an injected `Software` or
 * `DateTimeOriginal` tag simply is not carried, and therefore cannot change the
 * hash (proven in `exif.test.ts`).
 */
export function freezeExif(raw: RawExif): Record<FrozenExifKey, ExifScalar> {
  const frozen: Partial<Record<FrozenExifKey, ExifScalar>> = {};
  for (const key of EXIF_ALLOWLIST) {
    if (!Object.prototype.hasOwnProperty.call(raw, key)) continue;
    const value = raw[key];
    if (!ALLOWLIST_SET.has(key)) continue;
    if (isExifScalar(value)) {
      frozen[key] = value;
    }
  }
  return frozen as Record<FrozenExifKey, ExifScalar>;
}

/**
 * Compute the device `exif_hash`: SHA-256 over the RFC-8785 canonical JSON of the
 * frozen EXIF. Delegates to the shared `sha256Canonical` so the bytes match the
 * server's re-hash exactly . On React Native, where `node:crypto`
 * is unavailable, hash {@link canonicalFrozenExif} with a native SHA-256 instead.
 */
export function computeExifHash(raw: RawExif): string {
  return sha256Canonical(freezeExif(raw) as JsonValue);
}
