/**
 * Ed25519 capture signing (BUILD_ORDER Phase 4 "Signing", AGENTS.md §3.4, §8).
 *
 * The device signs the RFC-8785 canonical signing payload built by the shared
 * package; the API re-derives the same bytes and verifies independently. Two
 * honesty rules are load-bearing:
 *
 *  1. `signature_tier` reports where the key actually lives. A Keystore /
 *     Secure-Enclave-wrapped key is `'device'`; a software fallback is `'server'`.
 *     Reporting `'device'` for a non-hardware key is a `FAIL` (AGENTS.md §8) — so
 *     the tier comes from the signer that produced the signature, never a guess.
 *  2. Any edit to the payload after signing (caption, phase, GPS…) changes the
 *     canonical bytes and invalidates the signature. That is the integrity
 *     guarantee, verified here with the shared `verifyPayload`.
 */
import * as ed from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha512';
import { buildSigningPayload } from '@panchnama/shared/rn';
import type { SignatureTier, SigningPayloadInput } from '@panchnama/shared/rn';
import type { CaptureSigner } from './ports.js';

// @noble/ed25519 v2 needs a SHA-512 wired in explicitly for sync verify.
ed.etc.sha512Sync = (...m: Uint8Array[]): Uint8Array => sha512(ed.etc.concatBytes(...m));

function base64ToBytes(b64: string): Uint8Array {
  const binary =
    typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('binary');
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

/** The signed capture claim, ready to attach to the Cloudinary upload context. */
export interface SignedCapture {
  /** Base64 Ed25519 signature over the canonical payload. */
  readonly signature: string;
  /** Base64 raw Ed25519 public key that verifies {@link signature}. */
  readonly devicePublicKey: string;
  /** Honest provenance of the key that signed (AGENTS.md §8). */
  readonly signatureTier: SignatureTier;
  /** The exact canonical bytes that were signed (kept for local verification). */
  readonly canonicalPayload: string;
}

/**
 * Build the canonical payload and sign it with `signer`. The returned
 * `signatureTier` is copied from the signer, so a fallback signer can only ever
 * yield `'server'` (see {@link resolveSigner}).
 */
export async function signCapture(
  input: SigningPayloadInput,
  signer: CaptureSigner,
): Promise<SignedCapture> {
  const canonicalPayload = buildSigningPayload(input);
  const message = new TextEncoder().encode(canonicalPayload);
  const signature = await signer.sign(message);
  const devicePublicKey = await signer.publicKeyBase64();
  return {
    signature,
    devicePublicKey,
    signatureTier: signer.signatureTier,
    canonicalPayload,
  };
}

/**
 * Local re-verification of a {@link SignedCapture} against a (possibly mutated)
 * payload. Returns `false` for any tampered field — never throwing — so the app
 * can refuse to enqueue an item it cannot itself verify (AGENTS.md §3.6).
 *
 * Uses pure-JS `@noble/ed25519` (RN-safe): the raw 32-byte public key and
 * 64-byte signature are verified directly against the canonical bytes, mirroring
 * the server's independent re-verification without needing `node:crypto`.
 */
export function verifyLocalCapture(
  input: SigningPayloadInput,
  signed: Pick<SignedCapture, 'signature' | 'devicePublicKey'>,
): boolean {
  try {
    const message = new TextEncoder().encode(buildSigningPayload(input));
    const signature = base64ToBytes(signed.signature);
    const publicKey = base64ToBytes(signed.devicePublicKey);
    return ed.verify(signature, message, publicKey);
  } catch {
    // A malformed key, signature, or payload is a verification failure, not a crash.
    return false;
  }
}

/**
 * Choose the signer honestly: prefer the hardware-backed Keystore signer, and
 * fall back to the software `'server'`-tier signer only when the hardware path is
 * unavailable. The fallback is reported as `'server'` — never relabelled
 * `'device'` — satisfying the §8 stop condition. `keystore` returning `null`
 * means "hardware unavailable on this device".
 */
export function resolveSigner(
  keystore: CaptureSigner | null,
  serverFallback: CaptureSigner,
): CaptureSigner {
  if (keystore !== null) {
    if (keystore.signatureTier !== 'device') {
      // A Keystore-backed signer that does not claim 'device' is a bug: it would
      // hide a fallback behind the hardware slot. Refuse rather than mislabel.
      throw new Error(
        `keystore signer must report signatureTier 'device', got '${keystore.signatureTier}'`,
      );
    }
    return keystore;
  }
  if (serverFallback.signatureTier !== 'server') {
    throw new Error(
      `fallback signer must report signatureTier 'server', got '${serverFallback.signatureTier}'`,
    );
  }
  return serverFallback;
}
