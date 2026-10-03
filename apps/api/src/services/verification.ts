/**
 * Independent, server-side verification of a captured asset . The client signs; the API re-derives and re-checks every claim it
 * can, and every check yields one of three honest states — `pass` / `fail` /
 * `unknown` — where only `fail` blocks a report and `unknown` is NEVER surfaced
 * as `pass` (§3.7).
 *
 * The EXIF hash and the Ed25519 signature cannot be reproduced in Postgres
 * (JCS whitespace/number formatting differs from `jsonb::text`, and Postgres has
 * no Ed25519 primitive), so those two checks live here and their outcome is
 * written back to `assets` for the SQL `verify_asset_integrity` to surface.
 */
import { sha256Canonical, verifyPayload, GPS_COORD_SCALE } from '@panchnama/shared';
import type { JsonValue, SigningPayloadInput } from '@panchnama/shared';
import type { VerificationState } from '@panchnama/shared';

/**
 * Re-canonicalize the frozen EXIF with RFC 8785 (JCS) and compare its SHA-256 to
 * the hash the device signed. A mismatch is a tampered-EXIF `fail`; a missing
 * input is `unknown`, never a silent pass.
 */
export function verifyExifHash(
  exif: Record<string, unknown> | null | undefined,
  claimedHash: string | null | undefined,
): VerificationState {
  if (exif === null || exif === undefined || !claimedHash) return 'unknown';
  const computed = sha256Canonical(exif as JsonValue);
  return computed === claimedHash ? 'pass' : 'fail';
}

/**
 * Verify the Ed25519 capture signature over the re-derived canonical payload.
 * Returns `fail` on any mismatch or malformed key/signature (verification never
 * throws), and `unknown` only when an input needed to attempt it is absent.
 */
export function verifyCaptureSignature(
  payload: SigningPayloadInput,
  signatureBase64: string | null | undefined,
  publicKeyBase64: string | null | undefined,
): VerificationState {
  if (!signatureBase64 || !publicKeyBase64) return 'unknown';
  let publicKey: Buffer;
  try {
    publicKey = Buffer.from(publicKeyBase64, 'base64');
  } catch {
    return 'fail';
  }
  const spkiPem = ed25519RawToPem(publicKey);
  const key = spkiPem ?? publicKey;
  return verifyPayload(payload, signatureBase64, key) ? 'pass' : 'fail';
}

/**
 * Wrap a raw 32-byte Ed25519 public key in the SPKI DER prefix and PEM-encode
 * it, so `crypto.verify` accepts a key that was transmitted as raw bytes.
 * Returns null if the input is not a 32-byte raw key (it may already be a PEM/DER
 * key, which the verifier handles directly).
 */
function ed25519RawToPem(raw: Buffer): string | null {
  if (raw.length !== 32) return null;
  // SPKI header for Ed25519: SEQUENCE { SEQUENCE { OID 1.3.101.112 } BIT STRING }.
  const prefix = Buffer.from('302a300506032b6570032100', 'hex');
  const der = Buffer.concat([prefix, raw]);
  const b64 = der.toString('base64').replace(/(.{64})/g, '$1\n');
  return `-----BEGIN PUBLIC KEY-----\n${b64}\n-----END PUBLIC KEY-----\n`;
}

/** Convert decimal degrees to the signed integer E7 encoding the payload uses. */
export function toE7(degrees: number): number {
  return Math.round(degrees * GPS_COORD_SCALE);
}

/**
 * Collapse the individual checks into the persisted `verification` state. Any
 * `fail` fails the asset (it is quarantined); otherwise, if every check passed it
 * is `passed`; a remaining `unknown` keeps the asset `unknown` — never `passed`.
 */
export function overallVerification(
  states: readonly VerificationState[],
): 'passed' | 'failed' | 'unknown' {
  if (states.includes('fail')) return 'failed';
  if (states.some((s) => s === 'unknown')) return 'unknown';
  return 'passed';
}
