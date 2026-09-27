/**
 * Capture signing payload (AGENTS.md §3.4, ARCHITECTURE.md §3.1).
 *
 * `buildSigningPayload` produces the exact byte sequence the capture app signs:
 * the RFC 8785 canonical JSON of the claim set. The API re-derives the same
 * bytes from the stored columns and verifies the Ed25519 signature
 * independently — the client is untrusted, so the server never trusts a
 * signature it did not recompute the payload for.
 *
 * Any later edit to caption, phase, or location changes the canonical bytes and
 * therefore invalidates the signature. That is the integrity guarantee, not a
 * bug.
 */
import { sign as edSign, verify as edVerify, type KeyObject } from 'node:crypto';
import { z } from 'zod';
import { canonicalize, type JsonObject } from './canonicalize.js';
import { ASSET_PHASES, GPS_PROVIDERS } from './enums.js';

const hex = z.string().regex(/^[0-9a-f]+$/, 'must be lowercase hex');

/**
 * Scale factor for the integer encoding of GPS coordinates ("E7" / Android
 * LatLng convention): `lat_e7 = round(lat_degrees * 1e7)`. 1e-7° ≈ 1.1 cm, far
 * finer than any GPS fix, so no real capture loses precision.
 *
 * Coordinates are signed as **integers**, never floats, because the destination
 * column is `gps_point GEOGRAPHY(POINT, 4326)` (a double). Signing a float and
 * re-deriving it from PostGIS could differ in the last bits and break
 * verification (AGENTS.md §3.8). The API re-derives with
 * `round(ST_Y(gps_point) * 1e7)` / `round(ST_X(gps_point) * 1e7)`, which
 * reproduces the signed integer exactly.
 */
export const GPS_COORD_SCALE = 1e7;

/**
 * GPS fix included in the signed payload.
 *
 * `lat_e7` / `lon_e7` are integer E7 coordinates (see {@link GPS_COORD_SCALE}).
 * `accuracy_m` / `altitude_m` map to `float8` columns (`gps_accuracy_meters`,
 * `gps_altitude`) that round-trip a double exactly, so they stay numeric.
 */
export const SigningGpsSchema = z.object({
  lat_e7: z.number().int(),
  lon_e7: z.number().int(),
  accuracy_m: z.number().optional(),
  altitude_m: z.number().optional(),
  provider: z.enum(GPS_PROVIDERS).optional(),
});
export type SigningGps = z.infer<typeof SigningGpsSchema>;

/**
 * Input to {@link buildSigningPayload}. `v` pins the payload schema version.
 *
 * Every field is encoded so the API can reproduce it byte-for-byte from the
 * stored columns (AGENTS.md §3.4, §3.8):
 * - `captured_at_ms` is epoch milliseconds (integer), not an ISO string, because
 *   `device_capture_timestamp TIMESTAMPTZ` is normalized by Postgres and a
 *   free-form string would not round-trip. Re-derive with
 *   `round(extract(epoch from device_capture_timestamp) * 1000)`.
 * - `device_monotonic_ms` is signed here (DATABASE_SCHEMA.md `assets`) so the
 *   monotonic counter that anchors skew detection cannot be forged post-capture
 *   (AGENTS.md §3.7).
 * - `phase` is constrained to the same domain as `assets.phase`
 *   (`before` / `after`); a value the column cannot store must never be signed.
 */
export const SigningPayloadInputSchema = z.object({
  v: z.literal(1).default(1),
  sha256: hex,
  exif_hash: hex,
  captured_at_ms: z.number().int().nonnegative(),
  device_monotonic_ms: z.number().int().nonnegative(),
  gps: SigningGpsSchema,
  project_id: z.uuid(),
  observation_type: z.string().min(1),
  phase: z.enum(ASSET_PHASES),
  caption: z.string().nullable().default(null),
});
export type SigningPayloadInput = z.input<typeof SigningPayloadInputSchema>;

function toGpsObject(gps: SigningGps): JsonObject {
  return {
    lat_e7: gps.lat_e7,
    lon_e7: gps.lon_e7,
    accuracy_m: gps.accuracy_m,
    altitude_m: gps.altitude_m,
    provider: gps.provider,
  };
}

/**
 * Validate and canonicalize the signing claim set into the exact bytes to sign.
 *
 * @throws {z.ZodError} if the input is malformed (e.g. a non-hex hash, a bad
 *   UUID, or a missing required field). A malformed payload must never be
 *   signed, so validation failure is fatal, not silent.
 */
export function buildSigningPayload(input: SigningPayloadInput): string {
  const parsed = SigningPayloadInputSchema.parse(input);
  const payload: JsonObject = {
    v: parsed.v,
    sha256: parsed.sha256,
    exif_hash: parsed.exif_hash,
    captured_at_ms: parsed.captured_at_ms,
    device_monotonic_ms: parsed.device_monotonic_ms,
    gps: toGpsObject(parsed.gps),
    project_id: parsed.project_id,
    observation_type: parsed.observation_type,
    phase: parsed.phase,
    caption: parsed.caption,
  };
  return canonicalize(payload);
}

/** A key accepted by the Node crypto Ed25519 primitives. */
export type Ed25519Key = KeyObject | string | Buffer;

/**
 * Ed25519-sign a signing payload, returning a base64 signature.
 *
 * `privateKey` must be an Ed25519 private key. The message signed is the
 * canonical payload from {@link buildSigningPayload}, so signer and verifier
 * agree on bytes.
 */
export function signPayload(input: SigningPayloadInput, privateKey: Ed25519Key): string {
  const payload = buildSigningPayload(input);
  const signature = edSign(null, Buffer.from(payload, 'utf8'), privateKey);
  return signature.toString('base64');
}

/**
 * Verify a base64 Ed25519 signature over a signing payload.
 *
 * Returns `false` — never throwing — for a tampered payload or a signature made
 * with the wrong key, so a verification failure is a handled outcome and never
 * mistaken for a pass (AGENTS.md §3.6).
 */
export function verifyPayload(
  input: SigningPayloadInput,
  signatureBase64: string,
  publicKey: Ed25519Key,
): boolean {
  let payload: string;
  try {
    payload = buildSigningPayload(input);
  } catch {
    return false;
  }
  let signature: Buffer;
  try {
    signature = Buffer.from(signatureBase64, 'base64');
  } catch {
    return false;
  }
  try {
    return edVerify(null, Buffer.from(payload, 'utf8'), publicKey, signature);
  } catch {
    // A malformed key or signature is a verification failure, not a crash.
    return false;
  }
}
