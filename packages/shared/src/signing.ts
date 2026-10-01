/**
 * Ed25519 sign/verify primitives (AGENTS.md §3.4, §3.6).
 *
 * These need `node:crypto`, so they live apart from the pure payload builder in
 * `signing-payload.ts`. This module re-exports the entire payload surface, so
 * the `@panchnama/shared` barrel (`.`) is unchanged for Node consumers such as the
 * API. React Native, which has no `node:crypto`, imports the pure surface from
 * `@panchnama/shared/rn` and never loads this module.
 */
import { sign as edSign, verify as edVerify, type KeyObject } from 'node:crypto';
import { buildSigningPayload, type SigningPayloadInput } from './signing-payload.js';

// Re-export the pure payload surface so `export * from './signing.js'` in the
// barrel keeps yielding buildSigningPayload, the schemas, types, and constants.
export * from './signing-payload.js';

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
